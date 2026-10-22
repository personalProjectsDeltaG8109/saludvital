import {
    Appointment,
    AppointmentStatus,
    AppointmentHistory,
    Doctor,
    DoctorAvailability,
    DoctorScheduleException,
    Patient,
    Specialities,
    User,
} from "../../../models/associations.js";
import database from "../../../../config/database.js";
import { Op } from "sequelize";
import { AppointmentError } from "../errors/appointmentError.js";

// Define the minimum booking notice required by the application.
const MINIMUM_ADVANCE_HOURS = 5;

// Define the duration of each appointment slot in minutes.
const APPOINTMENT_SLOT_MINUTES = 30;

// Keep appointment statuses aligned with the existing database seed.
const PENDING_STATUS = "Pending";
const CANCELLED_STATUS = "Cancelled";

/**
 * Validate and normalize a positive integer identifier.
 */
function validatePositiveIntegerId(value, fieldName) {
    // Accept positive integer numbers and numeric strings from form inputs.
    const normalizedValue =
        typeof value === "number"
            ? value
            : typeof value === "string" && /^\d+$/.test(value)
                ? Number(value)
                : NaN;

    if (!Number.isSafeInteger(normalizedValue) || normalizedValue <= 0) {
        throw new AppointmentError(`${fieldName} must be a valid positive integer.`, 400);
    }

    return normalizedValue;
}

/**
 * Validate and normalize the optional appointment reason.
 */
function normalizeAppointmentReason(reason) {
    // Allow an omitted reason or an empty value.
    if (reason === undefined || reason === null) {
        return null;
    }

    if (typeof reason !== "string") {
        throw new AppointmentError("The appointment reason must be text.", 400);
    }

    // Remove unnecessary whitespace from the submitted reason.
    const normalizedReason = reason.trim();

    // Store an empty reason as null.
    if (!normalizedReason) {
        return null;
    }

    // Match the maximum length allowed by the appointments table.
    if (normalizedReason.length > 500) {
        throw new AppointmentError("The appointment reason cannot exceed 500 characters.", 400);
    }

    return normalizedReason;
}

/**
 * Convert a Colombian local date and time into a JavaScript Date.
 * Colombia uses UTC-5 and does not currently observe daylight saving time.
 */
function buildDateTime(date, time) {
    // Validate the expected date and time formats before conversion.
    if (
        typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        typeof time !== "string" ||
        !/^\d{2}:\d{2}$/.test(time)
    ) {
        throw new AppointmentError("The selected appointment date or time is invalid.", 400);
    }

    const [year, month, day] = date.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);

    // Reject invalid calendar dates and times instead of allowing normalization.
    const localDate = new Date(Date.UTC(year, month - 1, day));

    // Reject invalid calendar dates, unsupported years, and invalid times.
    if (
        year < 2000 ||
        year > 2100 ||
        localDate.getUTCFullYear() !== year ||
        localDate.getUTCMonth() !== month - 1 ||
        localDate.getUTCDate() !== day ||
        hours > 23 ||
        minutes > 59
    ) {
        throw new AppointmentError("The selected appointment date or time is invalid.", 400);
    }

    // Convert Colombia's UTC-5 wall-clock time into a UTC instant.
    return new Date(Date.UTC(year, month - 1, day, hours + 5, minutes));
}

/**
 * Extract the Colombian calendar date and time from a UTC instant.
 */
function getBogotaDateTime(date) {
    // Shift the instant by UTC-5 to read Colombian calendar components in UTC.
    const colombianTime = new Date(date.getTime() - 5 * 60 * 60 * 1000);

    return {
        year: colombianTime.getUTCFullYear(),
        month: colombianTime.getUTCMonth() + 1,
        day: colombianTime.getUTCDate(),
        hours: colombianTime.getUTCHours(),
        minutes: colombianTime.getUTCMinutes(),
        date: [
            colombianTime.getUTCFullYear(),
            String(colombianTime.getUTCMonth() + 1).padStart(2, "0"),
            String(colombianTime.getUTCDate()).padStart(2, "0"),
        ].join("-"),
        time: [
            String(colombianTime.getUTCHours()).padStart(2, "0"),
            String(colombianTime.getUTCMinutes()).padStart(2, "0"),
            "00",
        ].join(":"),
    };
}

