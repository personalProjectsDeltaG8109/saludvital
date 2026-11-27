import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    Appointment,
    AppointmentHistory,
    AppointmentStatus,
    Doctor,
    DoctorAvailability,
    Rol,
    Specialities,
    User,
} from "../../../models/associations.js";
import AuditLog from "../../../models/AuditLog.js";
import {
    cancelPendingAppointmentReminders,
    enqueueAppointmentNotifications,
} from "../../patient/services/notificationAutomationService.js";
import { getColombiaCalendarDate } from "../../../shared/utils/colombiaCalendarDate.js";

const PAGE_SIZE = 10;
const MAX_SEARCH_LENGTH = 100;
const CONFIRMED_APPOINTMENT_STATUS = "Confirmed";
const CANCELLED_APPOINTMENT_STATUS = "Cancelled";
const WEEK_DAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function serviceError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function formatScheduleTime(value) {
    const match = String(value || "")
        .slice(0, 5)
        .match(/^(\d{2}):(\d{2})$/);
    if (!match) return String(value || "");

    const hour = Number(match[1]);
    const period = hour < 12 ? "a. m." : "p. m.";
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${match[2]} ${period}`;
}

function formatScheduleDate(value) {
    const dateValue = String(value || "").slice(0, 10);
    const date = new Date(`${dateValue}T12:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return dateValue;

    return new Intl.DateTimeFormat("es-CO", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(date);
}

function createScheduleInterval(block) {
    const startTime = String(block.startTime).slice(0, 5);
    const endTime = String(block.endTime).slice(0, 5);

    return {
        id: block.id,
        startTime,
        endTime,
        timeRange: `${formatScheduleTime(startTime)} – ${formatScheduleTime(endTime)}`,
    };
}

function groupScheduleIntervalsByDay(blocks, includeEmptyDays = false) {
    const intervalsByDay = new Map();

    blocks.forEach((block) => {
        if (!intervalsByDay.has(block.dayOfWeek)) {
            intervalsByDay.set(block.dayOfWeek, []);
        }
        intervalsByDay.get(block.dayOfWeek).push(createScheduleInterval(block));
    });

    const dayNumbers = includeEmptyDays
        ? WEEK_DAYS.slice(1).map((_day, index) => index + 1)
        : [...intervalsByDay.keys()].sort((first, second) => first - second);

    return dayNumbers.map((dayOfWeek) => ({
        dayOfWeek,
        day: WEEK_DAYS[dayOfWeek] || "Día sin identificar",
        intervals: (intervalsByDay.get(dayOfWeek) || []).sort((first, second) =>
            first.startTime.localeCompare(second.startTime),
        ),
    }));
}

function groupSchedulePeriodsByDay(blocks) {
    const daysByNumber = new Map();

    blocks.forEach((block) => {
        if (!daysByNumber.has(block.dayOfWeek)) {
            daysByNumber.set(block.dayOfWeek, {
                dayOfWeek: block.dayOfWeek,
                day: block.day,
                periodsByKey: new Map(),
            });
        }

        const day = daysByNumber.get(block.dayOfWeek);
        const periodKey = [block.validFrom, block.validUntil || "", block.recordStatus].join("|");

        if (!day.periodsByKey.has(periodKey)) {
            const startDate = formatScheduleDate(block.validFrom);
            const endDate = block.validUntil ? formatScheduleDate(block.validUntil) : null;
            day.periodsByKey.set(periodKey, {
                validFrom: block.validFrom,
                validityLabel: endDate ? `Del ${startDate} al ${endDate}` : `Desde ${startDate}`,
                status: block.recordStatus,
                intervals: [],
            });
        }

        day.periodsByKey.get(periodKey).intervals.push(createScheduleInterval(block));
    });

    return [...daysByNumber.values()]
        .sort((first, second) => first.dayOfWeek - second.dayOfWeek)
        .map((day) => ({
            dayOfWeek: day.dayOfWeek,
            day: day.day,
            periods: [...day.periodsByKey.values()]
                .sort((first, second) => second.validFrom.localeCompare(first.validFrom))
                .map((period) => ({
                    ...period,
                    intervals: period.intervals.sort((first, second) =>
                        first.startTime.localeCompare(second.startTime),
                    ),
                })),
        }));
}

function divideScheduleByValidity(schedule, today) {
    // Keep inactive and ended records in history instead of the current week.
    return schedule.reduce(
        (groups, block) => {
            if (!block.isActive) {
                groups.history.push({ ...block, recordStatus: "Inactivo" });
            } else if (block.validUntil && block.validUntil < today) {
                groups.history.push({ ...block, recordStatus: "Vencido" });
            } else if (block.validFrom > today) {
                groups.upcoming.push({ ...block, recordStatus: "Programado" });
            } else {
                groups.current.push(block);
            }

            return groups;
        },
        { current: [], upcoming: [], history: [] },
    );
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
        userId: record.user_id,
        name: record.display_name || record.user.display_name || record.user.email,
        email: record.user.email,
        specialty: record.specialty?.name || null,
        isActive: record.user.is_active,
        profileReviewStatus: record.profile_review_status || "approved",
        hasSchedule: Boolean(record.availability?.length),
        profilePhotoUrl: record.profile_photo_url || record.user.profile_photo_url || null,
    };
}

