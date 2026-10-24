import database from "../../../../config/database.js";
import {
    Appointment,
    AppointmentHistory,
    AppointmentStatus,
    Consultation,
    Diagnosis,
    Doctor,
    Patient,
    Prescription,
    PrescriptionItem,
    Specialities,
} from "../../../models/associations.js";

const CONFIRMED_STATUS = "Confirmed";
const IN_PROGRESS_APPOINTMENT_STATUS = "In Progress";
const ACTIVE_CONSULTATION_STATUS = "InProgress";
const COMPLETED_CONSULTATION_STATUS = "Completed";
const COMPLETED_APPOINTMENT_STATUS = "Attended";

function createServiceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseAppointmentId(value) {
    const appointmentId = Number(value);
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
        throw createServiceError("El identificador de la cita no es válido.", 400);
    }
    return appointmentId;
}

/** Start an assigned confirmed appointment and its consultation atomically. */
export async function startDoctorConsultation(userId, rawAppointmentId) {
    const appointmentId = parseAppointmentId(rawAppointmentId);

    return database.transaction(async (transaction) => {
        // Locking the doctor serializes consultation starts for the same doctor.
        const doctor = await Doctor.findOne({
            where: { user_id: userId },
            attributes: ["id"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!doctor) {
            throw createServiceError("No se encontró el perfil médico.", 404);
        }

        // Lock the appointment to prevent simultaneous state changes while it starts.
        const appointment = await Appointment.findOne({
            where: { id: appointmentId, doctor_id: doctor.id },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!appointment) {
            throw createServiceError("No encontramos una cita asignada a tu perfil.", 404);
        }

        const appointmentStatus = await AppointmentStatus.findByPk(appointment.status_id, {
            attributes: ["id", "name"],
            transaction,
        });

        if (appointmentStatus?.name !== CONFIRMED_STATUS) {
            throw createServiceError("Solo puedes iniciar una cita confirmada.", 409);
        }

        const activeConsultation = await Consultation.findOne({
            where: { doctor_id: doctor.id, status: ACTIVE_CONSULTATION_STATUS },
            attributes: ["id"],
            transaction,
        });

        if (activeConsultation) {
            throw createServiceError(
                "Ya tienes una consulta en curso. Termínala antes de iniciar otra.",
                409,
            );
        }

        const inProgressStatus = await AppointmentStatus.findOne({
            where: { name: IN_PROGRESS_APPOINTMENT_STATUS },
            attributes: ["id"],
            transaction,
        });

        if (!inProgressStatus) {
            throw new Error("The In Progress appointment status is not configured.");
        }

        const startedAt = new Date();
        const consultation = await Consultation.create(
            {
                appointment_id: appointment.id,
                doctor_id: doctor.id,
                started_at: startedAt,
                status: ACTIVE_CONSULTATION_STATUS,
            },
            { transaction },
        );

        await appointment.update({ status_id: inProgressStatus.id }, { transaction });

        // Keep an audit entry for the appointment state transition.
        await AppointmentHistory.create(
            {
                appointment_id: appointment.id,
                actor_user_id: userId,
                actor_snapshot: `Doctor ${doctor.id}`,
                event_type: "ConsultationStarted",
                previous_values: { status: CONFIRMED_STATUS },
                new_values: {
                    status: IN_PROGRESS_APPOINTMENT_STATUS,
                    consultation_id: consultation.id,
                    started_at: startedAt.toISOString(),
                },
                reason: "Doctor started the appointment consultation.",
                occurred_at: startedAt,
            },
            { transaction },
        );

        return {
            message: "La consulta comenzó correctamente.",
            consultation: {
                id: consultation.id,
                appointmentId: appointment.id,
                status: consultation.status,
                startedAt: consultation.started_at,
            },
        };
    });
}

function parseConsultationId(value) {
    const consultationId = Number(value);
    if (!Number.isSafeInteger(consultationId) || consultationId < 1) {
        throw createServiceError("El identificador de la consulta no es válido.", 400);
    }
    return consultationId;
}

function normalizeText(value, field, maxLength, required = false) {
    if (value === undefined || value === null) {
        if (required) throw createServiceError(`${field} es obligatorio.`, 400);
        return null;
    }
    if (typeof value !== "string") throw createServiceError(`${field} no es válido.`, 400);
    const normalized = value.trim();
    if ((required && !normalized) || normalized.length > maxLength) {
        throw createServiceError(`${field} no es válido.`, 400);
    }
    return normalized || null;
}

function normalizeDraft(payload, { completing = false } = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createServiceError("La información de la consulta no es válida.", 400);
    }

    const symptoms = normalizeText(payload.symptoms, "El motivo de consulta", 5000, completing);
    const patientFeeling = normalizeText(payload.patientFeeling, "La condición del paciente", 5000);
    const clinicalNotes = normalizeText(
        payload.clinicalNotes,
        "La evaluación médica",
        10000,
        completing,
    );
    const recommendations = normalizeText(payload.recommendations, "Las recomendaciones", 10000);
    const vitalSigns = payload.vitalSigns ?? null;
    if (vitalSigns !== null && (typeof vitalSigns !== "object" || Array.isArray(vitalSigns))) {
        throw createServiceError("Los signos vitales no son válidos.", 400);
    }
    const vitalRanges = {
        heartRate: [0, 300],
        temperature: [25, 45],
        weight: [0, 500],
        height: [0, 3],
        bmi: [0, 150],
    };
    if (
        vitalSigns &&
        Object.entries(vitalSigns).some(([key, value]) => {
            if (!["bloodPressure", ...Object.keys(vitalRanges)].includes(key)) return true;
            if (value === null || value === "") return false;
            if (key === "bloodPressure")
                return typeof value !== "string" || !/^\d{2,3}\/\d{2,3}$/.test(value);
            return (
                !Number.isFinite(Number(value)) ||
                Number(value) < vitalRanges[key][0] ||
                Number(value) > vitalRanges[key][1]
            );
        })
    ) {
        throw createServiceError("Revisa los valores de los signos vitales.", 400);
    }

    const diagnoses = payload.diagnoses ?? [];
    if (!Array.isArray(diagnoses) || diagnoses.length > 50) {
        throw createServiceError("La lista de diagnósticos no es válida.", 400);
    }
    const normalizedDiagnoses = diagnoses.map((entry) => {
        if (!entry || typeof entry !== "object")
            throw createServiceError("Hay un diagnóstico no válido.", 400);
        return {
            diagnosis: normalizeText(entry.diagnosis, "El diagnóstico", 500, true),
            notes: normalizeText(entry.notes, "Las notas del diagnóstico", 5000),
        };
    });
    if (completing && normalizedDiagnoses.length === 0) {
        throw createServiceError("Agrega al menos un diagnóstico antes de finalizar.", 400);
    }

    const prescriptionItems = payload.prescriptionItems ?? [];
    if (!Array.isArray(prescriptionItems) || prescriptionItems.length > 50) {
        throw createServiceError("La lista de tratamientos no es válida.", 400);
    }
    const normalizedItems = prescriptionItems.map((item) => {
        if (!item || typeof item !== "object")
            throw createServiceError("Hay un tratamiento no válido.", 400);
        return {
            medication_name: normalizeText(item.medicationName, "El medicamento", 150, true),
            dosage: normalizeText(item.dosage, "La dosis", 100, true),
            frequency: normalizeText(item.frequency, "La frecuencia", 100, true),
            duration: normalizeText(item.duration, "La duración", 100, true),
            instructions: normalizeText(item.instructions, "Las instrucciones", 5000),
        };
    });

    const medicalOrders = payload.medicalOrders ?? [];
    if (
        !Array.isArray(medicalOrders) ||
        medicalOrders.length > 30 ||
        medicalOrders.some((order) => typeof order !== "string" || order.trim().length > 1000)
    ) {
        throw createServiceError("Las órdenes médicas no son válidas.", 400);
    }

    return {
        symptoms,
        patient_feeling: patientFeeling,
        clinical_notes: clinicalNotes,
        recommendations,
        vital_signs: vitalSigns,
        diagnoses: normalizedDiagnoses,
        prescriptionItems: normalizedItems,
        medical_orders: medicalOrders.map((order) => order.trim()).filter(Boolean),
    };
}

async function getAuthorizedConsultation(userId, consultationId, transaction, lock = false) {
    const doctor = await Doctor.findOne({
        where: { user_id: userId },
        attributes: ["id"],
        transaction,
        ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!doctor) throw createServiceError("No se encontró el perfil médico.", 404);
    const consultation = await Consultation.findOne({
        where: { id: consultationId, doctor_id: doctor.id },
        transaction,
        ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!consultation)
        throw createServiceError("No encontramos una consulta asignada a tu perfil.", 404);
    const appointment = await Appointment.findOne({
        where: { id: consultation.appointment_id, doctor_id: doctor.id },
        transaction,
    });
    if (!appointment)
        throw createServiceError(
            "No encontramos una cita asignada a tu perfil para esta consulta.",
            404,
        );
    return { doctor, consultation, appointment };
}

function clinicalIncludes() {
    return [
        { model: Diagnosis, as: "diagnoses" },
        {
            model: Prescription,
            as: "prescriptions",
            include: [{ model: PrescriptionItem, as: "items" }],
        },
        {
            model: Appointment,
            as: "appointment",
            include: [
                {
                    model: Patient,
                    as: "patient",
                    attributes: [
                        "id",
                        "first_name",
                        "last_name",
                        "date_of_birth",
                        "document_type",
                        "document_number",
                        "phone",
                        "allergies",
                        "existing_conditions",
                    ],
                },
                { model: Specialities, as: "specialty", attributes: ["name"] },
                { model: AppointmentStatus, as: "status", attributes: ["name"] },
            ],
        },
    ];
}

/** Return only the active consultation and patient context owned by the signed-in doctor. */
export async function getDoctorConsultation(userId, rawConsultationId) {
    const consultationId = parseConsultationId(rawConsultationId);
    const { consultation } = await getAuthorizedConsultation(userId, consultationId);
    if (consultation.status !== ACTIVE_CONSULTATION_STATUS) {
        throw createServiceError("Esta consulta ya no se encuentra en edición.", 409);
    }
    const record = await Consultation.findByPk(consultation.id, { include: clinicalIncludes() });
    return record.get({ plain: true });
}

async function replaceClinicalDraft(consultation, draft, transaction) {
    await consultation.update(
        {
            symptoms: draft.symptoms,
            patient_feeling: draft.patient_feeling,
            clinical_notes: draft.clinical_notes,
            vital_signs: draft.vital_signs,
            recommendations: draft.recommendations,
            medical_orders: draft.medical_orders,
        },
        { transaction },
    );
    await Diagnosis.destroy({ where: { consultation_id: consultation.id }, transaction });
    if (draft.diagnoses.length) {
        await Diagnosis.bulkCreate(
            draft.diagnoses.map((diagnosis) => ({
                ...diagnosis,
                consultation_id: consultation.id,
            })),
            { transaction },
        );
    }
    const existingPrescriptions = await Prescription.findAll({
        where: { consultation_id: consultation.id },
        attributes: ["id"],
        raw: true,
        transaction,
    });
    const prescriptionIds = existingPrescriptions.map(({ id }) => id);
    if (prescriptionIds.length) {
        await PrescriptionItem.destroy({
            where: { prescription_id: prescriptionIds },
            transaction,
        });
        await Prescription.destroy({ where: { id: prescriptionIds }, transaction });
    }
    if (draft.prescriptionItems.length) {
        const prescription = await Prescription.create(
            { consultation_id: consultation.id, issued_at: new Date(), notes: null },
            { transaction },
        );
        await PrescriptionItem.bulkCreate(
            draft.prescriptionItems.map((item) => ({ ...item, prescription_id: prescription.id })),
            { transaction },
        );
    }
}

/** Save the editable clinical data atomically while leaving the consultation in progress. */
export async function saveDoctorConsultationDraft(userId, rawConsultationId, payload) {
    const consultationId = parseConsultationId(rawConsultationId);
    const draft = normalizeDraft(payload);
    return database.transaction(async (transaction) => {
        const { consultation } = await getAuthorizedConsultation(
            userId,
            consultationId,
            transaction,
            true,
        );
        if (consultation.status !== ACTIVE_CONSULTATION_STATUS) {
            throw createServiceError("Solo puedes guardar una consulta en curso.", 409);
        }
        await replaceClinicalDraft(consultation, draft, transaction);
        return { message: "Borrador guardado correctamente.", consultationId: consultation.id };
    });
}

/** Persist the final draft and appointment transition as one transaction. */
export async function completeDoctorConsultation(userId, rawConsultationId, payload) {
    const consultationId = parseConsultationId(rawConsultationId);
    const draft = normalizeDraft(payload, { completing: true });
    return database.transaction(async (transaction) => {
        const { doctor, consultation } = await getAuthorizedConsultation(
            userId,
            consultationId,
            transaction,
            true,
        );
        if (consultation.status !== ACTIVE_CONSULTATION_STATUS) {
            throw createServiceError("La consulta ya fue finalizada o no está activa.", 409);
        }
        const appointment = await Appointment.findOne({
            where: { id: consultation.appointment_id, doctor_id: doctor.id },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!appointment) throw createServiceError("No encontramos la cita de esta consulta.", 404);
        const currentStatus = await AppointmentStatus.findByPk(appointment.status_id, {
            transaction,
        });
        if (currentStatus?.name !== IN_PROGRESS_APPOINTMENT_STATUS) {
            throw createServiceError("La cita no está en curso y no se puede finalizar.", 409);
        }
        const completedStatus = await AppointmentStatus.findOne({
            where: { name: COMPLETED_APPOINTMENT_STATUS },
            transaction,
        });
        if (!completedStatus) throw new Error("The Attended appointment status is not configured.");

        const endedAt = new Date();
        await replaceClinicalDraft(consultation, draft, transaction);
        await consultation.update(
            {
                status: COMPLETED_CONSULTATION_STATUS,
                ended_at: endedAt,
                duration_seconds: Math.max(
                    0,
                    Math.floor(
                        (endedAt.getTime() - new Date(consultation.started_at).getTime()) / 1000,
                    ),
                ),
            },
            { transaction },
        );
        await appointment.update({ status_id: completedStatus.id }, { transaction });
        await AppointmentHistory.create(
            {
                appointment_id: appointment.id,
                actor_user_id: userId,
                actor_snapshot: `Doctor ${doctor.id}`,
                event_type: "ConsultationCompleted",
                previous_values: { status: IN_PROGRESS_APPOINTMENT_STATUS },
                new_values: {
                    status: COMPLETED_APPOINTMENT_STATUS,
                    consultation_id: consultation.id,
                    ended_at: endedAt.toISOString(),
                },
                reason: "Doctor completed the consultation.",
                occurred_at: endedAt,
            },
            { transaction },
        );
        return {
            message: "La consulta finalizó correctamente.",
            consultationId: consultation.id,
            status: COMPLETED_CONSULTATION_STATUS,
            endedAt,
            appointmentStatus: COMPLETED_APPOINTMENT_STATUS,
        };
    });
}