/**
 * Validate the appointment date and time against the booking rules.
 */
function validateAppointmentDate(startAt, endAt) {
    // Reject invalid date objects before performing comparisons.
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        throw new AppointmentError("La fecha o la hora seleccionada no es válida.", 400);
    }

    // Require at least five hours of advance notice.
    const now = new Date();
    const minimumStart = new Date(now.getTime() + MINIMUM_ADVANCE_HOURS * 60 * 60 * 1000);

    if (startAt < minimumStart) {
        throw new AppointmentError(
            "La cita debe reservarse con al menos 5 horas de anticipación.",
            400,
        );
    }

    // Ensure the appointment ends after it starts.
    if (endAt <= startAt) {
        throw new AppointmentError("La hora de finalización debe ser posterior a la hora de inicio.", 400);
    }

    // Require appointment starts to align with a 30-minute boundary.
    if (
        (startAt.getUTCMinutes() !== 0 && startAt.getUTCMinutes() !== 30) ||
        startAt.getUTCSeconds() !== 0 ||
        startAt.getUTCMilliseconds() !== 0
    ) {
        throw new AppointmentError("La cita debe comenzar en un intervalo de 30 minutos.", 400);
    }

    // Enforce the required 30-minute appointment duration.
    const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60000;

    if (durationMinutes !== APPOINTMENT_SLOT_MINUTES) {
        throw new AppointmentError("La cita debe tener una duración de 30 minutos.", 400);
    }
}

/**
 * Retrieve the patient profile associated with the authenticated account.
 */
async function getPatientByUserId(userId, transaction) {
    const patient = await Patient.findOne({
        where: { user_id: userId },
        transaction,
    });

    if (!patient) {
        throw new AppointmentError("No patient profile is associated with this account.", 404);
    }

    return patient;
}

/**
 * Retrieve an active medical specialty.
 */
async function getActiveSpecialty(specialtyId, transaction) {
    const specialty = await Specialities.findOne({
        where: {
            id: specialtyId,
            is_active: true,
        },
        transaction,
    });

    if (!specialty) {
        throw new AppointmentError("The selected medical specialty is not available.", 404);
    }

    return specialty;
}

/**
 * Retrieve an active doctor who belongs to the selected specialty.
 */
async function getActiveDoctor(doctorId, specialtyId, transaction) {
    const doctor = await Doctor.findOne({
        where: {
            id: doctorId,
            specialty_id: specialtyId,
        },
        include: [
            {
                model: User,
                as: "user",
                required: true,
                where: { is_active: true },
                attributes: ["id", "is_active"],
            },
        ],
        transaction,
    });

    if (!doctor) {
        throw new AppointmentError(
            "The selected doctor is not active or does not belong to this specialty.",
            404,
        );
    }

    return doctor;
}

/**
 * Check whether a doctor's regular schedule covers the entire appointment slot.
 */
async function hasRegularAvailability(doctorId, startAt, endAt, transaction) {
    // Use Colombian local time to compare against the doctor's weekly schedule.
    const start = getBogotaDateTime(startAt);
    const end = getBogotaDateTime(endAt);

    // ISO weekday numbering uses Monday = 1 and Sunday = 7.
    const weekdayDate = new Date(Date.UTC(start.year, start.month - 1, start.day));
    const dayOfWeek = weekdayDate.getUTCDay() === 0 ? 7 : weekdayDate.getUTCDay();

    const startTime = start.time;
    const endTime = end.time;

    const availability = await DoctorAvailability.findOne({
        where: {
            doctor_id: doctorId,
            day_of_week: dayOfWeek,
            is_active: true,
            valid_from: { [Op.lte]: start.date },
            [Op.or]: [{ valid_until: null }, { valid_until: { [Op.gte]: start.date } }],
            start_time: { [Op.lte]: startTime },
            end_time: { [Op.gte]: endTime },
        },
        transaction,
    });

    // A single availability block must contain the complete appointment.
    return Boolean(availability);
}

/**
 * Check whether a schedule exception blocks the requested slot.
 */
