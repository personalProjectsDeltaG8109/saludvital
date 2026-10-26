import { Op } from "sequelize";
import database from "../../../../config/database.js";
import AuditLog from "../../../models/AuditLog.js";
import EmergencyContact from "../../../models/EmergencyContact.js";
import {
    Doctor,
    EmailOutbox,
    Patient,
    Rol,
    Specialities,
    User,
} from "../../../models/associations.js";
import {
    getDepartments,
    getMunicipalities,
    resolveLocation,
} from "../../auth/services/locationService.js";
import { removeDoctorPhoto, storeDoctorPhoto } from "./doctorPhotoService.js";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const ADMIN_ROLE_NAME = "Administrator";

function serviceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parsePositiveInteger(value, label, defaultValue) {
    if (value === undefined || value === null || value === "") return defaultValue;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw serviceError(`${label} no es válido.`, 400);
    }
    return parsed;
}

function normalizeListFilters(query = {}) {
    const page = parsePositiveInteger(query.page, "La página", 1);
    const requestedPageSize = parsePositiveInteger(
        query.pageSize,
        "El tamaño de página",
        DEFAULT_PAGE_SIZE,
    );
    if (requestedPageSize > MAX_PAGE_SIZE) {
        throw serviceError(`El tamaño de página no puede superar ${MAX_PAGE_SIZE}.`, 400);
    }

    const search = query.search === undefined ? "" : query.search;
    if (typeof search !== "string" || search.trim().length > 100) {
        throw serviceError("El texto de búsqueda no es válido.", 400);
    }

    const roleId = parsePositiveInteger(query.roleId, "El rol", null);
    if (query.status && !["active", "inactive"].includes(query.status)) {
        throw serviceError("El estado de cuenta no es válido.", 400);
    }

    return {
        page,
        pageSize: requestedPageSize,
        search: search.trim(),
        roleId,
        status: query.status,
    };
}

function userIncludes() {
    return [
        { model: Rol, as: "rol", attributes: ["id", "name"], required: true },
        {
            model: Patient,
            as: "patient",
            attributes: ["first_name", "last_name", "profile_photo_url"],
            required: false,
        },
        {
            model: Doctor,
            as: "doctor",
            attributes: ["display_name", "profile_photo_url"],
            required: false,
        },
    ];
}

function normalizeAdminPhotoUrl(value) {
    return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
        ? value
        : null;
}

