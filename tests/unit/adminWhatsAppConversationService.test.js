import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const like = Symbol("like");
const or = Symbol("or");
jest.unstable_mockModule("sequelize", () => ({
    col: jest.fn((value) => value),
    fn: jest.fn((...values) => values),
    Op: { gte: Symbol("gte"), lt: Symbol("lt"), like, or },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({}));
jest.unstable_mockModule("../../src/models/Notification.js", () => ({
    default: { count: jest.fn(), findAll: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/Patient.js", () => ({ default: {} }));
jest.unstable_mockModule("../../src/models/Specialities.js", () => ({ default: {} }));
jest.unstable_mockModule("../../src/models/WhatsAppAppointmentRequest.js", () => ({
    default: { count: jest.fn(), findAll: jest.fn(), findAndCountAll: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/WhatsAppConversation.js", () => ({
    default: {
        count: jest.fn(),
        findAll: jest.fn(),
        findAndCountAll: jest.fn(),
        findByPk: jest.fn(),
    },
}));
jest.unstable_mockModule("../../src/models/WhatsAppMessage.js", () => ({
    default: { findAll: jest.fn(), findAndCountAll: jest.fn() },
}));
jest.unstable_mockModule("../../src/modules/admin/services/adminDashboardService.js", () => ({
    getWhatsAppIntegrationStatus: jest.fn(() => "Configured"),
}));

const Notification = (await import("../../src/models/Notification.js")).default;
const WhatsAppAppointmentRequest = (await import("../../src/models/WhatsAppAppointmentRequest.js"))
    .default;
const WhatsAppConversation = (await import("../../src/models/WhatsAppConversation.js")).default;
const WhatsAppMessage = (await import("../../src/models/WhatsAppMessage.js")).default;
const { getAdminWhatsAppConversation, getAdminWhatsAppData } =
    await import("../../src/modules/admin/services/adminWhatsAppService.js");

function modelRecord(record) {
    return { get: () => ({ ...record }) };
}

describe("administrator WhatsApp conversation search and detail", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        WhatsAppConversation.count.mockResolvedValue(0);
        WhatsAppConversation.findAll.mockResolvedValue([]);
        WhatsAppConversation.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
        WhatsAppConversation.findByPk.mockResolvedValue(null);
        WhatsAppAppointmentRequest.count.mockResolvedValue(0);
        WhatsAppAppointmentRequest.findAll
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
        WhatsAppAppointmentRequest.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
        Notification.count.mockResolvedValue(0);
        Notification.findAll.mockResolvedValue([]);
        WhatsAppMessage.findAll.mockResolvedValue([]);
        WhatsAppMessage.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
    });

    test("filters conversations by name and status and returns a masked contact number", async () => {
        WhatsAppConversation.findAndCountAll.mockResolvedValueOnce({
            count: 1,
            rows: [
                modelRecord({
                    id: 12,
                    status: "Active",
                    started_at: new Date("2026-10-28T14:00:00Z"),
                    last_activity_at: new Date("2026-10-28T15:00:00Z"),
                    patient: { first_name: "Laura", last_name: "Mendez", phone: "+573001234567" },
                }),
            ],
        });

        const result = await getAdminWhatsAppData({
            tab: "conversations",
            search: "Laura",
            status: "Active",
        });

        const query = WhatsAppConversation.findAndCountAll.mock.calls[0][0];
        expect(query.where.status).toBe("Active");
        expect(query.where[or]).toEqual(
            expect.arrayContaining([
                { "$patient.first_name$": { [like]: "%Laura%" } },
                { "$patient.phone$": { [like]: "%Laura%" } },
            ]),
        );
        expect(query.include[0].required).toBe(true);
        expect(query.limit).toBe(8);
        expect(result.rows[0]).toMatchObject({
            id: 12,
            patientName: "Laura Mendez",
            contactNumber: "••••567",
            statusLabel: "Activa",
        });
        expect(JSON.stringify(result.rows)).not.toContain("+573001234567");
    });

    test("rejects unsupported filters and overlong search values", async () => {
        await expect(
            getAdminWhatsAppData({ tab: "conversations", status: "Pending" }),
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            getAdminWhatsAppData({ tab: "conversations", search: "a".repeat(101) }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(WhatsAppConversation.findAndCountAll).not.toHaveBeenCalled();
    });

    test("adjusts conversation pagination to the last matching page", async () => {
        WhatsAppConversation.findAndCountAll
            .mockResolvedValueOnce({ count: 9, rows: [] })
            .mockResolvedValueOnce({
                count: 9,
                rows: [
                    modelRecord({
                        id: 9,
                        status: "Completed",
                        started_at: new Date("2026-10-27T14:00:00Z"),
                        last_activity_at: new Date("2026-10-27T15:00:00Z"),
                        patient: null,
                    }),
                ],
            });

        const result = await getAdminWhatsAppData({ tab: "conversations", page: "3" });

        expect(result.pagination).toMatchObject({ page: 2, totalPages: 2, totalItems: 9 });
        expect(WhatsAppConversation.findAndCountAll).toHaveBeenCalledTimes(2);
        expect(
            WhatsAppConversation.findAndCountAll.mock.calls.map(([query]) => query.offset),
        ).toEqual([16, 8]);
    });

    test("returns chronological messages and omits expired content and provider identifiers", async () => {
        WhatsAppConversation.findByPk.mockResolvedValue(
            modelRecord({
                id: 12,
                status: "Active",
                started_at: new Date("2026-10-28T14:00:00Z"),
                last_activity_at: new Date("2026-10-28T15:00:00Z"),
                ended_at: null,
                patient: { first_name: "Laura", last_name: "Mendez", phone: "+573001234567" },
            }),
        );
        WhatsAppMessage.findAndCountAll.mockResolvedValue({
            count: 2,
            rows: [
                modelRecord({
                    id: 3,
                    direction: "Inbound",
                    message_type: "text",
                    content: "<script>texto</script>",
                    processing_status: "Processed",
                    delivery_status: null,
                    received_at: new Date("2026-10-28T14:00:00Z"),
                    created_at: new Date("2026-10-28T14:00:00Z"),
                    content_expires_at: new Date("2026-10-29T00:00:00Z"),
                    provider_message_id: "private-provider-id",
                }),
                modelRecord({
                    id: 4,
                    direction: "Outbound",
                    message_type: "text",
                    content: "Texto vencido",
                    processing_status: "Processed",
                    delivery_status: "Sent",
                    received_at: null,
                    created_at: new Date("2026-10-28T15:00:00Z"),
                    content_expires_at: new Date("2026-10-28T14:30:00Z"),
                }),
            ],
        });

        const result = await getAdminWhatsAppConversation(
            "12",
            { page: "1" },
            new Date("2026-10-28T15:30:00Z"),
        );

        expect(WhatsAppMessage.findAndCountAll.mock.calls[0][0]).toMatchObject({
            where: { conversation_id: 12 },
            order: [
                ["created_at", "ASC"],
                ["id", "ASC"],
            ],
            limit: 40,
            offset: 0,
        });
        expect(result.messages.map((message) => message.id)).toEqual([3, 4]);
        expect(result.messages[0].content).toBe("<script>texto</script>");
        expect(result.messages[1]).toMatchObject({ content: null, contentExpired: true });
        expect(JSON.stringify(result)).not.toContain("private-provider-id");
        expect(result.pagination.pageSize).toBe(40);
    });

    test("validates conversation identifiers and returns missing records safely", async () => {
        await expect(getAdminWhatsAppConversation("abc")).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(getAdminWhatsAppConversation("404")).rejects.toMatchObject({
            statusCode: 404,
        });
        expect(WhatsAppMessage.findAndCountAll).not.toHaveBeenCalled();
    });
});
