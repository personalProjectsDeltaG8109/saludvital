import bcrypt from "bcrypt";
import database from "../../../../config/database.js";
import { EmailOutbox, Patient, Rol, User } from "../../../models/associations.js";
import { resolveLocation } from "./locationService.js";
import { isValidPassword } from "./passwordPolicy.js";

// Represent expected registration failures with safe, user-facing messages.
export class RegistrationError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = "RegistrationError";
        this.statusCode = statusCode;
    }
}

// Normalize optional text fields and convert empty values to null.
function optionalText(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    return typeof value === "string" ? value.trim() || null : value;
}

// Validate the registration data before writing anything to the database.
function validateRegistration(data) {
    const requiredFields = [
        "first_name",
        "last_name",
        "phone",
        "date_of_birth",
        "document_type",
        "document_number",
        "department",
        "municipality",
        "email",
        "password",
        "password_confirmation",
    ];

    const fieldLabels = {
        first_name: "el nombre",
        last_name: "los apellidos",
        phone: "el teléfono",
        date_of_birth: "la fecha de nacimiento",
        document_type: "el tipo de documento",
        document_number: "el número de documento",
        department: "el departamento",
        municipality: "el municipio",
        email: "el correo electrónico",
        password: "la contraseña",
        password_confirmation: "la confirmación de la contraseña",
    };

    for (const field of requiredFields) {
        if (typeof data[field] !== "string" || !data[field].trim()) {
            throw new RegistrationError(`El campo ${fieldLabels[field]} es obligatorio.`);
        }
    }

    const textLimits = {
        first_name: 50,
        last_name: 50,
        phone: 15,
        document_number: 15,
        department: 100,
        municipality: 100,
        address: 150,
        email: 320,
        allergies: 255,
        existing_conditions: 255,
    };

    const optionalFields = new Set(["address", "allergies", "existing_conditions"]);

    for (const [field, maxLength] of Object.entries(textLimits)) {
        const value = data[field];

        if (value !== undefined && value !== null) {
            if (typeof value !== "string") {
                throw new RegistrationError(
                    `El campo ${fieldLabels[field] || field} no tiene un formato válido.`,
                );
            }

            // Normalize optional fields before validating their maximum length.
            const normalizedValue = optionalFields.has(field) ? value.trim() : value;
            if (normalizedValue.length > maxLength) {
                throw new RegistrationError(
                    `El campo ${fieldLabels[field] || field} no puede superar los ${maxLength} caracteres.`,
                );
            }
        }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
        throw new RegistrationError("Ingresa una dirección de correo electrónico válida.");
    }

    // Accept only phone numbers containing 7 to 15 digits.
    if (!/^[0-9]{7,15}$/.test(data.phone.trim())) {
        throw new RegistrationError("Ingresa un número de teléfono válido.");
    }

    if (!["CC", "CE"].includes(data.document_type)) {
        throw new RegistrationError("Selecciona un tipo de documento válido.");
    }
    // Accept only document numbers containing 1 to 15 digits.
    if (!/^[0-9]{1,15}$/.test(data.document_number.trim())) {
        throw new RegistrationError("Ingresa un número de documento válido.");
    }

    // Validate the date format, reject future dates, and enforce a maximum age of 120.
    const birthDate = new Date(`${data.date_of_birth}T00:00:00.000Z`);
    const today = new Date();
    const todayUtc = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const oldestAllowedDate = new Date(todayUtc);
    oldestAllowedDate.setUTCFullYear(oldestAllowedDate.getUTCFullYear() - 120);

    const validDateFormat = /^\d{4}-\d{2}-\d{2}$/.test(data.date_of_birth);
    const validCalendarDate =
        Number.isFinite(birthDate.getTime()) &&
        birthDate.toISOString().slice(0, 10) === data.date_of_birth;

    if (
        !validDateFormat ||
        !validCalendarDate ||
        birthDate > todayUtc ||
        birthDate < oldestAllowedDate
    ) {
        throw new RegistrationError(
            "Ingresa una fecha de nacimiento válida. Debe ser una fecha entre hoy y hace 120 años.",
        );
    }

    // Require at least 10 characters, one uppercase letter, three lowercase
    // letters, one digit, and one special character.
    const password = data.password;

    if (!isValidPassword(password)) {
        throw new RegistrationError(
            "La contraseña debe tener entre 10 y 50 caracteres e incluir una letra mayúscula, tres letras minúsculas, un número y un carácter especial.",
        );
    }

    if (password !== data.password_confirmation) {
        throw new RegistrationError(
            "Las contraseñas no coinciden. Verifica que ambas sean iguales.",
        );
    }

    const allowedBloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
    const bloodType = optionalText(data.blood_type);

    if (bloodType && !allowedBloodTypes.includes(bloodType)) {
        throw new RegistrationError("Selecciona un grupo sanguíneo válido.");
    }

    // Verify that the submitted municipality belongs to the selected department.
    const location = resolveLocation(data.department, data.municipality);

    if (!location) {
        throw new RegistrationError(
            "Selecciona un municipio válido para el departamento seleccionado.",
        );
    }

    // Return canonical names from the trusted catalog instead of user input.
    return location;
}