function toUserSummary(record) {
    const patientName = [record.patient?.first_name, record.patient?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
    const displayName = record.doctor?.display_name?.trim() || patientName || record.email;
    const profileType = record.doctor
        ? "Médico"
        : record.patient
          ? "Paciente"
          : record.rol?.name === ADMIN_ROLE_NAME
            ? "Administrador"
            : "Sin perfil";

    return {
        id: record.id,
        displayName,
        email: record.email,
        role: record.rol,
        isActive: record.is_active,
        profileType,
        profilePhotoUrl: normalizeAdminPhotoUrl(
            record.doctor?.profile_photo_url || record.patient?.profile_photo_url,
        ),
        createdAt: record.created_at,
        lastLoginAt: record.last_login_at,
    };
}

/** Return bounded account summaries and the existing role catalog for administrators. */
export async function getAdminUsers(query = {}) {
    const filters = normalizeListFilters(query);
    const where = {};
    if (filters.roleId) {
        const roleExists = await Rol.count({ where: { id: filters.roleId } });
        if (!roleExists) throw serviceError("El rol seleccionado no existe.", 400);
        where.role_id = filters.roleId;
    }
    if (filters.status) where.is_active = filters.status === "active";
    if (filters.search) {
        const term = `%${filters.search.replace(/[\\%_]/g, "\\$&")}%`;
        where[Op.or] = [
            { email: { [Op.like]: term } },
            { "$patient.first_name$": { [Op.like]: term } },
            { "$patient.last_name$": { [Op.like]: term } },
            { "$doctor.display_name$": { [Op.like]: term } },
        ];
    }

    const [result, roles] = await Promise.all([
        User.findAndCountAll({
            where,
            attributes: ["id", "email", "role_id", "is_active", "created_at", "last_login_at"],
            include: userIncludes(),
            order: [
                ["created_at", "DESC"],
                ["id", "DESC"],
            ],
            limit: filters.pageSize,
            offset: (filters.page - 1) * filters.pageSize,
            distinct: true,
            subQuery: false,
        }),
        Rol.findAll({ attributes: ["id", "name", "description"], order: [["name", "ASC"]] }),
    ]);

    return {
        users: result.rows.map(toUserSummary),
        roles,
        pagination: {
            page: filters.page,
            pageSize: filters.pageSize,
            totalItems: result.count,
            totalPages: Math.ceil(result.count / filters.pageSize),
        },
    };
}

function normalizeUserUpdate(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw serviceError("Los cambios de la cuenta no son válidos.", 400);
    }
    const allowedFields = new Set(["roleId", "isActive"]);
    if (
        !Object.keys(payload).length ||
        Object.keys(payload).some((key) => !allowedFields.has(key))
    ) {
        throw serviceError("Selecciona un cambio de rol o estado válido.", 400);
    }

    const changes = {};
    if (Object.hasOwn(payload, "roleId")) {
        changes.roleId = parsePositiveInteger(payload.roleId, "El rol", null);
    }
    if (Object.hasOwn(payload, "isActive")) {
        if (typeof payload.isActive !== "boolean") {
            throw serviceError("El estado de cuenta no es válido.", 400);
        }
        changes.isActive = payload.isActive;
    }
    return changes;
}

