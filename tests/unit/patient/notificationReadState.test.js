import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

jest.unstable_mockModule("../../../config/database.js", () => ({
    default: { transaction: jest.fn(), query: jest.fn() },
}));
jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    AppointmentHistory: { count: jest.fn(), findAll: jest.fn(), findOne: jest.fn() },
    Doctor: { findByPk: jest.fn() },
    Notification: { count: jest.fn(), findAll: jest.fn(), update: jest.fn() },
    NotificationPreference: { findAll: jest.fn() },
    Patient: { findOne: jest.fn() },
    PatientAppointmentHistoryRead: { bulkCreate: jest.fn() },
    Specialities: { findByPk: jest.fn() },
}));

const { default: database } = await import("../../../config/database.js");
const {
    AppointmentHistory,
    Doctor,
    Notification,
    NotificationPreference,
    Patient,
    PatientAppointmentHistoryRead,
    Specialities,
} = await import("../../../src/models/associations.js");
const {
    getPatientNotificationSettings,
    getPatientUnreadNotificationCount,
    markPatientNotificationEntriesAsRead,
    markAllPatientNotificationEntriesAsRead,
    getPatientAppointmentActivityDetails,
} = await import("../../../src/modules/patient/services/notificationService.js");

describe("patient notification read state", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Patient.findOne.mockResolvedValue({
            id: 17,
            user: { email: "patient@example.com" },
            get: () => ({ id: 17 }),
        });
        Notification.count.mockResolvedValue(3);
        Notification.findAll.mockResolvedValue([]);
        Notification.update.mockResolvedValue([2]);
        NotificationPreference.findAll.mockResolvedValue([]);
        AppointmentHistory.count.mockResolvedValue(0);
        AppointmentHistory.findAll.mockResolvedValue([]);
        AppointmentHistory.findOne.mockResolvedValue(null);
        PatientAppointmentHistoryRead.bulkCreate.mockResolvedValue([]);
        database.query.mockResolvedValue([]);
        database.transaction.mockImplementation(async (callback) => callback({}));
    });

    test("counts unread notifications only for the authenticated patient's profile", async () => {
        await expect(getPatientUnreadNotificationCount(91)).resolves.toBe(3);
        expect(Patient.findOne).toHaveBeenCalledWith({
            where: { user_id: 91 },
            attributes: ["id"],
        });
        expect(Notification.count).toHaveBeenCalledWith({
            where: { patient_id: 17, read_at: null },
        });
    });

    test("adds unread appointment events to the provider notification badge count", async () => {
        AppointmentHistory.count.mockResolvedValue(4);
        await expect(getPatientUnreadNotificationCount(91)).resolves.toBe(7);
        expect(AppointmentHistory.count).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    event_type: { [Op.in]: ["Created", "Rescheduled", "Cancelled"] },
                }),
                distinct: true,
            }),
        );
    });

    test("does not mark notifications as read just because the history page is opened", async () => {
        NotificationPreference.findAll.mockResolvedValue([]);
        Notification.findAll.mockResolvedValue([]);
        await getPatientNotificationSettings(91);
        expect(Notification.update).not.toHaveBeenCalled();
        expect(PatientAppointmentHistoryRead.bulkCreate).not.toHaveBeenCalled();
    });

    test("uses the documented SMS default when no channel preferences are stored", async () => {
        const result = await getPatientNotificationSettings(91);

        expect(result.preferences).toHaveLength(9);
        expect(result.preferences.filter((preference) => preference.channel === "SMS")).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ eventType: "appointment_reminder", isEnabled: true }),
                expect.objectContaining({ eventType: "appointment_reschedule", isEnabled: true }),
                expect.objectContaining({ eventType: "appointment_cancellation", isEnabled: true }),
            ]),
        );
        expect(result.preferences.filter((preference) => preference.channel !== "SMS")).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ channel: "WhatsApp", isEnabled: false }),
                expect.objectContaining({ channel: "Email", isEnabled: false }),
            ]),
        );
    });

    test.each(["Created", "Rescheduled", "Cancelled"])(
        "includes the patient's persisted %s appointment event without creating a provider notification",
        async (eventType) => {
            const occurredAt = new Date("2026-11-03T15:00:00.000Z");
            const appointmentEvent = {
                id: 28,
                event_type: eventType,
                previous_values:
                    eventType === "Cancelled"
                        ? { start_at: "2026-11-08T15:00:00.000Z", reason: "private" }
                        : null,
                new_values:
                    eventType === "Cancelled"
                        ? { status: "Cancelled" }
                        : { start_at: "2026-11-08T16:00:00.000Z", reason: "private" },
                occurred_at: occurredAt,
                appointment: { id: 54, start_at: new Date("2026-11-08T16:00:00.000Z") },
            };
            AppointmentHistory.findAll.mockResolvedValue([appointmentEvent]);
            NotificationPreference.findAll.mockResolvedValue([]);
            Notification.findAll.mockResolvedValue([]);

            const result = await getPatientNotificationSettings(91);

            expect(AppointmentHistory.findAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        event_type: { [Op.in]: ["Created", "Rescheduled", "Cancelled"] },
                    },
                    include: expect.arrayContaining([
                        expect.objectContaining({
                            association: "patientReadReceipts",
                            where: { patient_id: 17 },
                            required: false,
                        }),
                        expect.objectContaining({
                            association: "appointment",
                            where: { patient_id: 17 },
                            required: true,
                        }),
                    ]),
                }),
            );
            expect(result.history).toEqual([
                expect.objectContaining({
                    id: "appointment-28",
                    isInAppActivity: true,
                    channel: "En SaludVital",
                    statusLabel: "Registrada",
                    readAt: null,
                }),
            ]);
            expect(JSON.stringify(result.history)).not.toContain("private");
            expect(Notification.findAll).toHaveBeenCalledWith(
                expect.objectContaining({ where: { patient_id: 17 } }),
            );
        },
    );

    test("merges in-app activity with channel records newest first", async () => {
        NotificationPreference.findAll.mockResolvedValue([]);
        Notification.findAll.mockResolvedValue([
            {
                id: 9,
                event_type: "appointment_reminder",
                channel: "SMS",
                status: "Sent",
                scheduled_at: new Date("2026-11-02T15:00:00.000Z"),
                sent_at: null,
                read_at: null,
            },
        ]);
        AppointmentHistory.findAll.mockResolvedValue([
            {
                id: 10,
                event_type: "Created",
                new_values: { start_at: "2026-11-08T16:00:00.000Z" },
                occurred_at: new Date("2026-11-03T15:00:00.000Z"),
                appointment: { id: 54, start_at: new Date("2026-11-08T16:00:00.000Z") },
            },
        ]);

        const result = await getPatientNotificationSettings(91);

        expect(result.history.map((item) => item.id)).toEqual(["appointment-10", 9]);
        expect(result.history[1].statusLabel).toBe("Aceptado por el proveedor");
    });

    test("returns the full history when it contains more than twenty entries", async () => {
        Notification.findAll.mockResolvedValue(
            Array.from({ length: 12 }, (_, index) => ({
                id: index + 1,
                event_type: "appointment_reminder",
                channel: "SMS",
                status: "Sent",
                scheduled_at: new Date(
                    `2026-11-${String(index + 1).padStart(2, "0")}T15:00:00.000Z`,
                ),
                sent_at: null,
                read_at: null,
            })),
        );
        AppointmentHistory.findAll.mockResolvedValue(
            Array.from({ length: 13 }, (_, index) => ({
                id: index + 1,
                event_type: "Created",
                new_values: { start_at: "2026-11-30T16:00:00.000Z" },
                occurred_at: new Date(
                    `2026-10-${String(index + 1).padStart(2, "0")}T15:00:00.000Z`,
                ),
                appointment: { id: index + 1, start_at: new Date("2026-11-30T16:00:00.000Z") },
            })),
        );

        const result = await getPatientNotificationSettings(91);

        expect(result.history).toHaveLength(25);
        expect(Notification.findAll).toHaveBeenCalledWith(
            expect.not.objectContaining({ limit: 20 }),
        );
        expect(AppointmentHistory.findAll).toHaveBeenCalledWith(
            expect.not.objectContaining({ limit: 20 }),
        );
    });

    test("leaves notification and appointment activity unread until explicitly opened or marked", async () => {
        NotificationPreference.findAll.mockResolvedValue([]);
        Notification.findAll.mockResolvedValue([
            {
                id: 71,
                event_type: "appointment_reminder",
                channel: "SMS",
                status: "Pending",
                scheduled_at: new Date("2026-11-02T15:00:00.000Z"),
                sent_at: null,
                read_at: null,
            },
        ]);
        AppointmentHistory.findAll.mockResolvedValue([
            {
                id: 72,
                event_type: "Rescheduled",
                new_values: { start_at: "2026-11-08T16:00:00.000Z" },
                occurred_at: new Date("2026-11-03T15:00:00.000Z"),
                appointment: { id: 54, start_at: new Date("2026-11-08T16:00:00.000Z") },
            },
        ]);

        const result = await getPatientNotificationSettings(91);

        expect(result.history.map((item) => item.id)).toEqual(["appointment-72", 71]);
        expect(result.history[0].readAt).toBeNull();
        expect(Notification.update).not.toHaveBeenCalled();
    });

    test("marks owned appointment activity as read and returns the combined unread count", async () => {
        AppointmentHistory.findAll.mockResolvedValue([{ id: 33 }]);
        AppointmentHistory.count.mockResolvedValue(2);
        await expect(markPatientNotificationEntriesAsRead(91, [], [33])).resolves.toEqual({
            unreadCount: 5,
        });
        expect(PatientAppointmentHistoryRead.bulkCreate).toHaveBeenCalledWith(
            [{ patient_id: 17, appointment_history_id: 33, read_at: expect.any(Date) }],
            { ignoreDuplicates: true },
        );
        expect(AppointmentHistory.findAll.mock.calls[0][0].include[0].where).toEqual({
            patient_id: 17,
        });
    });

    test("marks all of the patient's notification sources as read in a transaction", async () => {
        AppointmentHistory.count.mockResolvedValue(0);
        await expect(markAllPatientNotificationEntriesAsRead(91)).resolves.toEqual({
            unreadCount: 3,
        });
        expect(database.query).toHaveBeenCalledWith(
            expect.stringContaining("INSERT IGNORE INTO patient_appointment_history_reads"),
            expect.objectContaining({ replacements: expect.objectContaining({ patientId: 17 }) }),
        );
        expect(Notification.update).toHaveBeenCalledWith(
            { read_at: expect.any(Date) },
            expect.objectContaining({ where: { patient_id: 17, read_at: null }, transaction: {} }),
        );
    });

    test("returns appointment details using the event's actual doctor and safe photo path", async () => {
        AppointmentHistory.findOne.mockResolvedValue({
            id: 33,
            event_type: "Rescheduled",
            previous_values: {},
            new_values: { start_at: "2026-11-08T16:00:00.000Z", doctor_id: 8, specialty_id: 4 },
            occurred_at: new Date("2026-11-03T15:00:00.000Z"),
            appointment: {
                id: 54,
                start_at: new Date("2026-11-08T16:00:00.000Z"),
                doctor_id: 8,
                specialty_id: 4,
            },
        });
        Doctor.findByPk.mockResolvedValue({
            display_name: "Dra. Real",
            profile_photo_url: "/uploads/doctor.png",
        });
        Specialities.findByPk.mockResolvedValue({ name: "Medicina general" });
        await expect(getPatientAppointmentActivityDetails(91, "33")).resolves.toMatchObject({
            eventLabel: "Cita reprogramada",
            appointmentStatus: "Confirmada",
            specialty: "Medicina general",
            doctor: { name: "Dra. Real", photoUrl: "/uploads/doctor.png" },
        });
        expect(AppointmentHistory.findOne.mock.calls[0][0].include[0].where).toEqual({
            patient_id: 17,
        });
    });

    test("does not disclose appointment activity owned by another patient", async () => {
        await expect(getPatientAppointmentActivityDetails(91, "33")).rejects.toMatchObject({
            status: 404,
        });
        expect(Doctor.findByPk).not.toHaveBeenCalled();
    });

    test("does not return an external doctor photo URL", async () => {
        AppointmentHistory.findOne.mockResolvedValue({
            id: 34,
            event_type: "Created",
            new_values: { doctor_id: 8, specialty_id: 4 },
            occurred_at: new Date("2026-11-03T15:00:00.000Z"),
            appointment: { doctor_id: 8, specialty_id: 4 },
        });
        Doctor.findByPk.mockResolvedValue({
            display_name: "Dr. Ejemplo",
            profile_photo_url: "//external.example/photo.png",
        });
        Specialities.findByPk.mockResolvedValue({ name: "Medicina general" });
        await expect(getPatientAppointmentActivityDetails(91, "34")).resolves.toMatchObject({
            doctor: { photoUrl: null },
        });
    });
});