function countDoctorsByAccountStatus(isActive, doctorRoleId) {
    return Doctor.count({
        distinct: true,
        include: [
            {
                model: User,
                as: "user",
                where: { is_active: isActive, role_id: doctorRoleId },
                required: true,
            },
        ],
    });
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
    const doctorRole = await Rol.findOne({
        where: { name: "Doctor" },
        attributes: ["id"],
    });
    if (!doctorRole) throw serviceError("No se encontró el rol de médico.", 500);
    userWhere.role_id = doctorRole.id;
    if (query.status === "active" || query.status === "inactive") {
        userWhere.is_active = query.status === "active";
    }
    if (search) {
        userWhere[Op.or] = [
            { email: { [Op.like]: `%${search}%` } },
            { "$Doctor.display_name$": { [Op.like]: `%${search}%` } },
        ];
    }

    const [doctors, total, active, inactive, scheduled, specialties] = await Promise.all([
        Doctor.findAndCountAll({
            where: doctorWhere,
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "email", "display_name", "is_active", "profile_photo_url"],
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
        Doctor.count({
            distinct: true,
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: [],
                    where: { role_id: doctorRole.id },
                    required: true,
                },
            ],
        }),
        countDoctorsByAccountStatus(true, doctorRole.id),
        countDoctorsByAccountStatus(false, doctorRole.id),
        Doctor.count({
            distinct: true,
            include: [
                { model: DoctorAvailability, as: "availability", required: true },
                {
                    model: User,
                    as: "user",
                    attributes: [],
                    where: { role_id: doctorRole.id },
                    required: true,
                },
            ],
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
        stats: { total, active, scheduled, inactive },
        pagination: {
            page: requestedPage,
            pageSize: PAGE_SIZE,
            totalItems: doctors.count,
            totalPages: Math.ceil(doctors.count / PAGE_SIZE),
        },
    };
}

/** Return the read-only profile details supported by the current doctor schema. */
export async function getAdminDoctorDetails(rawDoctorId) {
    const doctorId = Number(rawDoctorId);
    if (!Number.isSafeInteger(doctorId) || doctorId < 1) {
        throw serviceError("No encontramos ese médico.", 404);
    }

    const doctor = await Doctor.findByPk(doctorId, {
        attributes: [
            "id",
            "user_id",
            "display_name",
            "first_name",
            "last_name",
            "document_type",
            "document_number",
            "professional_registration_number",
            "profile_review_status",
            "profile_review_note",
            "profile_photo_url",
            "created_at",
        ],
        include: [
            {
                model: User,
                as: "user",
                attributes: [
                    "id",
                    "email",
                    "display_name",
                    "phone",
                    "profile_photo_url",
                    "email_verified_at",
                    "is_active",
                    "created_at",
                    "last_login_at",
                ],
                required: true,
            },
            { model: Specialities, as: "specialty", attributes: ["id", "name"] },
        ],
    });

    if (!doctor) throw serviceError("No encontramos ese médico.", 404);

    const availability = await DoctorAvailability.findAll({
        where: { doctor_id: doctorId },
        attributes: [
            "id",
            "day_of_week",
            "start_time",
            "end_time",
            "valid_from",
            "valid_until",
            "is_active",
        ],
        order: [
            ["day_of_week", "ASC"],
            ["start_time", "ASC"],
        ],
    });
    const schedule = availability.map((block) => ({
        id: block.id,
        dayOfWeek: block.day_of_week,
        day: WEEK_DAYS[block.day_of_week] || "Día sin identificar",
        startTime: String(block.start_time).slice(0, 5),
        endTime: String(block.end_time).slice(0, 5),
        validFrom: block.valid_from,
        validUntil: block.valid_until,
        isActive: block.is_active,
    }));
    const scheduleGroups = divideScheduleByValidity(schedule, getColombiaCalendarDate());

    return {
        id: doctor.id,
        userId: doctor.user.id,
        name: doctor.display_name || doctor.user.display_name || doctor.user.email,
        email: doctor.user.email,
        phone: doctor.user.phone || null,
        firstName: doctor.first_name || null,
        lastName: doctor.last_name || null,
        documentType: doctor.document_type || null,
        documentNumber: doctor.document_number || null,
        professionalRegistrationNumber: doctor.professional_registration_number || null,
        emailVerified: Boolean(doctor.user.email_verified_at),
        profileReviewStatus: doctor.profile_review_status || "approved",
        profileReviewNote: doctor.profile_review_note || null,
        profilePhotoUrl: doctor.profile_photo_url || doctor.user.profile_photo_url || null,
        specialty: doctor.specialty
            ? { id: doctor.specialty.id, name: doctor.specialty.name }
            : null,
        isActive: doctor.user.is_active,
        createdAt: doctor.user.created_at || doctor.created_at,
        lastLoginAt: doctor.user.last_login_at,
        hasSchedule: scheduleGroups.current.length > 0 || scheduleGroups.upcoming.length > 0,
        schedule,
        currentSchedule: groupScheduleIntervalsByDay(scheduleGroups.current, true),
        upcomingSchedule: groupSchedulePeriodsByDay(scheduleGroups.upcoming),
        previousSchedule: groupSchedulePeriodsByDay(scheduleGroups.history),
    };
}

async function getUpcomingConfirmedAppointments(doctorId, transaction) {
    const confirmedStatus = await AppointmentStatus.findOne({
        where: { name: CONFIRMED_APPOINTMENT_STATUS },
        transaction,
    });
    if (!confirmedStatus) {
        throw serviceError("No está configurado el estado de las citas confirmadas.", 500);
    }

    return Appointment.findAll({
        where: {
            doctor_id: doctorId,
            status_id: confirmedStatus.id,
            start_at: { [Op.gt]: new Date() },
        },
        attributes: ["id", "status_id", "start_at", "end_at"],
        order: [
            ["start_at", "ASC"],
            ["id", "ASC"],
        ],
        ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
    });
}

/** Return the account state and upcoming appointments affected by deactivation. */
export async function getAdminDoctorStatusImpact(rawDoctorId) {
    const doctorId = parseId(rawDoctorId, "El médico");
    const doctor = await Doctor.findByPk(doctorId, {
        attributes: ["id", "user_id"],
        include: [
            {
                model: User,
                as: "user",
                attributes: ["id", "role_id", "is_active"],
                required: true,
            },
        ],
    });
    if (!doctor) throw serviceError("No encontramos ese médico.", 404);
    const role = await Rol.findByPk(doctor.user.role_id, { attributes: ["name"] });
    if (role?.name !== "Doctor") {
        throw serviceError("La cuenta asociada ya no tiene el rol de médico.", 409);
    }

    const appointments = doctor.user.is_active
        ? await getUpcomingConfirmedAppointments(doctorId)
        : [];
    return {
        isActive: doctor.user.is_active,
        upcomingAppointmentCount: appointments.length,
    };
}

/** Cancel the future confirmed appointments for a role change or doctor deactivation. */
export async function cancelUpcomingConfirmedDoctorAppointments(
    doctorId,
    actorId,
    actorEmail,
    transaction,
    reason,
) {
    const cancelledStatus = await AppointmentStatus.findOne({
        where: { name: CANCELLED_APPOINTMENT_STATUS },
        transaction,
    });
    if (!cancelledStatus) {
        throw serviceError("No está configurado el estado de citas canceladas.", 500);
    }

    const appointments = await getUpcomingConfirmedAppointments(doctorId, transaction);
    for (const appointment of appointments) {
        await appointment.update({ status_id: cancelledStatus.id }, { transaction });
        await AppointmentHistory.create(
            {
                appointment_id: appointment.id,
                actor_user_id: actorId,
                actor_snapshot: `Administrator ${actorEmail}`.slice(0, 100),
                event_type: "Cancelled",
                previous_values: {
                    status: CONFIRMED_APPOINTMENT_STATUS,
                    start_at: new Date(appointment.start_at).toISOString(),
                    end_at: new Date(appointment.end_at).toISOString(),
                },
                new_values: { status: CANCELLED_APPOINTMENT_STATUS },
                reason,
                occurred_at: new Date(),
            },
            { transaction },
        );
        await cancelPendingAppointmentReminders(appointment.id, transaction);
        await enqueueAppointmentNotifications({
            appointmentId: appointment.id,
            eventType: "appointment_cancellation",
            transaction,
        });
    }

    return appointments.length;
}

/** Change a doctor's account status and process affected appointments atomically. */
export async function updateAdminDoctorStatus(actorUserId, rawDoctorId, isActive) {
    const doctorId = parseId(rawDoctorId, "El médico");
    const actorId = parseId(actorUserId, "El administrador");
    if (typeof isActive !== "boolean") {
        throw serviceError("El estado de la cuenta no es válido.", 400);
    }

    return database.transaction(async (transaction) => {
        const doctor = await Doctor.findByPk(doctorId, {
            attributes: ["id", "user_id", "profile_review_status"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!doctor) throw serviceError("No encontramos ese médico.", 404);

        const user = await User.findByPk(doctor.user_id, {
            attributes: ["id", "role_id", "email", "is_active"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!user) throw serviceError("No encontramos la cuenta del médico.", 404);
        const role = await Rol.findByPk(user.role_id, {
            attributes: ["name"],
            transaction,
        });
        if (role?.name !== "Doctor") {
            throw serviceError("La cuenta asociada ya no tiene el rol de médico.", 409);
        }
        if (isActive && doctor.profile_review_status !== "approved") {
            throw serviceError(
                "El perfil del médico debe aprobarse antes de activar su cuenta.",
                409,
            );
        }
        if (user.is_active === isActive) {
            throw serviceError(
                `La cuenta del médico ya está ${isActive ? "activa" : "inactiva"}.`,
                409,
            );
        }
        const previousIsActive = user.is_active;

        const actor = await User.findByPk(actorId, {
            attributes: ["id", "email"],
            transaction,
        });
        if (!actor) throw serviceError("No se encontró la sesión del administrador.", 401);

        let cancelledAppointmentCount = 0;
        if (!isActive) {
            cancelledAppointmentCount = await cancelUpcomingConfirmedDoctorAppointments(
                doctorId,
                actor.id,
                actor.email,
                transaction,
                "The assigned doctor's account was deactivated by an administrator.",
            );
        }

        await user.update({ is_active: isActive }, { transaction });
        await AuditLog.create(
            {
                actor_user_id: actorId,
                actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                action: isActive ? "AdminDoctorActivated" : "AdminDoctorDeactivated",
                target_type: "Doctor",
                target_id: String(doctor.id),
                target_description: user.email,
                changes: {
                    previous: { isActive: previousIsActive },
                    next: { isActive },
                    cancelledAppointmentCount,
                },
                reason: isActive
                    ? "Administrator reactivated doctor account."
                    : "Administrator deactivated doctor account and cancelled upcoming confirmed appointments.",
                result: "Success",
                occurred_at: new Date(),
            },
            { transaction },
        );

        return {
            message: isActive
                ? "La cuenta del médico se activó correctamente. Las citas canceladas no se restauraron."
                : `La cuenta del médico se desactivó y se cancelaron ${cancelledAppointmentCount} citas futuras.`,
            isActive,
            cancelledAppointmentCount,
        };
    });
}

export async function getActiveDoctorSpecialties() {
    return Specialities.findAll({
        where: { is_active: true },
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
    });
}
