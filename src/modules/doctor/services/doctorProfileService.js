import database from "../../../../config/database.js";
import { Doctor, Specialities, User } from "../../../models/associations.js";
import {
    normalizeProfilePhone,
    normalizeProfileText,
} from "../../admin/services/adminProfileFieldValidation.js";
import {
    getDepartments,
    getMunicipalities,
    resolveLocation,
} from "../../auth/services/locationService.js";

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

function createProfileField(label, value, isProtected = false, fieldName = null) {
    return {
        label,
        value: cleanValue(value) || PROFILE_UNAVAILABLE,
        rawValue: cleanValue(value) || "",
        isProtected,
        fieldName,
        isEditable: Boolean(fieldName) && !isProtected,
    };
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

    if (!submittedFields.length)
        throw createProfileError("Ingresa los datos que deseas actualizar.", 400);
    return Object.fromEntries(submittedFields.map((field) => [field, input[field]]));
}

function normalizeDoctorProfileUpdate(input) {
    const requiredFields = ["phone", "alternatePhone", "address", "city", "department"];
    if (requiredFields.some((field) => !Object.hasOwn(input, field))) {
        throw createProfileError("Envía todos los campos autorizados del perfil.", 400);
    }

    const phone = normalizeProfilePhone(input.phone, "el teléfono", true);
    const alternatePhone = normalizeProfilePhone(
        input.alternatePhone,
        "el teléfono alternativo",
        false,
    );
    const address = normalizeProfileText(input.address, "La dirección", 150);
    const departmentCode = cleanValue(input.department);
    const municipalityCode = cleanValue(input.city);

    if (Boolean(departmentCode) !== Boolean(municipalityCode)) {
        throw createProfileError("Selecciona el departamento y el municipio.", 400);
    }

    const location = departmentCode ? resolveLocation(departmentCode, municipalityCode) : null;
    if (departmentCode && !location) {
        throw createProfileError("Selecciona un municipio válido para el departamento.", 400);
    }

    return {
        phone,
        alternate_phone: alternatePhone,
        address,
        department: location?.department || null,
        municipality: location?.municipality || null,
    };
}

function getLocationCodes(doctor) {
    const department = getDepartments().find((item) => item.name === doctor.department);
    const municipality = department
        ? getMunicipalities(department.code).find((item) => item.name === doctor.municipality)
        : null;
    return { departmentCode: department?.code || "", municipalityCode: municipality?.code || "" };
}

function mapDoctorProfile(doctor) {
    const user = doctor.user;
    const name = cleanValue(doctor.display_name) || cleanValue(user.display_name);
    const fullName = name || PROFILE_UNAVAILABLE;
    const photoUrl = normalizeProfilePhotoUrl(doctor.profile_photo_url);
    const locationCodes = getLocationCodes(doctor);

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
        editableFields: {
            phone: user.phone || "",
            alternatePhone: doctor.alternate_phone || "",
            address: doctor.address || "",
            department: locationCodes.departmentCode,
            city: locationCodes.municipalityCode,
        },
        personalInformation: [
            createProfileField("Nombres", null, true),
            createProfileField("Apellidos", null, true),
            createProfileField("Nombre completo", name, true),
            createProfileField("Tipo de documento", null, true),
            createProfileField("Número de documento", null, true),
            createProfileField("Registro profesional", null, true),
            createProfileField("Especialidad", doctor.specialty?.name, true),
            createProfileField("Correo electrónico", user.email, true),
            createProfileField("Teléfono principal", user.phone, false, "phone"),
            createProfileField("Género", null, true),
            createProfileField("Fecha de nacimiento", null, true),
        ],
        address: [
            createProfileField("Dirección", doctor.address, false, "address"),
            createProfileField("Ciudad", doctor.municipality, false, "city"),
            createProfileField("Departamento", doctor.department, false, "department"),
        ],
        contact: [
            {
                ...createProfileField("Correo electrónico", user.email, true),
                verificationStatus: formatVerificationStatus(user.email_verified_at),
            },
            createProfileField("Teléfono principal", user.phone, false, "phone"),
            createProfileField(
                "Teléfono alternativo",
                doctor.alternate_phone,
                false,
                "alternatePhone",
            ),
        ],
    };
}

/** Return persisted profile fields for the doctor linked to the authenticated user. */
export async function getDoctorProfile(userId) {
    const doctor = await Doctor.findOne({
        where: { user_id: userId },
        attributes: [
            "id",
            "display_name",
            "profile_photo_url",
            "alternate_phone",
            "address",
            "department",
            "municipality",
            "created_at",
        ],
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

/** Update only the authenticated doctor's contact and address fields in one transaction. */
export async function updateDoctorProfile(userId, rawInput) {
    const input = normalizeDoctorProfileUpdate(validateDoctorProfileUpdateFields(rawInput));
    const doctorId = Number(userId);
    if (!Number.isSafeInteger(doctorId) || doctorId < 1) {
        throw createProfileError("La cuenta médica no es válida.", 400);
    }

    const changed = await database.transaction(async (transaction) => {
        const doctor = await Doctor.findOne({
            where: { user_id: doctorId },
            attributes: ["id", "alternate_phone", "address", "department", "municipality"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!doctor) throw createProfileError("No se encontró el perfil médico.", 404);

        const user = await User.findByPk(doctorId, {
            attributes: ["id", "phone", "is_active"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!user || !user.is_active)
            throw createProfileError("No se encontró la cuenta médica.", 404);

        const updates = {};
        if (input.phone !== user.phone) updates.phone = input.phone;
        if (input.alternate_phone !== doctor.alternate_phone) {
            updates.alternate_phone = input.alternate_phone;
        }
        if (input.address !== doctor.address) updates.address = input.address;
        if (input.department !== doctor.department) updates.department = input.department;
        if (input.municipality !== doctor.municipality) updates.municipality = input.municipality;

        if (!Object.keys(updates).length) return false;
        const doctorUpdates = { ...updates };
        delete doctorUpdates.phone;
        if (Object.keys(doctorUpdates).length) await doctor.update(doctorUpdates, { transaction });
        if (Object.hasOwn(updates, "phone"))
            await user.update({ phone: input.phone }, { transaction });
        return true;
    });

    return {
        changed,
        message: changed
            ? "Tus datos de contacto y dirección se actualizaron correctamente."
            : "No se detectaron cambios en tu perfil.",
        profile: await getDoctorProfile(userId),
    };
}
