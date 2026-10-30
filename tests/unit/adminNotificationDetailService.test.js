import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: {},
    AppointmentStatus: {},
    Notification: { findByPk: jest.fn() },
    Patient: {},
}));

const { Notification } = await import("../../src/models/associations.js");
const { getAdminNotificationDetails } =
    await import("../../src/modules/admin/services/adminNotificationDetailService.js");

function notificationRecord(overrides = {}) {
    const row = {
        id: 52,
        channel: "WhatsApp",
        recipient_address: "+573137498332",
        event_type: "appointment_reminder",
        status: "Sent",
        scheduled_at: new Date("2026-10-30T14:00:00.000Z"),
        sent_at: new Date("2026-10-30T14:01:00.000Z"),
        attempt_count: 1,
        provider_message_id: "wamid.HBgMNTczMTM3NDk4MzMyFQIAERgSMzAxODg1M0E3MzQ3MzdCMzQ5AA==",
        provider_delivery_status: "delivered",
        last_error: null,
        created_at: new Date("2026-10-30T13:59:00.000Z"),
        updated_at: new Date("2026-10-30T14:02:00.000Z"),
        patient: { first_name: "Laura", last_name: "Méndez", document_number: "123456789" },
        appointment: {
            id: 81,
            start_at: new Date("2026-10-31T12:00:00.000Z"),
            end_at: new Date("2026-10-31T12:30:00.000Z"),
            status: { name: "Confirmed" },
            reason: "Sensitive clinical detail",
        },
        payload: { appointmentReason: "Sensitive payload" },
        ...overrides,
    };
    return { get: () => row };
}

describe("administrator notification detail service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Notification.findByPk.mockResolvedValue(notificationRecord());
    });

    test("returns a safe chronological detail from a persisted notification", async () => {
        const detail = await getAdminNotificationDetails("52");

        expect(detail).toMatchObject({
            id: 52,
            eventType: "Recordatorio de cita",
            channel: "WhatsApp",
            recipientName: "Laura Méndez",
            maskedRecipient: "•••• 8332",
            applicationStatus: "Aceptada por el proveedor",
            providerStatus: "Entregado por Meta",
            providerReference: "••••AA==",
            appointment: { id: 81, status: "Confirmada" },
        });
        expect(detail.events.map(({ type }) => type)).toEqual(["created", "accepted", "provider"]);
        expect(detail.events.map(({ occurredAt }) => occurredAt)).toEqual([
            "2026-10-30T13:59:00.000Z",
            "2026-10-30T14:01:00.000Z",
            "2026-10-30T14:02:00.000Z",
        ]);
        expect(detail).not.toHaveProperty("payload");
        expect(detail).not.toHaveProperty("last_error");
        expect(detail).not.toHaveProperty("patient.document_number");
        expect(JSON.stringify(detail)).not.toContain("Sensitive");

        const query = Notification.findByPk.mock.calls[0][1];
        expect(query.attributes).not.toContain("payload");
        expect(query.attributes).toContain("last_error");
        expect(query.include[1].include[0].attributes).toEqual(["name"]);
        expect(query.include[1].attributes).not.toContain("reason");
    });

    test.each(["", "0", "1.5", "1e3", "4294967296", ["52"]])(
        "rejects invalid notification identifier %j before querying",
        async (id) => {
            await expect(getAdminNotificationDetails(id)).rejects.toMatchObject({
                statusCode: 400,
            });
            expect(Notification.findByPk).not.toHaveBeenCalled();
        },
    );

    test("returns not found when no persisted notification matches", async () => {
        Notification.findByPk.mockResolvedValue(null);

        await expect(getAdminNotificationDetails("999")).rejects.toMatchObject({
            statusCode: 404,
            message: "No encontramos la notificación solicitada.",
        });
    });

    test("shows an unknown provider state when no delivery data is stored", async () => {
        Notification.findByPk.mockResolvedValue(
            notificationRecord({
                status: "Pending",
                sent_at: null,
                provider_message_id: null,
                provider_delivery_status: null,
                last_error: null,
                updated_at: null,
                appointment: null,
            }),
        );

        const detail = await getAdminNotificationDetails("52");

        expect(detail.providerStatus).toBe("Sin confirmación final del proveedor");
        expect(detail.providerReference).toBeNull();
        expect(detail.acceptedAt).toBeNull();
        expect(detail.events).toHaveLength(1);
        expect(detail.events[0].type).toBe("created");
        expect(detail.appointment).toBeNull();
    });

    test("returns a safe failure category without raw errors or secrets", async () => {
        Notification.findByPk.mockResolvedValue(
            notificationRecord({
                status: "Failed",
                provider_delivery_status: "failed",
                last_error:
                    "Meta WhatsApp delivery failed with provider code 131026. Bearer secret-token-123",
            }),
        );

        const detail = await getAdminNotificationDetails("52");

        expect(detail.failure).toEqual({
            description: "Meta informó que no pudo entregar el mensaje.",
            providerCode: "131026",
        });
        expect(JSON.stringify(detail)).not.toContain("secret-token-123");
        expect(JSON.stringify(detail)).not.toContain("Bearer");
    });
});
