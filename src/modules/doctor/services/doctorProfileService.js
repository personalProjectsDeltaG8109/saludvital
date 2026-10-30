import { Doctor, Specialities, User } from "../../../models/associations.js";

const PROFILE_UNAVAILABLE = "No registrado";
const BOGOTA_TIME_ZONE = "America/Bogota";

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

function createProfileField(label, value) {
    return { label, value: cleanValue(value) || PROFILE_UNAVAILABLE };
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
            createProfileField("Nombres", null),
            createProfileField("Apellidos", null),
            createProfileField("Nombre completo", name),
            createProfileField("Tipo de documento", null),
            createProfileField("Número de documento", null),
            createProfileField("Registro profesional", null),
            createProfileField("Especialidad", doctor.specialty?.name),
            createProfileField("Correo electrónico", user.email),
            createProfileField("Teléfono principal", user.phone),
            createProfileField("Género", null),
            createProfileField("Fecha de nacimiento", null),
        ],
        address: [
            createProfileField("Dirección", null),
            createProfileField("Ciudad", null),
            createProfileField("Departamento", null),
        ],
        contact: [
            {
                ...createProfileField("Correo electrónico", user.email),
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
