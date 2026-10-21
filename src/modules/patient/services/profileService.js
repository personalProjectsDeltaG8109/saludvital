import { Op } from "sequelize";
import database from "../../../../config/database.js";
import EmailOutbox from "../../../models/EmailOutbox.js";
import EmergencyContact from "../../../models/EmergencyContact.js";
import { Appointment, Patient, User } from "../../../models/associations.js";
import { resolveLocation } from "../../auth/services/locationService.js";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function profileError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function normalizeText(value, field, maxLength, required = false) {
    if (typeof value !== "string") {
        if (required) throw profileError(`El campo ${field} es obligatorio.`);
        return null;
    }

    const normalized = value.trim();
    if (required && !normalized) throw profileError(`El campo ${field} es obligatorio.`);
    if (normalized.length > maxLength) {
        throw profileError(`El campo ${field} no puede superar los ${maxLength} caracteres.`);
    }
    return normalized || null;
}

function validateDateOfBirth(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw profileError("Ingresa una fecha de nacimiento válida.");
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    const today = new Date();
    const todayUtc = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const oldest = new Date(todayUtc);
    oldest.setUTCFullYear(oldest.getUTCFullYear() - 120);

    if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value ||
        date > todayUtc ||
        date < oldest
    ) {
        throw profileError("La fecha de nacimiento debe ser válida y no puede estar en el futuro.");
    }

    return value;
}

function normalizePhone(value, label, required = true) {
    const phone = normalizeText(value, label, 15, required);
    if (phone && !/^\d{7,15}$/.test(phone)) {
        throw profileError(`Ingresa un teléfono válido para ${label.toLowerCase()}.`);
    }
    return phone;
}

function validateEmail(value, label, maxLength = 100, required = true) {
    const email = normalizeText(value, label, maxLength, required)?.toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw profileError(`Ingresa un correo válido para ${label.toLowerCase()}.`);
    }
    return email;
}

function validateProfilePayload(payload = {}) {
    const personal = payload.personal || {};
    const medical = payload.medical || {};
    const emergency = payload.emergency || {};

    const firstName = normalizeText(personal.first_name, "los nombres", 50, true);
    const lastName = normalizeText(personal.last_name, "los apellidos", 50, true);
    const phone = normalizePhone(personal.phone, "el paciente");
    const email = validateEmail(personal.email, "el correo electrónico");
    const documentType = personal.document_type;
    if (!["CC", "CE"].includes(documentType)) {
        throw profileError("Selecciona un tipo de documento válido.");
    }

    const documentNumber = normalizeText(
        personal.document_number,
        "el número de documento",
        15,
        true,
    );
    if (!/^\d{1,15}$/.test(documentNumber)) {
        throw profileError("Ingresa un número de documento válido.");
    }

    const location = resolveLocation(personal.department, personal.municipality);
    if (!location) throw profileError("Selecciona un municipio válido para el departamento.");

    const bloodType = normalizeText(medical.blood_type, "el tipo de sangre", 3) || null;
    if (bloodType && !BLOOD_TYPES.includes(bloodType)) {
        throw profileError("Selecciona un tipo de sangre válido.");
    }

    const emergencyFirstName = normalizeText(
        emergency.first_name,
        "el nombre del contacto de emergencia",
        50,
    );
    const emergencyLastName = normalizeText(
        emergency.last_name,
        "los apellidos del contacto de emergencia",
        50,
    );
    const emergencyPhone = normalizePhone(emergency.phone, "el contacto de emergencia", false);
    const emergencyEmail = validateEmail(
        emergency.email || "",
        "el contacto de emergencia",
        254,
        false,
    );
    const emergencyRelationship = normalizeText(emergency.relationship, "el parentesco", 50);
    const emergencyHasData = Boolean(
        emergencyFirstName ||
        emergencyLastName ||
        emergencyPhone ||
        emergencyEmail ||
        emergencyRelationship,
    );

    if (emergencyHasData && (!emergencyFirstName || !emergencyLastName || !emergencyPhone)) {
        throw profileError(
            "Completa los nombres, apellidos y teléfono del contacto de emergencia.",
        );
    }

    return {
        personal: {
            first_name: firstName,
            last_name: lastName,
            phone,
            email,
            date_of_birth: validateDateOfBirth(personal.date_of_birth),
            document_type: documentType,
            document_number: documentNumber,
            department: location.department,
            municipality: location.municipality,
            address: normalizeText(personal.address, "la dirección", 150),
        },
        medical: {
            blood_type: bloodType,
            allergies: normalizeText(medical.allergies, "las alergias", 255),
            existing_conditions: normalizeText(
                medical.existing_conditions,
                "las condiciones médicas",
                255,
            ),
        },
        emergency: emergencyHasData
            ? {
                  first_name: emergencyFirstName,
                  last_name: emergencyLastName,
                  phone: emergencyPhone,
                  email: emergencyEmail,
                  relationship: emergencyRelationship,
              }
            : null,
        departmentCode: personal.department,
        municipalityCode: personal.municipality,
    };
}

