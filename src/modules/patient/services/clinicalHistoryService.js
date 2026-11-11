import { literal } from "sequelize";
import {
    Appointment,
    Consultation,
    Diagnosis,
    Doctor,
    Patient,
    Prescription,
    PrescriptionItem,
    Specialities,
} from "../../../models/associations.js";
import { AppointmentError } from "../errors/appointmentError.js";

const BOGOTA_TIME_ZONE = "America/Bogota";
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE = 20_000;

function parsePositiveInteger(value, defaultValue, fieldName, maximum) {
    if (value === undefined || value === "") return defaultValue;
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        throw new AppointmentError(`El valor de ${fieldName} no es válido.`, 400);
    }

    const parsedValue = Number(value);
    if (!Number.isSafeInteger(parsedValue) || parsedValue < 1 || parsedValue > maximum) {
        throw new AppointmentError(`El valor de ${fieldName} no es válido.`, 400);
    }
    return parsedValue;
}

function formatConsultationDate(date) {
    return new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: BOGOTA_TIME_ZONE,
    }).format(date);
}

function formatConsultationTime(date) {
    return new Intl.DateTimeFormat("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: BOGOTA_TIME_ZONE,
    }).format(date);
}

function formatConsultation(consultation) {
    const record = consultation.get({ plain: true });
    const startedAt = new Date(record.started_at);

    return {
        id: record.id,
        date_label: formatConsultationDate(startedAt),
        time_label: `${formatConsultationTime(startedAt)}${record.ended_at ? ` - ${formatConsultationTime(new Date(record.ended_at))}` : ""}`,
        specialty_label: record.appointment?.specialty?.name || "Consulta médica",
        doctor_label: record.doctor?.display_name || "Profesional de salud",
        doctor_photo_url: record.doctor?.profile_photo_url || null,
        diagnosis_count: Number(record.diagnosis_count || 0),
        treatment_count: Number(record.treatment_count || 0),
    };
}

async function getPatientId(userId) {
    const patient = await Patient.findOne({
        where: { user_id: userId },
        attributes: ["id"],
    });
    return patient?.id || null;
}

function getConsultationSummaryQuery(patientId) {
    return {
        where: { status: "Completed" },
        attributes: [
            "id",
            "started_at",
            "ended_at",
            [
                literal(
                    "(SELECT COUNT(*) FROM diagnoses AS patient_diagnosis WHERE patient_diagnosis.consultation_id = Consultation.id)",
                ),
                "diagnosis_count",
            ],
            [
                literal(
                    "(SELECT COUNT(*) FROM prescriptions AS patient_prescription INNER JOIN prescription_items AS patient_item ON patient_item.prescription_id = patient_prescription.id WHERE patient_prescription.consultation_id = Consultation.id)",
                ),
                "treatment_count",
            ],
        ],
        include: [
            {
                model: Appointment,
                as: "appointment",
                required: true,
                where: { patient_id: patientId },
                attributes: ["id"],
                include: [{ model: Specialities, as: "specialty", attributes: ["name"] }],
            },
            { model: Doctor, as: "doctor", attributes: ["display_name", "profile_photo_url"] },
        ],
        order: [
            ["started_at", "DESC"],
            ["id", "DESC"],
        ],
    };
}

export async function getPatientClinicalHistory(userId, query = {}) {
    const page = parsePositiveInteger(query.page, 1, "página", MAX_PAGE);
    const pageSize = parsePositiveInteger(
        query.pageSize,
        DEFAULT_PAGE_SIZE,
        "tamaño de página",
        50,
    );
    if (!PAGE_SIZE_OPTIONS.includes(pageSize)) {
        throw new AppointmentError("El tamaño de página seleccionado no es válido.", 400);
    }

    const patientId = await getPatientId(userId);
    if (!patientId) {
        return {
            consultations: [],
            totals: { consultations: 0, diagnoses: 0, treatments: 0 },
            pagination: {
                page: 1,
                pageSize,
                total: 0,
                totalPages: 0,
                firstResult: 0,
                lastResult: 0,
            },
        };
    }

    const summaryQuery = getConsultationSummaryQuery(patientId);
    const [total, diagnosisTotal, treatmentTotal] = await Promise.all([
        Consultation.count({ ...summaryQuery, distinct: true }),
        Diagnosis.count({
            include: [
                {
                    model: Consultation,
                    as: "consultation",
                    required: true,
                    where: { status: "Completed" },
                    include: [
                        {
                            model: Appointment,
                            as: "appointment",
                            required: true,
                            where: { patient_id: patientId },
                            attributes: [],
                        },
                    ],
                    attributes: [],
                },
            ],
            distinct: true,
        }),
        PrescriptionItem.count({
            include: [
                {
                    model: Prescription,
                    as: "prescription",
                    required: true,
                    include: [
                        {
                            model: Consultation,
                            as: "consultation",
                            required: true,
                            where: { status: "Completed" },
                            include: [
                                {
                                    model: Appointment,
                                    as: "appointment",
                                    required: true,
                                    where: { patient_id: patientId },
                                    attributes: [],
                                },
                            ],
                            attributes: [],
                        },
                    ],
                    attributes: [],
                },
            ],
            distinct: true,
        }),
    ]);
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const consultations = await Consultation.findAll({
        ...summaryQuery,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
    });
    const offset = total === 0 ? 0 : (currentPage - 1) * pageSize;

    return {
        consultations: consultations.map(formatConsultation),
        totals: { consultations: total, diagnoses: diagnosisTotal, treatments: treatmentTotal },
        pagination: {
            page: currentPage,
            pageSize,
            total,
            totalPages,
            firstResult: total === 0 ? 0 : offset + 1,
            lastResult: Math.min(offset + pageSize, total),
        },
    };
}

export async function getPatientClinicalHistoryDetail(userId, consultationId) {
    if (typeof consultationId !== "string" || !/^\d+$/.test(consultationId)) {
        throw new AppointmentError("La consulta solicitada no es válida.", 400);
    }
    const parsedId = Number(consultationId);
    if (!Number.isSafeInteger(parsedId) || parsedId < 1 || parsedId > 4_294_967_295) {
        throw new AppointmentError("La consulta solicitada no es válida.", 400);
    }

    const patientId = await getPatientId(userId);
    if (!patientId) throw new AppointmentError("No encontramos la consulta solicitada.", 404);

    const consultation = await Consultation.findOne({
        where: { id: parsedId, status: "Completed" },
        attributes: [
            "id",
            "started_at",
            "ended_at",
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
                where: { patient_id: patientId },
                attributes: ["id"],
                include: [{ model: Specialities, as: "specialty", attributes: ["name"] }],
            },
            { model: Doctor, as: "doctor", attributes: ["display_name", "profile_photo_url"] },
            { model: Diagnosis, as: "diagnoses", attributes: ["diagnosis", "notes"] },
            {
                model: Prescription,
                as: "prescriptions",
                attributes: ["id"],
                include: [
                    {
                        model: PrescriptionItem,
                        as: "items",
                        attributes: [
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
    });

    if (!consultation) throw new AppointmentError("No encontramos la consulta solicitada.", 404);

    const record = consultation.get({ plain: true });
    const summary = formatConsultation(consultation);
    return {
        ...summary,
        symptoms: record.symptoms,
        patient_feeling: record.patient_feeling,
        vital_signs: record.vital_signs,
        clinical_notes: record.clinical_notes,
        recommendations: record.recommendations,
        medical_orders: record.medical_orders,
        diagnoses: record.diagnoses || [],
        prescriptions: record.prescriptions || [],
    };
}
