import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const gte = Symbol("gte");
const lt = Symbol("lt");
const inValues = Symbol("in");
const like = Symbol("like");
const or = Symbol("or");
const and = Symbol("and");

jest.unstable_mockModule("sequelize", () => ({
    col: jest.fn((value) => value),
    fn: jest.fn((...values) => values),
    Op: { gte, lt, in: inValues, like, or, and },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Notification: { findAll: jest.fn(), findAndCountAll: jest.fn() },
    Patient: {},
}));

const { Notification } = await import("../../src/models/associations.js");
const { getAdminNotificationDashboard } =
    await import("../../src/modules/admin/services/adminNotificationDashboardService.js");

function notificationRow(overrides = {}) {
    const row = {
        id: 7,
        recipient_address: "+573137498332",
        event_type: "appointment_reminder",
        channel: "WhatsApp",
        status: "Sent",
        provider_delivery_status: "delivered",
        created_at: new Date("2026-10-30T15:00:00.000Z"),
        updated_at: new Date("2026-10-30T15:01:00.000Z"),
        sent_at: new Date("2026-10-30T15:00:30.000Z"),
        patient: { first_name: "María", last_name: "López" },
        payload: { appointmentReason: "Sensitive free text" },
        provider_message_id: "private-provider-id",
        last_error: "private error details",
        payloadDate: "31 de octubre de 2026",
        payloadTime: "7:30 a. m.",
        ...overrides,
    };
    return { get: () => row };
}

describe("administrator notification dashboard service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Notification.findAll.mockResolvedValue([
            { status: "Sent", provider_delivery_status: "delivered", count: "2" },
            { status: "Sent", provider_delivery_status: "read", count: "1" },
            { status: "Failed", provider_delivery_status: "failed", count: "1" },
            { status: "Failed", provider_delivery_status: null, count: "1" },
            { status: "Pending", provider_delivery_status: null, count: "2" },
            { status: "Processing", provider_delivery_status: null, count: "1" },
            { status: "Sent", provider_delivery_status: "sent", count: "1" },
            { status: "Sent", provider_delivery_status: null, count: "1" },
            { status: "Cancelled", provider_delivery_status: null, count: "4" },
        ]);
        Notification.findAndCountAll.mockResolvedValue({
            count: 1,
            rows: [notificationRow()],
        });
    });

    test("counts persisted records without treating provider acceptance as delivery", async () => {
        const data = await getAdminNotificationDashboard({}, new Date("2026-10-30T16:00:00.000Z"));

        expect(data.summary).toEqual({ totalSent: 6, delivered: 3, failed: 2, pending: 5 });
        expect(data.period).toMatchObject({ days: 30, timeZone: "America/Bogota" });
        expect(data.deliverySemantics.delivered).toMatch(/Meta/);
        expect(Notification.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    created_at: {
                        [gte]: new Date("2026-10-01T05:00:00.000Z"),
                        [lt]: new Date("2026-10-31T05:00:00.000Z"),
                    },
                },
            }),
        );
    });

    test("masks destinations and excludes message payload, provider IDs, and error data", async () => {
        const data = await getAdminNotificationDashboard();

        expect(data.rows[0]).toMatchObject({
            recipientName: "María López",
            maskedRecipient: "••• 8332",
            deliveryStatus: "Entregada",
            providerStatus: "Entregado por Meta",
        });
        expect(data.rows[0]).not.toHaveProperty("payload");
        expect(data.rows[0]).not.toHaveProperty("provider_message_id");
        expect(data.rows[0]).not.toHaveProperty("last_error");
        const listQuery = Notification.findAndCountAll.mock.calls[0][0];
        expect(listQuery.order[0]).toEqual([
            ["COALESCE", "Notification.sent_at", "Notification.created_at"],
            "DESC",
        ]);
        expect(listQuery.order[1]).toEqual(["id", "DESC"]);
        expect(listQuery.attributes).not.toContain("payload");
        expect(listQuery.attributes).not.toContain("provider_message_id");
        expect(listQuery.attributes).not.toContain("last_error");
    });

    test("applies combined channel, status, search, period, and pagination filters", async () => {
        Notification.findAndCountAll.mockResolvedValue({ count: 19, rows: [notificationRow()] });
        const data = await getAdminNotificationDashboard({
            channel: "WhatsApp",
            status: "delivered",
            search: "Maria",
            period: "7",
            page: "2",
        });

        const listQuery = Notification.findAndCountAll.mock.calls[0][0];
        const conditions = listQuery.where[and];
        expect(conditions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ channel: "WhatsApp" }),
                expect.objectContaining({
                    provider_delivery_status: { [inValues]: ["delivered", "read"] },
                }),
                expect.objectContaining({ [or]: expect.any(Array) }),
            ]),
        );
        expect(listQuery.limit).toBe(8);
        expect(listQuery.offset).toBe(8);
        expect(data.filters).toEqual({ channel: "WhatsApp", status: "delivered", search: "Maria" });
        expect(data.pagination).toMatchObject({ page: 2, totalItems: 19, totalPages: 3 });
    });

    test("returns zero metrics and a useful empty page when there are no records", async () => {
        Notification.findAll.mockResolvedValue([]);
        Notification.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

        const data = await getAdminNotificationDashboard();

        expect(data.summary).toEqual({ totalSent: 0, delivered: 0, failed: 0, pending: 0 });
        expect(data.rows).toEqual([]);
        expect(data.pagination).toMatchObject({ page: 1, totalItems: 0, totalPages: 1 });
    });

    test.each([
        [{ period: "14" }, "período"],
        [{ channel: "System" }, "canal"],
        [{ status: "unknown" }, "estado"],
        [{ page: "0" }, "página"],
        [{ search: "x".repeat(101) }, "100 caracteres"],
    ])("rejects unsupported filters %j", async (query, expectedMessage) => {
        await expect(getAdminNotificationDashboard(query)).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining(expectedMessage),
        });
    });

    test("masks email destinations without exposing the full address", async () => {
        Notification.findAndCountAll.mockResolvedValue({
            count: 1,
            rows: [
                notificationRow({
                    channel: "Email",
                    recipient_address: "patient@example.com",
                    provider_delivery_status: null,
                }),
            ],
        });

        const data = await getAdminNotificationDashboard();

        expect(data.rows[0].maskedRecipient).toBe("p•••@example.com");
        expect(data.rows[0].providerStatus).toBe("Sin confirmación final del proveedor");
    });

    test("does not reconstruct provider-managed WhatsApp template content", async () => {
        Notification.findAndCountAll.mockResolvedValue({
            count: 1,
            rows: [notificationRow({ channel: "WhatsApp" })],
        });

        const data = await getAdminNotificationDashboard();

        expect(data.rows[0].messagePreview).toBe(
            "Plantilla de WhatsApp administrada por el proveedor; texto no almacenado.",
        );
    });

    test("builds an appointment preview from the persisted non-clinical date and time", async () => {
        Notification.findAndCountAll.mockResolvedValue({
            count: 1,
            rows: [notificationRow({ channel: "Email" })],
        });

        const data = await getAdminNotificationDashboard();

        expect(data.rows[0].messagePreview).toBe(
            "SaludVital: Te recordamos tu cita el 31 de octubre de 2026 a las 7:30 a. m.",
        );
        const selectedAttributes = Notification.findAndCountAll.mock.calls[0][0].attributes;
        expect(selectedAttributes).not.toContain("payload");
        expect(selectedAttributes).not.toContain("last_error");
    });
});
