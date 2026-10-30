import { Doctor, Specialities, User } from "../../../models/associations.js";

const PROFILE_UNAVAILABLE = "No registrado";
const BOGOTA_TIME_ZONE = "America/Bogota";
const DOCTOR_PROFILE_EDITABLE_FIELDS = new Set([
    "phone",
    "alternatePhone",
    "address",
    "city",
    "department",
]);
const PROTECTED_PROFILE_FIELDS = [
    "firstName",
    "lastName",
    "documentType",
    "documentNumber",
    "professionalRegistration",
    "specialtyId",
    "email",
    "gender",
    "dateOfBirth",
];

function createProfileError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function cleanValue(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeProfilePhotoUrl(value) {
    return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
        ? value
        : null;
}

function formatDate(value) {
    if (!value) return PROFILE_UNAVAILABLE;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return PROFILE_UNAVAILABLE;
    return new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: BOGOTA_TIME_ZONE,
    }).format(date);
}

function formatStatus(isActive) {
    return isActive ? "Cuenta activa" : "Cuenta inactiva";
}

function formatVerificationStatus(verifiedAt) {
    return verifiedAt ? "Verificado" : "Pendiente de verificación";
}

function createProfileField(label, value, isProtected = false) {
    return { label, value: cleanValue(value) || PROFILE_UNAVAILABLE, isProtected };
}

export function validateDoctorProfileUpdateFields(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw createProfileError("Los datos del perfil no son válidos.", 400);
    }

    const submittedFields = Object.keys(input);
    const unsupportedFields = submittedFields.filter(
        (field) => !DOCTOR_PROFILE_EDITABLE_FIELDS.has(field),
    );

    if (unsupportedFields.length) {
        const includesProtectedField = unsupportedFields.some((field) =>
            PROTECTED_PROFILE_FIELDS.includes(field),
        );
        const message = includesProtectedField
            ? "Los datos de identificación y profesionales solo pueden ser modificados por un administrador."
            : "La solicitud contiene campos no permitidos.";
        throw createProfileError(message, 400);
    }

    return Object.fromEntries(submittedFields.map((field) => [field, input[field]]));
}

function mapDoctorProfile(doctor) {
    const user = doctor.user;
    const name = cleanValue(doctor.display_name) || cleanValue(user.display_name);
    const fullName = name || PROFILE_UNAVAILABLE;
    const photoUrl = normalizeProfilePhotoUrl(doctor.profile_photo_url);

    return {
        fullName,
        initials:
            fullName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part.charAt(0).toLocaleUpperCase("es-CO"))
                .join("") || "M",
        photoUrl,
        specialty: cleanValue(doctor.specialty?.name) || PROFILE_UNAVAILABLE,
        professionalRegistration: PROFILE_UNAVAILABLE,
        accountStatus: formatStatus(Boolean(user.is_active)),
        isActive: Boolean(user.is_active),
        memberSince: formatDate(user.created_at || doctor.created_at),
        personalInformation: [
            createProfileField("Nombres", null, true),
            createProfileField("Apellidos", null, true),
            createProfileField("Nombre completo", name, true),
            createProfileField("Tipo de documento", null, true),
            createProfileField("Número de documento", null, true),
            createProfileField("Registro profesional", null, true),
            createProfileField("Especialidad", doctor.specialty?.name, true),
            createProfileField("Correo electrónico", user.email, true),
            createProfileField("Teléfono principal", user.phone),
            createProfileField("Género", null, true),
            createProfileField("Fecha de nacimiento", null, true),
        ],
        address: [
            createProfileField("Dirección", null),
            createProfileField("Ciudad", null),
            createProfileField("Departamento", null),
        ],
        contact: [
            {
                ...createProfileField("Correo electrónico", user.email, true),
                verificationStatus: formatVerificationStatus(user.email_verified_at),
            },
            {
                ...createProfileField("Teléfono principal", user.phone),
                verificationStatus: PROFILE_UNAVAILABLE,
            },
            {
                ...createProfileField("Teléfono alternativo", null),
                verificationStatus: PROFILE_UNAVAILABLE,
            },
        ],
    };
}

/** Return persisted profile fields for the doctor linked to the authenticated user. */
export async function getDoctorProfile(userId) {
    const doctor = await Doctor.findOne({
        where: { user_id: userId },
        attributes: ["id", "display_name", "profile_photo_url", "created_at"],
        include: [
            {
                model: User,
                as: "user",
                attributes: [
                    "id",
                    "display_name",
                    "email",
                    "phone",
                    "is_active",
                    "email_verified_at",
                    "created_at",
                ],
                required: true,
            },
            {
                model: Specialities,
                as: "specialty",
                attributes: ["name"],
                required: false,
            },
        ],
    });

    if (!doctor) throw createProfileError("No se encontró el perfil médico.", 404);
    return mapDoctorProfile(doctor);
}