// Create a patient account and profile atomically.
export async function registerPatient(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new RegistrationError("Los datos de registro no son válidos.");
    }

    // Validate all registration fields and resolve the official location names.
    const location = validateRegistration(data);
    const email = data.email.trim().toLowerCase();
    const documentType = data.document_type;
    const documentNumber = data.document_number.trim();

    try {
        return await database.transaction(async (transaction) => {
            // Check existing email and document before creating the account.
            const existingUser = await User.findOne({
                where: { email },
                transaction,
            });

            if (existingUser) {
                throw new RegistrationError(
                    "Ya existe una cuenta registrada con este correo electrónico.",
                    409,
                );
            }

            const existingPatient = await Patient.findOne({
                where: {
                    document_type: documentType,
                    document_number: documentNumber,
                },
                transaction,
            });

            if (existingPatient) {
                throw new RegistrationError(
                    "Ya existe un paciente registrado con este documento de identidad.",
                    409,
                );
            }

            // Assign the patient role on the server, never from form input.
            const patientRole = await Rol.findOne({
                where: { name: "Patient" },
                transaction,
            });

            if (!patientRole) {
                throw new RegistrationError(
                    "El registro de pacientes no está disponible temporalmente. Inténtalo más tarde.",
                    500,
                );
            }

            // Store only a bcrypt hash, never the original password.
            const passwordHash = await bcrypt.hash(data.password, 12);

            const user = await User.create(
                {
                    role_id: patientRole.id,
                    email,
                    password_hash: passwordHash,
                    is_active: true,
                },
                { transaction },
            );

            // Link the patient profile to the account in the same transaction.
            const patient = await Patient.create(
                {
                    user_id: user.id,
                    first_name: data.first_name.trim(),
                    last_name: data.last_name.trim(),
                    phone: data.phone.trim(),
                    date_of_birth: data.date_of_birth,
                    document_type: documentType,
                    document_number: documentNumber,
                    department: location.department,
                    municipality: location.municipality,
                    blood_type: optionalText(data.blood_type),
                    allergies: optionalText(data.allergies),
                    existing_conditions: optionalText(data.existing_conditions),
                    address: optionalText(data.address),
                },
                { transaction },
            );

            // Persist the verification email task in the same database transaction.
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

            // Return only the public information needed by the controller.
            return {
                id: user.id,
                email: user.email,
                patientId: patient.id,
            };
        });
    } catch (error) {
        // Translate database uniqueness conflicts into safe registration errors.
        if (error.name === "SequelizeUniqueConstraintError") {
            throw new RegistrationError(
                "Ya existe una cuenta o un paciente registrado con estos datos.",
                409,
            );
        }

        throw error;
    }
}
