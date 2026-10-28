import { describe, expect, test } from "@jest/globals";
import pug from "pug";

function createOverviewData(overrides = {}) {
    return {
        selectedTab: "summary",
        activityPeriodDays: 7,
        summary: {
            conversationsToday: 0,
            requestsToday: 0,
            pendingRequestsToday: 0,
            sentToday: 0,
            failedToday: 0,
            activeConversations: 0,
            configurationStatus: "Incomplete",
        },
        integrationConfiguration: {
            provider: "Twilio",
            status: "Incomplete",
            senderConfigured: false,
            credentialsConfigured: false,
            templates: [
                { name: "Recordatorio de cita", configured: false },
                { name: "Reprogramación de cita", configured: false },
                { name: "Cancelación de cita", configured: false },
            ],
        },
        chatbotStatus: "Unknown",
        chatbotStatusMessage: "No hay una verificación operativa del chatbot disponible.",
        conversationsByDay: [{ date: "2026-10-28", label: "Mié 28", count: 0 }],
        appointmentRequestStatuses: [
            { status: "Pending", label: "Pendientes", count: 0 },
            { status: "Confirmed", label: "Confirmadas", count: 0 },
            { status: "Rejected", label: "Rechazadas", count: 0 },
            { status: "Cancelled", label: "Canceladas", count: 0 },
            { status: "Expired", label: "Vencidas", count: 0 },
        ],
        requestStatusTotal: 0,
        requestStatusStyle: "conic-gradient(#e8eef7 0deg 360deg)",
        recentRequests: [],
        recentSystemEvents: [],
        recentMessagePreviews: [],
        notificationAlertCount: 0,
        flowUnavailableMessage: "No hay un catálogo de flujos del chatbot disponible.",
        rows: [],
        pagination: { page: 1, pageSize: 8, totalItems: 0, totalPages: 1 },
        ...overrides,
    };
}

describe("administrator WhatsApp overview view", () => {
    test("renders the six sections and honest empty or unavailable states", () => {
        const html = pug.renderFile("views/admin/whatsapp.pug", {
            pageTitle: "WhatsApp y chatbot | SaludVital",
            adminName: "Administradora",
            whatsapp: createOverviewData(),
        });

        expect(html).toContain("WhatsApp y chatbot");
        expect(html).toMatch(
            /<a class="admin-nav-link is-active" href="\/admin\/whatsapp"[^>]*aria-current="page"/,
        );
        expect(html).toContain("Conversaciones");
        expect(html).toContain("Solicitudes de citas");
        expect(html).toContain("Ver todos");
        expect(html).toMatch(/data-whatsapp-open-deliveries/);
        expect(html).toContain("Flujos del chatbot");
        expect(html).toContain("Plantillas de mensajes");
        expect(html).toContain("Configuración e integración");
        expect(html).toContain("No hay conversaciones iniciadas durante este período.");
        expect(html).toContain("No hay solicitudes registradas durante este período.");
        expect(html).toContain("Estado no disponible");
        expect(html).toContain("No verificado");
        expect(html).toContain("Configuración local incompleta");
        expect(html).not.toMatch(/Conectado|Activo|%|\+\d{10,}/);
    });

    test("escapes displayed names and excludes message content and provider secrets", () => {
        const html = pug.renderFile("views/admin/partials/admin-whatsapp-summary.pug", {
            whatsapp: createOverviewData({
                recentRequests: [
                    {
                        id: 1,
                        patientName: "<script>alert(1)</script>",
                        specialty: "Pediatría",
                        status: "Pending",
                        statusLabel: "Pendientes",
                        createdAt: new Date("2026-10-28T15:00:00Z"),
                    },
                ],
                recentMessagePreviews: [
                    {
                        patientName: "Laura Méndez",
                        initials: "L",
                        directionLabel: "Mensaje recibido",
                        messageTypeLabel: "Texto",
                        processingStatusLabel: "Procesado",
                        occurredAt: new Date("2026-10-28T15:00:00Z"),
                    },
                ],
            }),
        });

        expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(html).not.toContain("<script>alert(1)</script>");
        expect(html).toContain("Laura Méndez");
        expect(html).not.toMatch(/clinical notes|message body|auth token|account sid/i);
    });

    test("renders the delivery monitor with persisted statuses and safe failed-message details", () => {
        const html = pug.renderFile("views/admin/whatsapp.pug", {
            pageTitle: "WhatsApp y chatbot | SaludVital",
            adminName: "Administradora",
            whatsapp: createOverviewData({
                selectedTab: "deliveries",
                deliveryStatuses: [
                    { status: "Pending", label: "Pendiente", count: 1 },
                    { status: "Failed", label: "Fallido", count: 1 },
                ],
                deliveryTotal: 2,
                deliveryFilters: { status: "Failed", dateFrom: "", dateTo: "" },
                rows: [
                    {
                        recipientName: "Laura Mendez",
                        contactNumber: "••••567",
                        eventLabel: "Recordatorio de cita",
                        status: "Failed",
                        statusLabel: "Fallido",
                        occurredAt: new Date("2026-10-28T15:00:00Z"),
                        error: { description: "El proveedor no está disponible.", code: "503" },
                    },
                ],
            }),
        });

        expect(html).toContain("Mensajes y estado de envío");
        expect(html).toContain("Fecha desde");
        expect(html).toContain("Fecha hasta");
        expect(html).toContain("Laura Mendez");
        expect(html).toContain("••••567");
        expect(html).toContain("El proveedor no está disponible.");
        expect(html).toContain("Aceptado por proveedor");
        expect(html).not.toContain("+573001234567");
        expect(html).toMatch(/aria-labelledby="admin-whatsapp-tab-summary"/);
        expect(html).not.toMatch(/data-whatsapp-tab="deliveries"/);
        expect(html.match(/role="tab"/g)).toHaveLength(6);
    });
});
