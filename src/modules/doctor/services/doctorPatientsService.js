import { Op } from "sequelize";
import {
    Appointment,
    AppointmentStatus,
    Consultation,
    Diagnosis,
    Doctor,
    Patient,
    Prescription,
    PrescriptionItem,
    Specialities,
} from "../../../models/associations.js";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 120;
const BOGOTA_TIME_ZONE = "America/Bogota";

function createServiceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parsePositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
    if (value === undefined || value === null || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
        throw createServiceError("Los parámetros de paginación no son válidos.", 400);
    }
    return parsed;
}

function normalizeSearch(value) {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") throw createServiceError("La búsqueda no es válida.", 400);
    const search = value.trim().replace(/\s+/g, " ");
    if (search.length > MAX_SEARCH_LENGTH) {
        throw createServiceError("La búsqueda supera la longitud permitida.", 400);
    }
    return search;
}

function createPatientSearchWhere(search) {
    if (!search) return {};
    const words = search.split(" ");
    return {
        [Op.or]: [
            { document_number: { [Op.like]: `%${search}%` } },
            { phone: { [Op.like]: `%${search}%` } },
            {
                [Op.and]: words.map((word) => ({
                    [Op.or]: [
                        { first_name: { [Op.like]: `%${word}%` } },
                        { last_name: { [Op.like]: `%${word}%` } },
                    ],
                })),
            },
        ],
    };
}

function formatDate(date, options) {
    if (!date) return null;
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return null;
    return new Intl.DateTimeFormat("es-CO", {
        ...options,
        timeZone: BOGOTA_TIME_ZONE,
    }).format(value);
}

function normalizeProfilePhotoUrl(value) {
    return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
        ? value
        : null;
}

function formatPatientListRow(patient, lastAppointmentAt) {
    const firstName = patient.first_name;
    const lastName = patient.last_name;
    return {
        id: patient.id,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim(),
        documentType: patient.document_type,
        documentNumber: patient.document_number,
        profilePhotoUrl: normalizeProfilePhotoUrl(patient.profile_photo_url),
        lastAppointmentAt,
        lastAppointmentLabel: formatDate(lastAppointmentAt, {
            day: "2-digit",
            month: "short",
            year: "numeric",
        }),
    };
}

async function getDoctor(userId) {
    const doctor = await Doctor.findOne({
        where: { user_id: userId },
        attributes: ["id", "display_name", "profile_photo_url"],
    });
    if (!doctor) throw createServiceError("No se encontró el perfil médico.", 404);
    return doctor;
}

/** Return the authenticated doctor's identity for shared doctor page headers. */
export async function getDoctorHeaderData(userId) {
    const doctor = await getDoctor(userId);
    return {
        doctorName: doctor.display_name || "Médico",
        doctorPhotoUrl: normalizeProfilePhotoUrl(doctor.profile_photo_url),
    };
}