async function hasBlockingScheduleException(doctorId, startAt, endAt, transaction) {
    const exception = await DoctorScheduleException.findOne({
        where: {
            doctor_id: doctorId,
            exception_type: "Unavailable",
            start_at: { [Op.lt]: endAt },
            end_at: { [Op.gt]: startAt },
        },
        transaction,
    });

    return Boolean(exception);
}

/**
 * Check for overlapping appointments that have not been cancelled.
 */
async function hasConflictingAppointment(
    doctorId,
    startAt,
    endAt,
    transaction,
    excludeAppointmentId,
) {
    // Use a locking read to check the latest committed appointment rows.
    const conflict = await Appointment.findOne({
        where: {
            doctor_id: doctorId,
            ...(excludeAppointmentId ? { id: { [Op.ne]: excludeAppointmentId } } : {}),
            start_at: { [Op.lt]: endAt },
            end_at: { [Op.gt]: startAt },
        },
        include: [
            {
                model: AppointmentStatus,
                as: "status",
                required: true,
                where: {
                    name: { [Op.ne]: CANCELLED_STATUS },
                },
            },
        ],
        transaction,
        lock: true,
    });

    return Boolean(conflict);
}

/**
 * Retrieve active specialties available for booking.
 */
export async function getAvailableSpecialties() {
    return Specialities.findAll({
        where: { is_active: true },
        attributes: ["id", "name", "description"],
        order: [["name", "ASC"]],
    });
}

/**
 * Retrieve active doctors assigned to a selected specialty.
 */

export async function getAvailableDoctors(specialtyId) {
    // Validate the specialty identifier before querying the database.
    specialtyId = validatePositiveIntegerId(specialtyId, "Specialty ID");

    // Retrieve the selected active specialty.
    const specialty = await getActiveSpecialty(specialtyId);

    return Doctor.findAll({
        where: { specialty_id: specialty.id },
        include: [
            {
                model: User,
                as: "user",
                required: true,
                where: { is_active: true },
                attributes: ["id"],
            },
        ],
        order: [["id", "ASC"]],
    });
}

/**
 * Return appointment start times that fit a doctor's schedule for a local date.
 */
