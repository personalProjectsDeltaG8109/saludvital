import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../../config/database.js", () => ({
    default: { transaction: jest.fn(async (callback) => callback({ id: "transaction" })) },
}));
jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    Notification: {},
    NotificationPreference: { findAll: jest.fn(), upsert: jest.fn() },
    Patient: { findOne: jest.fn() },
}));

const { default: database } = await import("../../../config/database.js");
const { NotificationPreference, Patient } = await import("../../../src/models/associations.js");
const { updatePatientNotificationChannel } =
    await import("../../../src/modules/patient/services/notificationService.js");

describe("patient notification channel settings", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Patient.findOne.mockResolvedValue({ id: 17 });
        NotificationPreference.findAll.mockResolvedValue([]);
        NotificationPreference.upsert.mockResolvedValue(undefined);
    });

    test("saves a channel switch across the supported appointment notification events", async () => {
        await expect(updatePatientNotificationChannel(91, "WhatsApp", true)).resolves.toEqual({
            channelStates: { WhatsApp: true, SMS: true, Email: false },
        });

        expect(Patient.findOne).toHaveBeenCalledWith({
            where: { user_id: 91 },
            attributes: ["id"],
        });
        expect(database.transaction).toHaveBeenCalledTimes(1);
        expect(NotificationPreference.upsert).toHaveBeenCalledTimes(9);
        expect(NotificationPreference.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                patient_id: 17,
                channel: "WhatsApp",
                event_type: "appointment_reminder",
                is_enabled: true,
            }),
            { transaction: { id: "transaction" } },
        );
    });

    test("does not allow disabling the patient's only active channel", async () => {
        NotificationPreference.findAll.mockResolvedValue(
            ["WhatsApp", "SMS", "Email"].flatMap((channel) =>
                ["appointment_reminder", "appointment_reschedule", "appointment_cancellation"].map(
                    (eventType) => ({
                        channel,
                        event_type: eventType,
                        is_enabled: channel === "WhatsApp",
                    }),
                ),
            ),
        );

        await expect(updatePatientNotificationChannel(91, "WhatsApp", false)).rejects.toMatchObject(
            {
                status: 400,
            },
        );
        expect(NotificationPreference.upsert).not.toHaveBeenCalled();
        expect(database.transaction).not.toHaveBeenCalled();
    });

    test("rejects unsupported channels and non-boolean values", async () => {
        await expect(updatePatientNotificationChannel(91, "Messenger", true)).rejects.toMatchObject(
            {
                status: 400,
            },
        );
        await expect(updatePatientNotificationChannel(91, "SMS", "true")).rejects.toMatchObject({
            status: 400,
        });
        expect(Patient.findOne).not.toHaveBeenCalled();
    });
});
