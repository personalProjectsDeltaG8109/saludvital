import bcrypt from "bcrypt";
import database from "../../../../config/database.js";
import { EmailOutbox, Patient, Rol, User } from "../../../models/associations.js";

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

    for (const field of requiredFields) {
        if (typeof data[field] !== "string" || !data[field].trim()) {
            throw new RegistrationError(`The field ${field} is required.`);
        }
    }

    const textLimits = {
        first_name: 50,
        last_name: 50,
        phone: 15,
        document_number: 15,
        department: 100,
        municipality: 100,
        address: 255,
        email: 80,
        allergies: 255,
        existing_conditions: 255,
    };

    for (const [field, maxLength] of Object.entries(textLimits)) {
        const value = data[field];

        if (value !== undefined && value !== null) {
            if (typeof value !== "string" || value.trim().length > maxLength) {
                throw new RegistrationError(
                    `The field ${field} must contain at most ${maxLength} characters.`,
                );
            }
        }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
        throw new RegistrationError("Enter a valid email address.");
    }

    if (!/^\+?[0-9\s()-]{7,15}$/.test(data.phone.trim())) {
        throw new RegistrationError("Enter a valid phone number.");
    }

    if (!["CC", "CE"].includes(data.document_type)) {
        throw new RegistrationError("Select a valid document type.");
    }

    if (!/^[A-Za-z0-9-]+$/.test(data.document_number.trim())) {
        throw new RegistrationError("Enter a valid document number.");
    }

    // Validate the date format and reject dates later than today.
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(data.date_of_birth) ||
        !Number.isFinite(Date.parse(`${data.date_of_birth}T00:00:00Z`)) ||
        new Date(`${data.date_of_birth}T00:00:00Z`).toISOString().slice(0, 10) !==
            data.date_of_birth ||
        data.date_of_birth > new Date().toISOString().slice(0, 10)
    ) {
        throw new RegistrationError("Enter a valid date of birth.");
    }

    // Require at least 10 characters, one uppercase letter, three lowercase
    // letters, one digit, and one special character.
    const password = data.password;

    if (
        password.length < 10 ||
        !/[A-Z]/.test(password) ||
        (password.match(/[a-z]/g) || []).length < 3 ||
        !/\d/.test(password) ||
        !/[^A-Za-z0-9]/.test(password)
    ) {
        throw new RegistrationError(
            "The password must contain at least 10 characters, one uppercase letter, three lowercase letters, one number, and one special character.",
        );
    }

    if (password !== data.password_confirmation) {
        throw new RegistrationError("The passwords do not match.");
    }

    const allowedBloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
    const bloodType = optionalText(data.blood_type);

    if (bloodType && !allowedBloodTypes.includes(bloodType)) {
        throw new RegistrationError("Select a valid blood type.");
    }
}

// Create a patient account and profile atomically.
export async function registerPatient(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new RegistrationError("Invalid registration data.");
    }

    validateRegistration(data);

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
                throw new RegistrationError("An account with this email already exists.", 409);
            }

            const existingPatient = await Patient.findOne({
                where: {
                    document_type: documentType,
                    document_number: documentNumber,
                },
                transaction,
            });

            if (existingPatient) {
                throw new RegistrationError("A patient with this document already exists.", 409);
            }

            // Assign the patient role on the server, never from form input.
            const patientRole = await Rol.findOne({
                where: { name: "Patient" },
                transaction,
            });

            if (!patientRole) {
                throw new RegistrationError(
                    "Patient registration is temporarily unavailable.",
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
                    department: data.department.trim(),
                    municipality: data.municipality.trim(),
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
                "An account or patient document with these details already exists.",
                409,
            );
        }

        throw error;
    }
}
