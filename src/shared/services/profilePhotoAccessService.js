import { Appointment, Doctor, Patient, Rol, User } from "../../models/associations.js";

const PROFILE_PHOTO_URL_PATTERN = /^\/uploads\/profile-photos\/[a-f0-9-]{36}\.(jpg|png|webp)$/i;

function parseUserId(value) {
    const userId = Number(value);
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

function activeRoleInclude(roleName) {
    return {
        model: User,
        as: "user",
        attributes: ["id"],
        where: { is_active: true },
        required: true,
        include: [
            {
                model: Rol,
                as: "rol",
                attributes: ["id"],
                where: { name: roleName },
                required: true,
            },
        ],
    };
}

async function isReferencedByAnyProfile(photoUrl) {
    const references = await Promise.all([
        User.findOne({ where: { profile_photo_url: photoUrl }, attributes: ["id"] }),
        Doctor.findOne({ where: { profile_photo_url: photoUrl }, attributes: ["id"] }),
        Patient.findOne({ where: { profile_photo_url: photoUrl }, attributes: ["id"] }),
    ]);
    return references.some(Boolean);
}

async function canAdministratorViewPhoto(photoUrl) {
    return isReferencedByAnyProfile(photoUrl);
}

async function canPatientViewOwnPhoto(userId, photoUrl) {
    const patient = await Patient.findOne({
        where: { user_id: userId, profile_photo_url: photoUrl },
        attributes: ["id"],
    });
    return Boolean(patient);
}

async function canPatientViewDoctorPhoto(photoUrl) {
    const doctor = await Doctor.findOne({
        where: { profile_photo_url: photoUrl },
        attributes: ["id"],
        include: [activeRoleInclude("Doctor")],
    });
    return Boolean(doctor);
}

async function canDoctorViewOwnPhoto(userId, photoUrl) {
    const doctor = await Doctor.findOne({
        where: { user_id: userId, profile_photo_url: photoUrl },
        attributes: ["id"],
    });
    return Boolean(doctor);
}

async function canDoctorViewPatientPhoto(userId, photoUrl) {
    const doctor = await Doctor.findOne({
        where: { user_id: userId },
        attributes: ["id"],
    });
    if (!doctor) return false;

    const patient = await Patient.findOne({
        where: { profile_photo_url: photoUrl },
        attributes: ["id"],
        include: [
            {
                model: Appointment,
                as: "appointments",
                attributes: ["id"],
                where: { doctor_id: doctor.id },
                required: true,
            },
        ],
    });
    return Boolean(patient);
}

/** Authorize profile photos only for owners and roles that already use the related profile. */
export async function canAccessProfilePhoto({ userId: rawUserId, role, photoUrl }) {
    const userId = parseUserId(rawUserId);
    if (!userId || typeof photoUrl !== "string" || !PROFILE_PHOTO_URL_PATTERN.test(photoUrl)) {
        return false;
    }

    if (role === "Administrator") return canAdministratorViewPhoto(photoUrl);

    if (role === "Patient") {
        return (
            (await canPatientViewOwnPhoto(userId, photoUrl)) ||
            (await canPatientViewDoctorPhoto(photoUrl))
        );
    }

    if (role === "Doctor") {
        return (
            (await canDoctorViewOwnPhoto(userId, photoUrl)) ||
            (await canDoctorViewPatientPhoto(userId, photoUrl))
        );
    }

    return false;
}
