import bcrypt from "bcrypt";
import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    Doctor,
    DoctorAvailability,
    EmailOutbox,
    Rol,
    Specialities,
    User,
} from "../../../models/associations.js";
import AuditLog from "../../../models/AuditLog.js";

const PAGE_SIZE = 10;
const MAX_SEARCH_LENGTH = 100;

function serviceError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseId(value, label) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw serviceError(`${label} no es válido.`);
    }
    return id;
}

function formatDoctor(record) {
    return {
        id: record.id,
        name: record.display_name || record.user.email,
        email: record.user.email,
        specialty: record.specialty?.name || null,
        isActive: record.user.is_active,
        hasSchedule: Boolean(record.availability?.length),
    };
}

/** Return the live doctor directory, summary counts, and assignable specialties. */
export async function getAdminDoctors(query = {}) {
    const requestedPage = Number.parseInt(query.page, 10) || 1;
    if (requestedPage < 1) throw serviceError("La página solicitada no es válida.");

    const search = typeof query.search === "string" ? query.search.trim() : "";
    if (search.length > MAX_SEARCH_LENGTH) {
        throw serviceError("La búsqueda no puede superar los 100 caracteres.");
    }

    const doctorWhere = {};
    if (query.specialtyId) doctorWhere.specialty_id = parseId(query.specialtyId, "La especialidad");

    const userWhere = {};
    if (query.status === "active" || query.status === "inactive") {
        userWhere.is_active = query.status === "active";
    }
    if (search) {
        userWhere[Op.or] = [
            { email: { [Op.like]: `%${search}%` } },
            { "$Doctor.display_name$": { [Op.like]: `%${search}%` } },
        ];
    }

    const [doctors, total, active, scheduled, specialties] = await Promise.all([
        Doctor.findAndCountAll({
            where: doctorWhere,
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "email", "is_active"],
                    where: userWhere,
                    required: true,
                },
                { model: Specialities, as: "specialty", attributes: ["id", "name"] },
                {
                    model: DoctorAvailability,
                    as: "availability",
                    attributes: ["id"],
                    required: false,
                },
            ],
            order: [["id", "DESC"]],
            limit: PAGE_SIZE,
            offset: (requestedPage - 1) * PAGE_SIZE,
            distinct: true,
        }),
        Doctor.count(),
        Doctor.count({
            distinct: true,
            include: [{ model: User, as: "user", where: { is_active: true }, required: true }],
        }),
        Doctor.count({
            distinct: true,
            include: [{ model: DoctorAvailability, as: "availability", required: true }],
        }),
        Specialities.findAll({
            where: { is_active: true },
            attributes: ["id", "name"],
            order: [["name", "ASC"]],
        }),
    ]);

    return {
        doctors: doctors.rows.map(formatDoctor),
        specialties,
        stats: { total, active, scheduled, inactive: total - active },
        pagination: {
            page: requestedPage,
            pageSize: PAGE_SIZE,
            totalItems: doctors.count,
            totalPages: Math.ceil(doctors.count / PAGE_SIZE),
        },
    };
}

export async function getActiveDoctorSpecialties() {
    return Specialities.findAll({
        where: { is_active: true },
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
    });
}

function validateDoctorRegistration(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw serviceError("Los datos del médico no son válidos.");
    }

    const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const password = payload.password;
    const professionalInformation =
        typeof payload.professionalInformation === "string"
            ? payload.professionalInformation.trim()
            : "";

    if (!displayName || displayName.length > 120) {
        throw serviceError("Ingresa el nombre completo del médico (máximo 120 caracteres).");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) {
        throw serviceError("Ingresa un correo electrónico válido.");
    }
    if (
        typeof password !== "string" ||
        password.length < 10 ||
        password.length > 128 ||
        !/[A-Z]/.test(password) ||
        (password.match(/[a-z]/g) || []).length < 3 ||
        !/\d/.test(password) ||
        !/[^A-Za-z0-9]/.test(password)
    ) {
        throw serviceError(
            "La contraseña debe tener al menos 10 caracteres e incluir mayúscula, tres minúsculas, número y símbolo.",
        );
    }
    if (professionalInformation.length > 5000) {
        throw serviceError("La información profesional no puede superar los 5000 caracteres.");
    }

    return {
        displayName,
        email,
        password,
        specialtyId: parseId(payload.specialtyId, "La especialidad"),
        professionalInformation: professionalInformation || null,
    };
}

/** Create the doctor account and profile atomically, and queue its standard email verification. */
export async function createAdminDoctor(actorId, payload) {
    const values = validateDoctorRegistration(payload);

    try {
        return await database.transaction(async (transaction) => {
            const [doctorRole, specialty, existingUser, actor] = await Promise.all([
                Rol.findOne({ where: { name: "Doctor" }, transaction }),
                Specialities.findOne({
                    where: { id: values.specialtyId, is_active: true },
                    transaction,
                }),
                User.findOne({ where: { email: values.email }, transaction }),
                User.findByPk(actorId, { attributes: ["id", "email"], transaction }),
            ]);

            if (!doctorRole) throw serviceError("El rol de médico no está configurado.", 500);
            if (!specialty) throw serviceError("Selecciona una especialidad activa.");
            if (existingUser)
                throw serviceError("Ya existe una cuenta con ese correo electrónico.", 409);
            if (!actor) throw serviceError("No se encontró la sesión del administrador.", 401);

            const user = await User.create(
                {
                    role_id: doctorRole.id,
                    email: values.email,
                    password_hash: await bcrypt.hash(values.password, 12),
                    is_active: true,
                },
                { transaction },
            );

            const doctor = await Doctor.create(
                {
                    user_id: user.id,
                    specialty_id: specialty.id,
                    display_name: values.displayName,
                    professional_information: values.professionalInformation,
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

            await AuditLog.create(
                {
                    actor_user_id: actor.id,
                    actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                    action: "AdminDoctorCreated",
                    target_type: "Doctor",
                    target_id: String(doctor.id),
                    target_description: doctor.display_name,
                    changes: { specialtyId: specialty.id },
                    reason: "Administrator registered a doctor.",
                    result: "Success",
                    occurred_at: new Date(),
                },
                { transaction },
            );

            return {
                id: doctor.id,
                message:
                    "El médico se registró correctamente. Se enviará un correo para verificar su cuenta.",
            };
        });
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            throw serviceError("Ya existe una cuenta con ese correo electrónico.", 409);
        }
        throw error;
    }
}