export async function getAvailableTimeSlots(doctorId, date) {
    doctorId = validatePositiveIntegerId(doctorId, "Doctor ID");

    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new AppointmentError("A valid appointment date is required.", 400);
    }

    const [year, month, day] = date.split("-").map(Number);
    const localDay = new Date(Date.UTC(year, month - 1, day));

    if (
        localDay.getUTCFullYear() !== year ||
        localDay.getUTCMonth() !== month - 1 ||
        localDay.getUTCDate() !== day
    ) {
        throw new AppointmentError("A valid appointment date is required.", 400);
    }

    const doctor = await Doctor.findOne({
        where: { id: doctorId },
        include: [
            {
                model: User,
                as: "user",
                required: true,
                where: { is_active: true },
                attributes: ["id"],
            },
        ],
        attributes: ["id"],
    });

    if (!doctor) {
        throw new AppointmentError("The selected doctor is not available.", 404);
    }

    const dateStart = buildDateTime(date, "00:00");
    const nextLocalDay = new Date(Date.UTC(year, month - 1, day + 1));
    const nextDate = [
        nextLocalDay.getUTCFullYear(),
        String(nextLocalDay.getUTCMonth() + 1).padStart(2, "0"),
        String(nextLocalDay.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const dateEnd = buildDateTime(nextDate, "00:00");
    const weekday = localDay.getUTCDay() === 0 ? 7 : localDay.getUTCDay();

    const [schedules, exceptions, appointments] = await Promise.all([
        DoctorAvailability.findAll({
            where: {
                doctor_id: doctorId,
                day_of_week: weekday,
                is_active: true,
                valid_from: { [Op.lte]: date },
                [Op.or]: [{ valid_until: null }, { valid_until: { [Op.gte]: date } }],
            },
        }),
        DoctorScheduleException.findAll({
            where: {
                doctor_id: doctorId,
                exception_type: "Unavailable",
                start_at: { [Op.lt]: dateEnd },
                end_at: { [Op.gt]: dateStart },
            },
            attributes: ["start_at", "end_at"],
        }),
        Appointment.findAll({
            where: {
                doctor_id: doctorId,
                start_at: { [Op.lt]: dateEnd },
                end_at: { [Op.gt]: dateStart },
            },
            include: [
                {
                    model: AppointmentStatus,
                    as: "status",
                    required: true,
                    where: { name: { [Op.ne]: CANCELLED_STATUS } },
                    attributes: [],
                },
            ],
            attributes: ["start_at", "end_at"],
        }),
    ]);

    const minimumStart = new Date(Date.now() + MINIMUM_ADVANCE_HOURS * 60 * 60 * 1000);
    const availableTimes = [];

    for (
        let minutes = 0;
        minutes < 24 * 60 - APPOINTMENT_SLOT_MINUTES;
        minutes += APPOINTMENT_SLOT_MINUTES
    ) {
        const endMinutes = minutes + APPOINTMENT_SLOT_MINUTES;
        const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
        const startAt = buildDateTime(date, time);
        const endAt = buildDateTime(date, endTime);

        if (startAt < minimumStart) continue;

        const fitsSchedule = schedules.some((schedule) => {
            const scheduleStart = String(schedule.start_time).slice(0, 5);
            const scheduleEnd = String(schedule.end_time).slice(0, 5);
            return time >= scheduleStart && endTime <= scheduleEnd;
        });

        if (!fitsSchedule) continue;

        const isBlocked = exceptions.some(
            (exception) => exception.start_at < endAt && exception.end_at > startAt,
        );
        const isBooked = appointments.some(
            (appointment) => appointment.start_at < endAt && appointment.end_at > startAt,
        );

        if (!isBlocked && !isBooked) availableTimes.push(time);
    }

    return availableTimes;
}

/**
 * List a patient's pending appointments that still meet the 24-hour reschedule window.
 */
export async function getReschedulableAppointments(userId) {
    userId = validatePositiveIntegerId(userId, "User ID");
    const patient = await getPatientByUserId(userId);
    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return Appointment.findAll({
        where: {
            patient_id: patient.id,
            start_at: { [Op.gt]: cutoff },
        },
        include: [
            {
                model: AppointmentStatus,
                as: "status",
                required: true,
                where: { name: PENDING_STATUS },
            },
            { model: Doctor, as: "doctor", required: true },
            { model: Specialities, as: "specialty", required: true, attributes: ["name"] },
        ],
        order: [["start_at", "ASC"]],
    });
}

/**
 * Create a patient appointment and its audit history atomically.
 */
export async function bookAppointment({ userId, specialtyId, doctorId, date, time, reason }) {
    // Validate identifiers before starting the booking transaction.
    userId = validatePositiveIntegerId(userId, "User ID");
    specialtyId = validatePositiveIntegerId(specialtyId, "Specialty ID");
    doctorId = validatePositiveIntegerId(doctorId, "Doctor ID");
    // Validate the optional reason before opening the transaction.
    const normalizedReason = normalizeAppointmentReason(reason);

    return database.transaction(async (transaction) => {
        const patient = await getPatientByUserId(userId, transaction);

        await getActiveSpecialty(specialtyId, transaction);
        await getActiveDoctor(doctorId, specialtyId, transaction);

        const startAt = buildDateTime(date, time);
        const endAt = new Date(startAt.getTime() + APPOINTMENT_SLOT_MINUTES * 60 * 1000);

        validateAppointmentDate(startAt, endAt);

        // Lock the doctor row to serialize booking attempts for this doctor.
        const lockedDoctor = await Doctor.findByPk(doctorId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        // Abort if the doctor row could not be locked because it no longer exists.
        if (!lockedDoctor) {
            throw new AppointmentError("The selected doctor is no longer available.", 404);
        }

        // Revalidate the doctor and specialty after acquiring the row lock.
        await getActiveDoctor(doctorId, specialtyId, transaction);

        const hasAvailability = await hasRegularAvailability(doctorId, startAt, endAt, transaction);

        if (!hasAvailability) {
            throw new AppointmentError("The doctor is not available during this time.", 409);
        }

        const isBlocked = await hasBlockingScheduleException(doctorId, startAt, endAt, transaction);

        if (isBlocked) {
            throw new AppointmentError("The selected time is blocked by the doctor.", 409);
        }

        const hasConflict = await hasConflictingAppointment(doctorId, startAt, endAt, transaction);

        if (hasConflict) {
            throw new AppointmentError(
                "This appointment slot has already been booked. Please select another time.",
                409,
            );
        }

        const pendingStatus = await AppointmentStatus.findOne({
            where: { name: PENDING_STATUS },
            transaction,
        });

        if (!pendingStatus) {
            throw new Error("The Pending appointment status is not configured.");
        }

        const appointment = await Appointment.create(
            {
                patient_id: patient.id,
                doctor_id: doctorId,
                specialty_id: specialtyId,
                status_id: pendingStatus.id,
                start_at: startAt,
                end_at: endAt,
                reason: normalizedReason,
                source: "Web",
            },
            { transaction },
        );

        await AppointmentHistory.create(
            {
                appointment_id: appointment.id,
                actor_user_id: userId,
                actor_snapshot: `Patient ${patient.id}`,
                event_type: "Created",
                previous_values: null,
                new_values: {
                    patient_id: patient.id,
                    doctor_id: doctorId,
                    specialty_id: specialtyId,
                    status: PENDING_STATUS,
                    start_at: startAt.toISOString(),
                    end_at: endAt.toISOString(),
                },
                reason: normalizedReason,
                occurred_at: new Date(),
            },
            { transaction },
        );

        return appointment;
    });
}

/**
 * Move one of the authenticated patient's appointments to a new available slot.
 */
export async function reschedulePatientAppointment({ userId, appointmentId, date, time }) {
    userId = validatePositiveIntegerId(userId, "User ID");
    appointmentId = validatePositiveIntegerId(appointmentId, "Appointment ID");
    const startAt = buildDateTime(date, time);
    const endAt = new Date(startAt.getTime() + APPOINTMENT_SLOT_MINUTES * 60 * 1000);
    validateAppointmentDate(startAt, endAt);

    const rescheduleCutoff = Date.now() + 24 * 60 * 60 * 1000;
    if (startAt.getTime() < rescheduleCutoff) {
        throw new AppointmentError("Reschedule appointments at least 24 hours in advance.", 400);
    }

    return database.transaction(async (transaction) => {
        const patient = await getPatientByUserId(userId, transaction);
        const appointment = await Appointment.findOne({
            where: { id: appointmentId, patient_id: patient.id },
            include: [{ model: AppointmentStatus, as: "status", required: true }],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!appointment) {
            throw new AppointmentError("The appointment could not be found.", 404);
        }
        if (appointment.status.name !== PENDING_STATUS) {
            throw new AppointmentError("Only pending appointments can be rescheduled.", 409);
        }
        if (new Date(appointment.start_at).getTime() < rescheduleCutoff) {
            throw new AppointmentError(
                "This appointment is inside the 24-hour reschedule window.",
                409,
            );
        }

        const lockedDoctor = await Doctor.findByPk(appointment.doctor_id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!lockedDoctor) {
            throw new AppointmentError("The assigned doctor is no longer available.", 409);
        }

        await getActiveDoctor(appointment.doctor_id, appointment.specialty_id, transaction);
        if (!(await hasRegularAvailability(appointment.doctor_id, startAt, endAt, transaction))) {
            throw new AppointmentError("The doctor is not available during this time.", 409);
        }
        if (
            await hasBlockingScheduleException(appointment.doctor_id, startAt, endAt, transaction)
        ) {
            throw new AppointmentError("The selected time is blocked by the doctor.", 409);
        }
        if (
            await hasConflictingAppointment(
                appointment.doctor_id,
                startAt,
                endAt,
                transaction,
                appointment.id,
            )
        ) {
            throw new AppointmentError("This appointment slot has already been booked.", 409);
        }

        const previousValues = {
            start_at: new Date(appointment.start_at).toISOString(),
            end_at: new Date(appointment.end_at).toISOString(),
        };
        await appointment.update({ start_at: startAt, end_at: endAt }, { transaction });
        await AppointmentHistory.create(
            {
                appointment_id: appointment.id,
                actor_user_id: userId,
                actor_snapshot: `Patient ${patient.id}`,
                event_type: "Rescheduled",
                previous_values: previousValues,
                new_values: { start_at: startAt.toISOString(), end_at: endAt.toISOString() },
                reason: "Patient rescheduled through the web portal.",
                occurred_at: new Date(),
            },
            { transaction },
        );

        return appointment;
    });
}