export async function getPatientProfile(userId) {
    const patient = await Patient.findOne({
        where: { user_id: userId },
        attributes: [
            "id",
            "user_id",
            "first_name",
            "last_name",
            "phone",
            "date_of_birth",
            "document_type",
            "document_number",
            "department",
            "municipality",
            "blood_type",
            "allergies",
            "existing_conditions",
            "address",
            "profile_photo_url",
            "created_at",
        ],
        include: [{ association: "user", attributes: ["email", "email_verified_at"] }],
    });

    if (!patient) throw profileError("No se encontró el perfil del paciente.", 404);

    const [emergencyContact, appointmentCount, specialtyCount] = await Promise.all([
        EmergencyContact.findOne({ where: { patient_id: patient.id }, order: [["id", "ASC"]] }),
        Appointment.count({ where: { patient_id: patient.id } }),
        Appointment.count({
            where: { patient_id: patient.id },
            distinct: true,
            col: "specialty_id",
        }),
    ]);

    const joinedAt = new Date(patient.created_at);
    const now = new Date();
    let yearsAsPatient = now.getFullYear() - joinedAt.getFullYear();
    if (
        now.getMonth() < joinedAt.getMonth() ||
        (now.getMonth() === joinedAt.getMonth() && now.getDate() < joinedAt.getDate())
    ) {
        yearsAsPatient -= 1;
    }

    return {
        patient: patient.get({ plain: true }),
        emergencyContact: emergencyContact?.get({ plain: true }) || null,
        appointmentCount,
        specialtyCount,
        yearsAsPatient: Math.max(yearsAsPatient, 0),
    };
}

export async function updatePatientProfile(userId, payload) {
    const input = validateProfilePayload(payload);

    try {
        return await database.transaction(async (transaction) => {
            const patient = await Patient.findOne({
                where: { user_id: userId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!patient) throw profileError("No se encontró el perfil del paciente.", 404);

            const user = await User.findByPk(userId, {
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!user) throw profileError("No se encontró la cuenta del paciente.", 404);

            const emailChanged = input.personal.email !== user.email.toLowerCase();
            if (emailChanged) {
                const existingUser = await User.findOne({
                    where: { email: input.personal.email, id: { [Op.ne]: user.id } },
                    transaction,
                });
                if (existingUser)
                    throw profileError("Ese correo electrónico ya está registrado.", 409);
            }

            const patientDetails = { ...input.personal };
            delete patientDetails.email;
            await patient.update({ ...patientDetails, ...input.medical }, { transaction });

            if (emailChanged) {
                await user.update(
                    {
                        email: input.personal.email,
                        email_verified_at: null,
                        email_verification_token_hash: null,
                        email_verification_expires_at: null,
                    },
                    { transaction },
                );
                await EmailOutbox.create(
                    {
                        user_id: user.id,
                        event_type: "email_verification",
                        status: "pending",
                        attempts: 0,
                        next_attempt_at: new Date(),
                    },
                    { transaction },
                );
            }

            const emergencyContact = await EmergencyContact.findOne({
                where: { patient_id: patient.id },
                order: [["id", "ASC"]],
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            if (input.emergency) {
                if (emergencyContact) {
                    await emergencyContact.update(input.emergency, { transaction });
                } else {
                    await EmergencyContact.create(
                        { ...input.emergency, patient_id: patient.id },
                        { transaction },
                    );
                }
            } else if (emergencyContact) {
                await EmergencyContact.destroy({
                    where: { patient_id: patient.id },
                    transaction,
                });
            }

            return { emailChanged, email: input.personal.email };
        });
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            throw profileError("El documento o el correo ya está asociado a otra cuenta.", 409);
        }
        throw error;
    }
}