/** Apply role/status changes while protecting administrator access and recording an audit event. */
export async function updateAdminUser(actorUserId, rawUserId, payload) {
    const userId = parsePositiveInteger(rawUserId, "El usuario", null);
    const actorId = parsePositiveInteger(actorUserId, "El administrador", null);
    const changes = normalizeUserUpdate(payload);

    return database.transaction(async (transaction) => {
        // Serialize account updates around the administrator role to prevent lockout races.
        const administratorRole = await Rol.findOne({
            where: { name: ADMIN_ROLE_NAME },
            attributes: ["id"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!administratorRole) throw serviceError("No se encontró el rol de administrador.", 500);

        const user = await User.findByPk(userId, {
            attributes: ["id", "email", "role_id", "is_active"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!user) throw serviceError("No encontramos esa cuenta de usuario.", 404);

        const nextRoleId = changes.roleId ?? user.role_id;
        const nextIsActive = changes.isActive ?? user.is_active;
        const nextRole = await Rol.findByPk(nextRoleId, {
            attributes: ["id", "name"],
            transaction,
        });
        if (!nextRole) throw serviceError("El rol seleccionado no existe.", 400);

        const removesAdministratorAccess =
            user.role_id === administratorRole.id &&
            (!nextIsActive || nextRoleId !== administratorRole.id);
        if (userId === actorId && removesAdministratorAccess) {
            throw serviceError("No puedes quitarte tu propio acceso de administrador.", 409);
        }

        if (removesAdministratorAccess) {
            const activeAdministrators = await User.findAll({
                where: { role_id: administratorRole.id, is_active: true },
                attributes: ["id"],
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (activeAdministrators.length <= 1) {
                throw serviceError(
                    "No puedes desactivar o cambiar el rol del último administrador activo.",
                    409,
                );
            }
        }

        const previousValues = { roleId: user.role_id, isActive: user.is_active };
        const newValues = { roleId: nextRoleId, isActive: nextIsActive };
        if (
            previousValues.roleId === newValues.roleId &&
            previousValues.isActive === newValues.isActive
        ) {
            throw serviceError("La cuenta ya tiene el rol y estado seleccionados.", 409);
        }

        const actor = await User.findByPk(actorId, {
            attributes: ["id", "email"],
            transaction,
        });
        if (!actor) throw serviceError("No se encontró la sesión del administrador.", 401);

        await user.update({ role_id: nextRoleId, is_active: nextIsActive }, { transaction });
        await AuditLog.create(
            {
                actor_user_id: actorId,
                actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                action: "AdminUserAccountUpdated",
                target_type: "User",
                target_id: String(user.id),
                target_description: user.email,
                changes: {
                    previous: previousValues,
                    next: newValues,
                },
                reason: "Administrator updated a user role or account status.",
                result: "Success",
                occurred_at: new Date(),
            },
            { transaction },
        );

        return {
            message: "Los cambios de la cuenta se guardaron correctamente.",
            user: {
                id: user.id,
                email: user.email,
                role: nextRole,
                isActive: nextIsActive,
            },
        };
    });
}

function normalizeProfileText(value, label, maxLength, required = false) {
    if (value === undefined || value === null || typeof value !== "string") {
        if (required) throw serviceError(`${label} es obligatorio.`, 400);
        return null;
    }
    const normalized = value.trim();
    if ((required && !normalized) || normalized.length > maxLength) {
        throw serviceError(`${label} no es válido.`, 400);
    }
    return normalized || null;
}

function normalizeProfileEmail(value) {
    const email = normalizeProfileText(value, "El correo electrónico", 100, true)?.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw serviceError("Ingresa un correo electrónico válido.", 400);
    }
    return email;
}

function normalizeProfilePhone(value, label, required = false) {
    const phone = normalizeProfileText(value, label, 20, required);
    if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) {
        throw serviceError(`Ingresa un número válido para ${label.toLowerCase()}.`, 400);
    }
    return phone;
}

function normalizeProfilePhotoUrl(value) {
    const photoUrl = normalizeProfileText(value, "La foto de perfil", 255);
    if (photoUrl && (!photoUrl.startsWith("/") || photoUrl.startsWith("//"))) {
        throw serviceError("La foto debe usar una ruta local del sistema.", 400);
    }
    return photoUrl;
}

function resolveStoredLocation(patient) {
    const department = getDepartments().find(
        (item) => item.name === patient.department || item.code === patient.department,
    );
    if (!department) return { departmentCode: "", municipalityCode: "" };
    const municipality = getMunicipalities(department.code).find(
        (item) => item.name === patient.municipality || item.code === patient.municipality,
    );
    return {
        departmentCode: department.code,
        municipalityCode: municipality?.code || "",
    };
}

/** Return editable profile fields without account credentials or verification tokens. */
export async function getAdminUserDetails(rawUserId) {
    const userId = parsePositiveInteger(rawUserId, "El usuario", null);
    const user = await User.findByPk(userId, {
        attributes: ["id", "email", "is_active", "last_login_at"],
        include: [
            { model: Rol, as: "rol", attributes: ["id", "name"] },
            {
                model: Patient,
                as: "patient",
                attributes: [
                    "id",
                    "first_name",
                    "last_name",
                    "phone",
                    "notification_phone",
                    "notification_whatsapp_phone",
                    "notification_email",
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
                ],
                required: false,
            },
            {
                model: Doctor,
                as: "doctor",
                attributes: [
                    "id",
                    "specialty_id",
                    "display_name",
                    "professional_information",
                    "profile_photo_url",
                ],
                include: [{ model: Specialities, as: "specialty", attributes: ["id", "name"] }],
                required: false,
            },
        ],
    });
    if (!user) throw serviceError("No encontramos esa cuenta de usuario.", 404);

    const patient = user.patient?.get({ plain: true }) || null;
    const doctor = user.doctor?.get({ plain: true }) || null;
    let emergencyContact = null;
    let departments = [];
    let municipalities = [];
    let specialties = [];

    if (patient) {
        emergencyContact = await EmergencyContact.findOne({
            where: { patient_id: patient.id },
            attributes: ["first_name", "last_name", "phone", "email", "relationship"],
            order: [["id", "ASC"]],
        });
        departments = getDepartments();
        const locationCodes = resolveStoredLocation(patient);
        patient.departmentCode = locationCodes.departmentCode;
        patient.municipalityCode = locationCodes.municipalityCode;
        municipalities = getMunicipalities(locationCodes.departmentCode);
    }

    if (doctor) {
        specialties = await Specialities.findAll({
            where: {
                [Op.or]: [{ is_active: true }, { id: doctor.specialty_id }],
            },
            attributes: ["id", "name", "is_active"],
            order: [["name", "ASC"]],
        });
    }

    return {
        user: {
            id: user.id,
            email: user.email,
            isActive: user.is_active,
            role: user.rol,
            profileType: doctor ? "Doctor" : patient ? "Patient" : "Other",
            profilePhotoUrl: normalizeAdminPhotoUrl(
                doctor?.profile_photo_url || patient?.profile_photo_url,
            ),
            doctor,
            patient,
            emergencyContact: emergencyContact?.get({ plain: true }) || null,
        },
        departments,
        municipalities,
        specialties,
    };
}

function validatePatientAdminProfile(payload) {
    const profile = payload.patient;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        throw serviceError("La información del paciente no es válida.", 400);
    }

    const firstName = normalizeProfileText(profile.firstName, "Los nombres", 50, true);
    const lastName = normalizeProfileText(profile.lastName, "Los apellidos", 50, true);
    const phone = normalizeProfilePhone(profile.phone, "el teléfono del paciente", true);
    const dateOfBirth = normalizeProfileText(
        profile.dateOfBirth,
        "La fecha de nacimiento",
        10,
        true,
    );
    const documentType = normalizeProfileText(
        profile.documentType,
        "El tipo de documento",
        2,
        true,
    );
    const documentNumber = normalizeProfileText(
        profile.documentNumber,
        "El número de documento",
        15,
        true,
    );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
        throw serviceError("Ingresa una fecha de nacimiento válida.", 400);
    }
    const parsedBirthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
    const today = new Date();
    const todayUtc = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const earliestDate = new Date(todayUtc);
    earliestDate.setUTCFullYear(earliestDate.getUTCFullYear() - 120);
    if (
        Number.isNaN(parsedBirthDate.getTime()) ||
        parsedBirthDate.toISOString().slice(0, 10) !== dateOfBirth ||
        parsedBirthDate > todayUtc ||
        parsedBirthDate < earliestDate
    ) {
        throw serviceError("La fecha de nacimiento debe ser válida y no futura.", 400);
    }
    if (!["CC", "CE"].includes(documentType) || !/^\d{1,15}$/.test(documentNumber)) {
        throw serviceError("Revisa el tipo y número del documento.", 400);
    }

    const location = resolveLocation(profile.departmentCode, profile.municipalityCode);
    if (!location) throw serviceError("Selecciona un municipio válido para el departamento.", 400);
    const bloodType = normalizeProfileText(profile.bloodType, "El tipo de sangre", 3);
    if (bloodType && !["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].includes(bloodType)) {
        throw serviceError("Selecciona un tipo de sangre válido.", 400);
    }

    const emergency = payload.emergencyContact || {};
    if (typeof emergency !== "object" || Array.isArray(emergency)) {
        throw serviceError("El contacto de emergencia no es válido.", 400);
    }
    const emergencyContact = {
        first_name: normalizeProfileText(emergency.firstName, "El nombre del contacto", 50),
        last_name: normalizeProfileText(emergency.lastName, "Los apellidos del contacto", 50),
        phone: normalizeProfilePhone(emergency.phone, "el contacto de emergencia"),
        email: normalizeProfileText(emergency.email, "El correo del contacto", 254)?.toLowerCase(),
        relationship: normalizeProfileText(emergency.relationship, "El parentesco", 50),
    };
    if (emergencyContact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emergencyContact.email)) {
        throw serviceError("Ingresa un correo válido para el contacto de emergencia.", 400);
    }
    const emergencyHasData = Object.values(emergencyContact).some(Boolean);
    if (
        emergencyHasData &&
        (!emergencyContact.first_name || !emergencyContact.last_name || !emergencyContact.phone)
    ) {
        throw serviceError(
            "Completa nombres, apellidos y teléfono del contacto de emergencia.",
            400,
        );
    }

    const notificationEmail = normalizeProfileText(
        profile.notificationEmail,
        "El correo de notificaciones",
        254,
    )?.toLowerCase();
    if (notificationEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail)) {
        throw serviceError("Ingresa un correo válido para las notificaciones.", 400);
    }

    return {
        profile: {
            first_name: firstName,
            last_name: lastName,
            phone,
            notification_phone: normalizeProfilePhone(
                profile.notificationPhone,
                "el teléfono de notificaciones",
            ),
            notification_whatsapp_phone: normalizeProfilePhone(
                profile.notificationWhatsappPhone,
                "el teléfono de WhatsApp",
            ),
            notification_email: notificationEmail,
            date_of_birth: dateOfBirth,
            document_type: documentType,
            document_number: documentNumber,
            department: location.department,
            municipality: location.municipality,
            blood_type: bloodType,
            allergies: normalizeProfileText(profile.allergies, "Las alergias", 255),
            existing_conditions: normalizeProfileText(
                profile.existingConditions,
                "Las condiciones médicas",
                255,
            ),
            address: normalizeProfileText(profile.address, "La dirección", 150),
            profile_photo_url: normalizeProfilePhotoUrl(profile.profilePhotoUrl),
        },
        emergencyContact: emergencyHasData ? emergencyContact : null,
    };
}

function validateDoctorAdminProfile(payload) {
    const profile = payload.doctor;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        throw serviceError("La información del médico no es válida.", 400);
    }
    const specialtyId = parsePositiveInteger(profile.specialtyId, "La especialidad", null);
    if (
        profile.photo !== undefined &&
        profile.photo !== null &&
        typeof profile.photo !== "string"
    ) {
        throw serviceError("La foto del médico no es válida.", 400);
    }
    return {
        display_name: normalizeProfileText(profile.displayName, "El nombre del médico", 120, true),
        professional_information: normalizeProfileText(
            profile.professionalInformation,
            "La información profesional",
            10000,
        ),
        profile_photo_url: normalizeProfilePhotoUrl(profile.profilePhotoUrl),
        specialty_id: specialtyId,
        photo: profile.photo || null,
    };
}

