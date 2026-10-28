import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const gte = Symbol("gte");
const lt = Symbol("lt");
const like = Symbol("like");
const or = Symbol("or");

jest.unstable_mockModule("sequelize", () => ({
    col: jest.fn((value) => value),
    fn: jest.fn((...values) => values),
    Op: { gte, lt, like, or },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({}));
jest.unstable_mockModule("../../src/models/Notification.js", () => ({
    default: { count: jest.fn(), findAll: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/Patient.js", () => ({ default: {} }));
jest.unstable_mockModule("../../src/models/Specialities.js", () => ({
    default: { findAll: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/Doctor.js", () => ({ default: {} }));
jest.unstable_mockModule("../../src/models/WhatsAppAppointmentRequest.js", () => ({
    default: { count: jest.fn(), findAll: jest.fn(), findAndCountAll: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/WhatsAppConversation.js", () => ({
    default: { count: jest.fn(), findAll: jest.fn(), findAndCountAll: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/WhatsAppMessage.js", () => ({
    default: { findAll: jest.fn() },
}));
jest.unstable_mockModule("../../src/modules/admin/services/adminDashboardService.js", () => ({
    getWhatsAppIntegrationStatus: jest.fn(() => "Configured"),
}));

const Notification = (await import("../../src/models/Notification.js")).default;
const WhatsAppAppointmentRequest = (await import("../../src/models/WhatsAppAppointmentRequest.js"))
    .default;
const WhatsAppConversation = (await import("../../src/models/WhatsAppConversation.js")).default;
const Specialities = (await import("../../src/models/Specialities.js")).default;
const WhatsAppMessage = (await import("../../src/models/WhatsAppMessage.js")).default;
const { getAdminWhatsAppData } =
    await import("../../src/modules/admin/services/adminWhatsAppService.js");

function modelRecord(record) {
    return { get: () => ({ ...record }) };
}

describe("administrator WhatsApp overview service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        WhatsAppConversation.count.mockReset().mockResolvedValue(0);
        WhatsAppConversation.findAll.mockReset().mockResolvedValue([]);
        WhatsAppConversation.findAndCountAll.mockReset().mockResolvedValue({ count: 0, rows: [] });
        WhatsAppAppointmentRequest.count.mockReset().mockResolvedValue(0);
        WhatsAppAppointmentRequest.findAll.mockReset();
        WhatsAppAppointmentRequest.findAll
            .mockResolvedValueOnce([{ status: "Pending", count: "2" }])
            .mockResolvedValueOnce([
                { status: "Pending", count: "2" },
                { status: "Confirmed", count: "1" },
            ])
            .mockResolvedValueOnce([]);
        WhatsAppAppointmentRequest.findAndCountAll
            .mockReset()
            .mockResolvedValue({ count: 0, rows: [] });
        Specialities.findAll.mockReset().mockResolvedValue([]);
        Notification.count.mockReset().mockResolvedValue(0);
        Notification.findAll.mockReset().mockResolvedValue([]);
        WhatsAppMessage.findAll.mockReset().mockResolvedValue([]);
    });

    test("uses real request statuses and safe message projections", async () => {
        WhatsAppAppointmentRequest.findAll.mockReset();
        WhatsAppAppointmentRequest.findAll
            .mockResolvedValueOnce([{ status: "Pending", count: "2" }])
            .mockResolvedValueOnce([
                { status: "Pending", count: "2" },
                { status: "Confirmed", count: "1" },
            ])
            .mockResolvedValueOnce([
                modelRecord({
                    id: 8,
                    status: "Pending",
                    created_at: new Date("2026-10-28T15:00:00Z"),
                    patient: { first_name: "Laura", last_name: "Méndez", phone: "private" },
                    requestedSpecialty: { name: "Pediatría" },
                }),
            ]);
        Notification.findAll.mockReset();
        Notification.findAll.mockResolvedValue([
            {
                event_type: "appointment_reminder",
                status: "Sent",
                created_at: new Date("2026-10-28T15:00:00Z"),
            },
        ]);
        WhatsAppMessage.findAll.mockResolvedValue([
            modelRecord({
                direction: "Inbound",
                message_type: "text",
                processing_status: "Processed",
                created_at: new Date("2026-10-28T15:00:00Z"),
                content: "clinical content must not be returned",
                conversation: { patient: { first_name: "Laura", last_name: "Méndez" } },
            }),
        ]);

        const result = await getAdminWhatsAppData({}, new Date("2026-10-28T16:00:00Z"));

        expect(
            result.appointmentRequestStatuses.map(({ status, count }) => [status, count]),
        ).toEqual([
            ["Pending", 2],
            ["Confirmed", 1],
            ["Rejected", 0],
            ["Cancelled", 0],
            ["Expired", 0],
        ]);
        expect(result.requestStatusTotal).toBe(3);
        expect(result.summary.requestsToday).toBe(2);
        expect(result.summary.pendingRequestsToday).toBe(2);
        expect(result.recentRequests[0]).toMatchObject({
            patientName: "Laura Méndez",
            specialty: "Pediatría",
            statusLabel: "Pendiente",
        });
        expect(result.recentSystemEvents[0]).toMatchObject({
            event: "Recordatorio de cita",
            statusLabel: "Enviado",
        });
        expect(result.recentMessagePreviews[0]).toEqual(
            expect.objectContaining({
                directionLabel: "Mensaje recibido",
                patientName: "Laura Méndez",
            }),
        );
        expect(JSON.stringify(result)).not.toMatch(
            /clinical content|private|content"|password|token/i,
        );
        expect(WhatsAppMessage.findAll.mock.calls[0][0].attributes).not.toContain("content");
        expect(Notification.findAll.mock.calls[0][0].attributes).not.toEqual(
            expect.arrayContaining(["payload", "recipient_address", "last_error"]),
        );
    });

    test("applies inclusive Bogota calendar boundaries to the selectable activity period", async () => {
        const referenceDate = new Date("2026-10-28T16:00:00.000Z");
        await getAdminWhatsAppData({ period: "7" }, referenceDate);

        const activityQuery = WhatsAppConversation.findAll.mock.calls[1][0];
        expect(activityQuery.where.started_at[gte]).toEqual(new Date("2026-10-22T05:00:00.000Z"));
        expect(activityQuery.where.started_at[lt]).toEqual(new Date("2026-10-29T05:00:00.000Z"));
        expect(WhatsAppAppointmentRequest.findAll.mock.calls[1][0].where.created_at[gte]).toEqual(
            new Date("2026-09-29T05:00:00.000Z"),
        );
        expect(WhatsAppAppointmentRequest.findAll.mock.calls[1][0].where.created_at[lt]).toEqual(
            new Date("2026-10-29T05:00:00.000Z"),
        );
    });

    test("rejects unsupported periods without querying models", async () => {
        await expect(getAdminWhatsAppData({ period: "14" })).rejects.toMatchObject({
            statusCode: 400,
            message: "El período de actividad no es válido.",
        });
        expect(WhatsAppConversation.findAll).not.toHaveBeenCalled();
    });

    test("adjusts an out-of-range request page and fetches the last available page", async () => {
        WhatsAppAppointmentRequest.findAndCountAll
            .mockResolvedValueOnce({ count: 17, rows: [] })
            .mockResolvedValueOnce({
                count: 17,
                rows: [
                    modelRecord({
                        status: "Confirmed",
                        created_at: new Date("2026-10-28T15:00:00Z"),
                        patient: { first_name: "Carlos", last_name: "Rojas" },
                        requestedSpecialty: null,
                    }),
                ],
            });

        const result = await getAdminWhatsAppData(
            { tab: "requests", page: "5" },
            new Date("2026-10-28T16:00:00Z"),
        );

        expect(result.pagination).toMatchObject({ page: 3, totalPages: 3, totalItems: 17 });
        expect(result.rows).toHaveLength(1);
        expect(WhatsAppAppointmentRequest.findAndCountAll).toHaveBeenCalledTimes(2);
        expect(WhatsAppAppointmentRequest.findAndCountAll.mock.calls[0][0].offset).toBe(32);
        expect(WhatsAppAppointmentRequest.findAndCountAll.mock.calls[1][0].offset).toBe(16);
    });

    test("combines WhatsApp request filters and returns only masked contact data", async () => {
        Specialities.findAll.mockResolvedValue([
            { id: 4, name: "Pediatría" },
            { id: 5, name: "Medicina General" },
        ]);
        WhatsAppAppointmentRequest.findAndCountAll.mockResolvedValueOnce({
            count: 1,
            rows: [
                modelRecord({
                    status: "Confirmed",
                    created_at: new Date("2026-10-28T15:00:00Z"),
                    updated_at: new Date("2026-10-28T16:00:00Z"),
                    patient: {
                        first_name: "Laura",
                        last_name: "Mendez",
                        phone: "+573001234567",
                    },
                    requestedSpecialty: { name: "Pediatría" },
                }),
            ],
        });

        const result = await getAdminWhatsAppData({
            tab: "requests",
            search: "Laura",
            status: "Confirmed",
            specialtyId: "4",
            dateFrom: "2026-10-22",
            dateTo: "2026-10-28",
        });

        const query = WhatsAppAppointmentRequest.findAndCountAll.mock.calls[0][0];
        expect(query.where).toMatchObject({
            status: "Confirmed",
            requested_specialty_id: 4,
            created_at: {
                [gte]: new Date("2026-10-22T05:00:00Z"),
                [lt]: new Date("2026-10-29T05:00:00Z"),
            },
        });
        expect(query.where[or]).toEqual(
            expect.arrayContaining([
                { "$patient.first_name$": { [like]: "%Laura%" } },
                { "$patient.phone$": { [like]: "%Laura%" } },
            ]),
        );
        expect(query.order).toEqual([
            ["created_at", "DESC"],
            ["id", "DESC"],
        ]);
        expect(query.limit).toBe(8);
        expect(result.rows[0]).toMatchObject({
            patientName: "Laura Mendez",
            contactNumber: "••••567",
            specialty: "Pediatría",
            statusLabel: "Confirmada",
            updatedAt: new Date("2026-10-28T16:00:00Z"),
        });
        expect(JSON.stringify(result.rows)).not.toContain("+573001234567");
        expect(result.requestSpecialties).toEqual([
            { id: 4, name: "Pediatría" },
            { id: 5, name: "Medicina General" },
        ]);
    });

    test("rejects invalid WhatsApp request status and date ranges", async () => {
        await expect(
            getAdminWhatsAppData({ tab: "requests", status: "InProgress" }),
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            getAdminWhatsAppData({
                tab: "requests",
                dateFrom: "2026-10-29",
                dateTo: "2026-10-28",
            }),
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            getAdminWhatsAppData({ tab: "requests", dateFrom: "2026-02-30" }),
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    test("validates specialty identifiers and shows empty request results", async () => {
        Specialities.findAll.mockResolvedValue([{ id: 4, name: "Pediatría" }]);
        await expect(
            getAdminWhatsAppData({ tab: "requests", specialtyId: "99" }),
        ).rejects.toMatchObject({ statusCode: 400 });

        WhatsAppAppointmentRequest.findAll.mockReset();
        WhatsAppAppointmentRequest.findAll
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const result = await getAdminWhatsAppData({ tab: "requests", specialtyId: "4" });

        expect(result.rows).toEqual([]);
        expect(result.pagination).toMatchObject({ totalItems: 0, totalPages: 1 });
    });

    test("keeps unavailable chatbot state distinct from provider configuration", async () => {
        const result = await getAdminWhatsAppData({}, new Date("2026-10-28T16:00:00Z"));

        expect(result.chatbotStatus).toBe("Unknown");
        expect(result.chatbotStatusMessage).toContain("No hay una verificación operativa");
        expect(result.summary.configurationStatus).toBe("Configured");
        expect(result.flowUnavailableMessage).toContain("No hay un catálogo de flujos");
    });
});