/** Return a paginated, unique patient list derived from the doctor's own appointments. */
export async function getDoctorPatients(userId, query = {}) {
    const doctor = await getDoctor(userId);
    const search = normalizeSearch(query.search);
    const page = parsePositiveInteger(query.page, 1);
    const pageSize = parsePositiveInteger(query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const result = await Patient.findAndCountAll({
        where: createPatientSearchWhere(search),
        attributes: [
            "id",
            "first_name",
            "last_name",
            "document_type",
            "document_number",
            "profile_photo_url",
        ],
        include: [
            {
                model: Appointment,
                as: "appointments",
                attributes: [],
                required: true,
                where: { doctor_id: doctor.id },
            },
        ],
        distinct: true,
        col: "id",
        order: [
            ["last_name", "ASC"],
            ["first_name", "ASC"],
            ["id", "ASC"],
        ],
        limit: pageSize,
        offset: (page - 1) * pageSize,
    });

    const totalPages = Math.max(1, Math.ceil(result.count / pageSize));
    const currentPage = Math.min(page, totalPages);
    const patients =
        currentPage === page
            ? result.rows
            : await Patient.findAll({
                  where: createPatientSearchWhere(search),
                  attributes: [
                      "id",
                      "first_name",
                      "last_name",
                      "document_type",
                      "document_number",
                      "profile_photo_url",
                  ],
                  include: [
                      {
                          model: Appointment,
                          as: "appointments",
                          attributes: [],
                          required: true,
                          where: { doctor_id: doctor.id },
                      },
                  ],
                  distinct: true,
                  order: [
                      ["last_name", "ASC"],
                      ["first_name", "ASC"],
                      ["id", "ASC"],
                  ],
                  limit: pageSize,
                  offset: (currentPage - 1) * pageSize,
              });

    const patientIds = patients.map(({ id }) => id);
    const lastAppointmentRows = patientIds.length
        ? await Appointment.findAll({
              where: {
                  doctor_id: doctor.id,
                  patient_id: patientIds,
                  start_at: { [Op.lte]: new Date() },
              },
              attributes: [
                  "patient_id",
                  [
                      Appointment.sequelize.fn("MAX", Appointment.sequelize.col("start_at")),
                      "last_appointment_at",
                  ],
              ],
              group: ["patient_id"],
              raw: true,
          })
        : [];
    const lastAppointmentByPatient = new Map(
        lastAppointmentRows.map((row) => [Number(row.patient_id), row.last_appointment_at]),
    );

    return {
        patients: patients.map((patient) =>
            formatPatientListRow(patient, lastAppointmentByPatient.get(patient.id) || null),
        ),
        pagination: {
            page: currentPage,
            pageSize,
            totalItems: result.count,
            totalPages,
        },
        search,
    };
}

/** Return a patient's appointments and completed consultations only when assigned to this doctor. */
export async function getDoctorPatientDetails(userId, rawPatientId) {
    const patientId = Number(rawPatientId);
    if (!Number.isSafeInteger(patientId) || patientId < 1) {
        throw createServiceError("El identificador del paciente no es válido.", 400);
    }

    const doctor = await getDoctor(userId);
    const relationship = await Appointment.findOne({
        where: { doctor_id: doctor.id, patient_id: patientId },
        attributes: ["id"],
    });
    if (!relationship) throw createServiceError("No encontramos este paciente en tus citas.", 404);

    const patient = await Patient.findByPk(patientId, {
        attributes: [
            "id",
            "first_name",
            "last_name",
            "document_type",
            "document_number",
            "profile_photo_url",
        ],
    });
    if (!patient) throw createServiceError("No encontramos este paciente en tus citas.", 404);

    const appointments = await Appointment.findAll({
        where: { doctor_id: doctor.id, patient_id: patient.id },
        attributes: ["id", "start_at", "end_at", "reason"],
        include: [
            { model: AppointmentStatus, as: "status", attributes: ["name"], required: true },
            { model: Specialities, as: "specialty", attributes: ["name"], required: true },
        ],
        order: [["start_at", "DESC"]],
    });

    const consultations = await Consultation.findAll({
        where: { status: "Completed", doctor_id: doctor.id },
        attributes: [
            "id",
            "started_at",
            "ended_at",
            "duration_seconds",
            "symptoms",
            "patient_feeling",
            "vital_signs",
            "clinical_notes",
            "recommendations",
            "medical_orders",
        ],
        include: [
            {
                model: Appointment,
                as: "appointment",
                required: true,
                where: { doctor_id: doctor.id, patient_id: patient.id },
                attributes: ["id", "start_at", "reason"],
                include: [{ model: Specialities, as: "specialty", attributes: ["name"] }],
            },
            { model: Diagnosis, as: "diagnoses", attributes: ["id", "diagnosis", "notes"] },
            {
                model: Prescription,
                as: "prescriptions",
                attributes: ["id", "issued_at", "notes"],
                include: [
                    {
                        model: PrescriptionItem,
                        as: "items",
                        attributes: [
                            "id",
                            "medication_name",
                            "dosage",
                            "frequency",
                            "duration",
                            "instructions",
                        ],
                    },
                ],
            },
        ],
        order: [["started_at", "DESC"]],
    });

    return {
        patient: {
            id: patient.id,
            firstName: patient.first_name,
            lastName: patient.last_name,
            displayName: `${patient.first_name} ${patient.last_name}`.trim(),
            documentType: patient.document_type,
            documentNumber: patient.document_number,
            profilePhotoUrl: normalizeProfilePhotoUrl(patient.profile_photo_url),
        },
        appointments: appointments.map((appointment) => {
            const record = appointment.get({ plain: true });
            return {
                id: record.id,
                startsAt: record.start_at,
                dateLabel: formatDate(record.start_at, {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                }),
                timeLabel: formatDate(record.start_at, {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                }),
                reason: record.reason,
                status: record.status?.name || "",
                specialty: record.specialty?.name || "Consulta médica",
            };
        }),
        clinicalHistory: consultations.map((consultation) => {
            const record = consultation.get({ plain: true });
            const appointment = record.appointment;
            return {
                id: record.id,
                startedAt: record.started_at,
                dateLabel: formatDate(record.started_at, {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                }),
                timeLabel: formatDate(record.started_at, {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                }),
                specialty: appointment?.specialty?.name || "Consulta médica",
                reason: appointment?.reason || record.symptoms,
                symptoms: record.symptoms,
                patientFeeling: record.patient_feeling,
                vitalSigns: record.vital_signs || {},
                clinicalNotes: record.clinical_notes,
                recommendations: record.recommendations,
                medicalOrders: Array.isArray(record.medical_orders) ? record.medical_orders : [],
                diagnoses: record.diagnoses || [],
                prescriptions: record.prescriptions || [],
            };
        }),
    };
}

/** Load initial server-rendered list and an authorized patient detail, when one exists. */
export async function getDoctorPatientsPage(userId, query = {}) {
    const result = await getDoctorPatients(userId, query);
    const requestedPatientId = query.patientId;
    const selectedPatient =
        result.patients.find((patient) => String(patient.id) === String(requestedPatientId)) ||
        result.patients[0] ||
        null;
    const details = selectedPatient
        ? await getDoctorPatientDetails(userId, selectedPatient.id)
        : null;
    return { ...result, selectedPatientId: selectedPatient?.id || null, details };
}
