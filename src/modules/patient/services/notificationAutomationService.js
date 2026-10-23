import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    Appointment,
    AppointmentStatus,
    Doctor,
    Notification,
    NotificationPreference,
    Patient,
    Specialities,
} from "../../../models/associations.js";

const EVENT_CHANNELS = ["WhatsApp", "SMS", "Email"];
const ENABLED = () => process.env.NOTIFICATION_DELIVERY_ENABLED === "true";

function destinationFor(channel, patient) {
    if (channel === "WhatsApp") {
        return normalizePhone(
            patient.notification_whatsapp_phone || patient.notification_phone || patient.phone,
        );
    }
    if (channel === "SMS") return normalizePhone(patient.notification_phone || patient.phone);
    return patient.notification_email || patient.user?.email;
}

function normalizePhone(value) {
    if (typeof value !== "string") return value;
    const phone = value.trim().replaceAll(/[\s()-]/g, "");
    if (phone.startsWith("+")) return phone;
    return phone.length === 10 ? `+57${phone}` : `+${phone}`;
}

function formatAppointment(appointment) {
    const start = new Date(appointment.start_at);
    return {
        appointmentStart: start.toISOString(),
        date: new Intl.DateTimeFormat("es-CO", {
            dateStyle: "long",
            timeZone: "America/Bogota",
        }).format(start),
        time: new Intl.DateTimeFormat("es-CO", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/Bogota",
        }).format(start),
        doctor: appointment.doctor?.display_name || "tu médico",
        specialty: appointment.specialty?.name || "",
    };
}

// Enqueue only opted-in channels and keep the booking change and queue insert atomic.
export async function enqueueAppointmentNotifications({
    appointmentId,
    eventType,
    scheduledAt = new Date(),
    transaction,
}) {
    if (!ENABLED()) return [];
    if (!transaction) throw new Error("Appointment notifications require a database transaction.");

    const appointment = await Appointment.findByPk(appointmentId, {
        include: [
            { model: Doctor, as: "doctor", attributes: ["display_name"] },
            { model: Specialities, as: "specialty", attributes: ["name"] },
        ],
        transaction,
    });
    if (!appointment) return [];

    const patient = await Patient.findByPk(appointment.patient_id, {
        include: [{ association: "user", attributes: ["email"] }],
        transaction,
    });
    if (!patient) return [];

    const preferences = await NotificationPreference.findAll({
        where: { patient_id: patient.id },
        transaction,
    });
    const channelStates = new Map(
        EVENT_CHANNELS.map((channel) => {
            const storedChannelPreferences = preferences.filter((item) => item.channel === channel);
            const active = storedChannelPreferences.some((item) => item.is_enabled);
            return [channel, storedChannelPreferences.length ? active : channel === "SMS"];
        }),
    );
    const hasEnabledChannel = [...channelStates.values()].some(Boolean);
    if (!hasEnabledChannel) channelStates.set("SMS", true);
    const rows = [];
    for (const channel of EVENT_CHANNELS) {
        const eventPreference = preferences.find(
            (item) => item.channel === channel && item.event_type === eventType,
        );
        const enabled = hasEnabledChannel
            ? eventPreference
                ? eventPreference.is_enabled
                : channelStates.get(channel)
            : channel === "SMS";
        const recipient = destinationFor(channel, patient)?.trim();
        if (!enabled || !recipient) continue;
        rows.push({
            patient_id: patient.id,
            appointment_id: appointment.id,
            channel,
            recipient_address: recipient,
            event_type: eventType,
            payload: formatAppointment(appointment),
            status: "Pending",
            scheduled_at: scheduledAt,
        });
    }

    if (rows.length) await Notification.bulkCreate(rows, { transaction });
    return rows;
}

// Remove reminders made obsolete by a cancellation or reschedule.
export async function cancelPendingAppointmentReminders(appointmentId, transaction) {
    if (!transaction) throw new Error("Appointment notifications require a database transaction.");
    await Notification.update(
        { status: "Cancelled", last_error: "Appointment changed before reminder delivery." },
        {
            where: {
                appointment_id: appointmentId,
                event_type: {
                    [Op.in]: ["appointment_reminder", "appointment_reschedule"],
                },
                status: { [Op.in]: ["Pending", "Processing"] },
            },
            transaction,
        },
    );
}

// When automation is enabled after purchase, schedule reminders for existing future bookings.
export async function backfillUpcomingAppointmentReminders() {
    if (!ENABLED()) return 0;
    const now = new Date();
    const reminderCutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const confirmed = await AppointmentStatus.findOne({ where: { name: "Confirmed" } });
    if (!confirmed) return 0;
    const appointments = await Appointment.findAll({
        where: {
            status_id: confirmed.id,
            start_at: { [Op.gt]: reminderCutoff },
        },
        attributes: ["id", "start_at"],
    });

    let created = 0;
    for (const appointment of appointments) {
        await database.transaction(async (transaction) => {
            const exists = await Notification.count({
                where: { appointment_id: appointment.id, event_type: "appointment_reminder" },
                transaction,
            });
            if (exists) return;
            const dueAt = new Date(new Date(appointment.start_at).getTime() - 24 * 60 * 60 * 1000);
            const rows = await enqueueAppointmentNotifications({
                appointmentId: appointment.id,
                eventType: "appointment_reminder",
                scheduledAt: dueAt,
                transaction,
            });
            created += rows.length;
        });
    }
    return created;
}