/** Update a doctor or patient profile and audit changed field names without copying sensitive values. */
export async function updateAdminUserProfile(actorUserId, rawUserId, payload) {
    const userId = parsePositiveInteger(rawUserId, "El usuario", null);
    const actorId = parsePositiveInteger(actorUserId, "El administrador", null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw serviceError("Los datos del perfil no son válidos.", 400);
    }
    const email = normalizeProfileEmail(payload.email);

    let storedPhotoUrl = null;
    let previousPhotoUrl = null;
    let updatedPhotoUrl = null;

    return database
        .transaction(async (transaction) => {
            const user = await User.findByPk(userId, {
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!user) throw serviceError("No encontramos esa cuenta de usuario.", 404);
            const role = await Rol.findByPk(user.role_id, { attributes: ["name"], transaction });
            const currentEmail = user.email.toLowerCase();
            const changes = { email: currentEmail === email ? [] : ["email"] };

            const duplicateEmail = await User.findOne({
                where: { email, id: { [Op.ne]: user.id } },
                attributes: ["id"],
                transaction,
            });
            if (duplicateEmail)
                throw serviceError("Ese correo electrónico ya está registrado.", 409);

            let patient;
            let doctor;
            let normalizedPatient;
            let normalizedDoctor;
            if (role?.name === "Patient") {
                patient = await Patient.findOne({
                    where: { user_id: user.id },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
                if (!patient) throw serviceError("No encontramos el perfil del paciente.", 404);
                normalizedPatient = validatePatientAdminProfile(payload);

                const duplicateDocument = await Patient.findOne({
                    where: {
                        document_type: normalizedPatient.profile.document_type,
                        document_number: normalizedPatient.profile.document_number,
                        id: { [Op.ne]: patient.id },
                    },
                    attributes: ["id"],
                    transaction,
                });
                if (duplicateDocument)
                    throw serviceError("Ese documento ya está asociado a otro paciente.", 409);

                await patient.update(normalizedPatient.profile, { transaction });
                changes.profile = Object.keys(normalizedPatient.profile);
                changes.emergencyContact = ["updated"];
                const emergencyContact = await EmergencyContact.findOne({
                    where: { patient_id: patient.id },
                    order: [["id", "ASC"]],
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
                if (normalizedPatient.emergencyContact) {
                    if (emergencyContact) {
                        await emergencyContact.update(normalizedPatient.emergencyContact, {
                            transaction,
                        });
                    } else {
                        await EmergencyContact.create(
                            { ...normalizedPatient.emergencyContact, patient_id: patient.id },
                            { transaction },
                        );
                    }
                } else if (emergencyContact) {
                    await EmergencyContact.destroy({
                        where: { patient_id: patient.id },
                        transaction,
                    });
                    changes.emergencyContact = ["removed"];
                }
            } else if (role?.name === "Doctor") {
                doctor = await Doctor.findOne({
                    where: { user_id: user.id },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
                if (!doctor) throw serviceError("No encontramos el perfil del médico.", 404);
                normalizedDoctor = validateDoctorAdminProfile(payload);
                const specialty = await Specialities.findOne({
                    where: {
                        id: normalizedDoctor.specialty_id,
                        [Op.or]: [{ is_active: true }, { id: doctor.specialty_id }],
                    },
                    attributes: ["id"],
                    transaction,
                });
                if (!specialty) throw serviceError("La especialidad seleccionada no existe.", 400);
                previousPhotoUrl = doctor.profile_photo_url || null;
                if (normalizedDoctor.photo) {
                    storedPhotoUrl = await storeDoctorPhoto(normalizedDoctor.photo);
                    normalizedDoctor.profile_photo_url = storedPhotoUrl;
                }
                delete normalizedDoctor.photo;
                updatedPhotoUrl = normalizedDoctor.profile_photo_url;
                changes.profile = Object.keys(normalizedDoctor);
                await doctor.update(normalizedDoctor, { transaction });
            } else {
                throw serviceError(
                    "Esta cuenta no tiene un perfil de paciente o médico editable.",
                    409,
                );
            }

            if (changes.email.length) {
                await user.update(
                    {
                        email,
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

            const actor = await User.findByPk(actorId, {
                attributes: ["id", "email"],
                transaction,
            });
            if (!actor) throw serviceError("No se encontró la sesión del administrador.", 401);
            await AuditLog.create(
                {
                    actor_user_id: actorId,
                    actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                    action: "AdminUserProfileUpdated",
                    target_type: "User",
                    target_id: String(user.id),
                    target_description: user.email,
                    changes,
                    reason: "Administrator edited a patient or doctor profile.",
                    result: "Success",
                    occurred_at: new Date(),
                },
                { transaction },
            );

            return { message: "La información del usuario se actualizó correctamente." };
        })
        .then(async (result) => {
            if (
                previousPhotoUrl &&
                previousPhotoUrl !== updatedPhotoUrl &&
                previousPhotoUrl.startsWith("/uploads/profile-photos/")
            ) {
                await removeDoctorPhoto(previousPhotoUrl).catch(() => {});
            }
            return result;
        })
        .catch(async (error) => {
            if (storedPhotoUrl) await removeDoctorPhoto(storedPhotoUrl).catch(() => {});
            throw error;
        });
}

export async function getAdminDepartments() {
    return getDepartments();
}

export async function getAdminMunicipalities(departmentCode) {
    const municipalities = getMunicipalities(departmentCode);
    if (!municipalities.length) throw serviceError("Selecciona un departamento válido.", 400);
    return municipalities;
}
