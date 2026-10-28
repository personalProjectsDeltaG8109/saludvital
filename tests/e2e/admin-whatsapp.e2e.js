import { readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";

const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const dashboardScript = await readFile(path.resolve("public/js/admin-dashboard.js"), "utf8");
const whatsappStyles = await readFile(path.resolve("public/css/admin-whatsapp.css"), "utf8");
const whatsappScript = await readFile(path.resolve("public/js/admin-whatsapp.js"), "utf8");

function overviewData(tab = "summary", period = 7) {
    return {
        selectedTab: tab,
        activityPeriodDays: period,
        summary: {
            conversationsToday: 2,
            requestsToday: 1,
            pendingRequestsToday: 1,
            sentToday: 0,
            failedToday: 0,
            activeConversations: 2,
            configurationStatus: "Incomplete",
        },
        integrationConfiguration: {
            provider: "Twilio",
            status: "Incomplete",
            senderConfigured: false,
            credentialsConfigured: false,
            templates: [
                {
                    eventType: "appointment_reminder",
                    name: "Recordatorio de cita",
                    purpose: "Recordar al paciente una cita programada.",
                    configured: true,
                    providerStatus: "Unknown",
                },
                {
                    eventType: "appointment_cancellation",
                    name: "Cancelación de cita",
                    purpose: "Informar al paciente que su cita fue cancelada.",
                    configured: false,
                    providerStatus: "Unknown",
                },
            ],
        },
        chatbotStatus: "Unknown",
        chatbotStatusMessage: "No hay una verificación operativa del chatbot disponible.",
        conversationsByDay: [
            { date: "2026-10-27", label: "Mar 27", count: 3 },
            { date: "2026-10-28", label: "Mié 28", count: 1 },
        ],
        appointmentRequestStatuses: [
            { status: "Pending", label: "Pendientes", count: 1 },
            { status: "Confirmed", label: "Confirmadas", count: 0 },
            { status: "Rejected", label: "Rechazadas", count: 0 },
            { status: "Cancelled", label: "Canceladas", count: 0 },
            { status: "Expired", label: "Vencidas", count: 0 },
        ],
        requestStatusTotal: 1,
        requestStatusStyle: "conic-gradient(#168de2 0deg 360deg)",
        recentRequests: [
            {
                patientName: "Laura Méndez",
                specialty: "Medicina General",
                status: "Pending",
                statusLabel: "Pendientes",
                createdAt: "2026-10-28T15:00:00.000Z",
            },
        ],
        recentSystemEvents: [
            {
                event: "Recordatorio de cita",
                status: "Sent",
                statusLabel: "Aceptado por proveedor",
                occurredAt: "2026-10-28T15:00:00.000Z",
            },
        ],
        recentMessagePreviews: [
            {
                patientName: "Laura Méndez",
                initials: "L",
                directionLabel: "Mensaje recibido",
                messageTypeLabel: "Texto",
                processingStatusLabel: "Procesado",
                occurredAt: "2026-10-28T15:00:00.000Z",
            },
        ],
        chatbotFlows: [],
        deliveryStatuses: [
            { status: "Pending", label: "Pendiente", count: 0 },
            { status: "Processing", label: "En proceso", count: 0 },
            { status: "Sent", label: "Aceptado por proveedor", count: 1 },
            { status: "Failed", label: "Fallido", count: 1 },
            { status: "Cancelled", label: "Cancelado", count: 0 },
        ],
        deliveryTotal: 2,
        deliveryFilters: { status: "", dateFrom: "", dateTo: "" },
        notificationAlertCount: 0,
        rows: [],
        pagination: { page: 1, pageSize: 8, totalItems: 0, totalPages: 1 },
    };
}

const html = pug
    .renderFile(path.resolve("views/admin/whatsapp.pug"), {
        pageTitle: "WhatsApp y chatbot | SaludVital",
        adminName: "Administrador",
        whatsapp: overviewData(),
    })
    .replace("<head>", '<head><base href="http://localhost/">');

const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    page.on("pageerror", (error) => console.error("BROWSER ERROR:", error.message));
    await page.route("http://localhost/admin/whatsapp", (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: html }),
    );
    await page.goto("http://localhost/admin/whatsapp");
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: whatsappStyles });
    await page.evaluate((responseData) => {
        window.whatsappResponse = responseData;
        window.failWhatsAppRequest = false;
        window.delayNextWhatsAppRequest = false;
        window.releaseWhatsAppRequest = null;
        window.fetch = async (url, options = {}) => {
            window.lastRequestOptions = options;
            const requestUrl = new URL(url, "http://localhost");
            if (requestUrl.pathname === "/api/admin/whatsapp/flows" && options.method === "POST") {
                const body = JSON.parse(options.body);
                window.savedChatbotFlow = body;
                window.whatsappResponse.chatbotFlows = [
                    {
                        id: 1,
                        version: 1,
                        name: body.name,
                        description: body.description,
                        status: "Draft",
                        definition: body.definition,
                    },
                ];
                return { ok: true, json: async () => ({ id: 1 }) };
            }
            if (requestUrl.pathname.endsWith("/conversations/12")) {
                return {
                    ok: true,
                    json: async () => ({
                        conversation: {
                            id: 12,
                            patientName: "Laura Mendez",
                            contactNumber: "••••567",
                            status: "Active",
                            statusLabel: "Activa",
                        },
                        messages: [
                            {
                                id: 1,
                                direction: "Inbound",
                                content: "<script>texto no ejecutable</script>",
                                contentExpired: false,
                                occurredAt: "2026-10-28T15:00:00.000Z",
                            },
                        ],
                        pagination: { page: 1, pageSize: 40, totalItems: 1, totalPages: 1 },
                    }),
                };
            }
            const tab = requestUrl.searchParams.get("tab") || "summary";
            const period = Number(requestUrl.searchParams.get("period") || 7);
            window.requestedWhatsAppTab = tab;
            window.requestedConversationSearch = requestUrl.searchParams.get("search");
            window.requestedConversationStatus = requestUrl.searchParams.get("status");
            window.requestedRequestFilters = Object.fromEntries(requestUrl.searchParams.entries());
            window.requestedDeliveryFilters = Object.fromEntries(requestUrl.searchParams.entries());
            if (window.delayNextWhatsAppRequest) {
                window.delayNextWhatsAppRequest = false;
                await new Promise((resolve) => {
                    window.releaseWhatsAppRequest = resolve;
                });
            }
            if (window.failWhatsAppRequest) {
                return {
                    ok: false,
                    json: async () => ({ message: "Error de prueba controlado." }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    ...window.whatsappResponse,
                    selectedTab: tab,
                    activityPeriodDays: period,
                    search: requestUrl.searchParams.get("search") || "",
                    status: requestUrl.searchParams.get("status") || "",
                    rows:
                        tab === "conversations"
                            ? [
                                  {
                                      id: 12,
                                      patientName: "Laura Mendez",
                                      contactNumber: "••••567",
                                      status: "Active",
                                      statusLabel: "Activa",
                                      lastActivityAt: "2026-10-28T15:00:00.000Z",
                                  },
                              ]
                            : tab === "requests" && !window.emptyWhatsAppRequests
                              ? [
                                    {
                                        patientName: "Laura Mendez",
                                        contactNumber: "••••567",
                                        specialty: "Pediatría",
                                        status: "Confirmed",
                                        statusLabel: "Confirmada",
                                        createdAt: "2026-10-28T15:00:00.000Z",
                                        updatedAt: "2026-10-28T16:00:00.000Z",
                                    },
                                ]
                              : tab === "deliveries"
                                ? [
                                      {
                                          recipientName: "Laura Mendez",
                                          contactNumber: "••••567",
                                          eventLabel: "Recordatorio de cita",
                                          status: "Failed",
                                          statusLabel: "Fallido",
                                          occurredAt: "2026-10-28T15:00:00.000Z",
                                          error: {
                                              description: "El proveedor no está disponible.",
                                              code: "503",
                                          },
                                      },
                                  ]
                                : [],
                    requestFilters: {
                        search: requestUrl.searchParams.get("search") || "",
                        status: requestUrl.searchParams.get("status") || "",
                        specialtyId: requestUrl.searchParams.get("specialtyId") || "",
                        dateFrom: requestUrl.searchParams.get("dateFrom") || "",
                        dateTo: requestUrl.searchParams.get("dateTo") || "",
                    },
                    requestSpecialties: [{ id: 4, name: "Pediatría" }],
                    deliveryStatuses: window.whatsappResponse.deliveryStatuses,
                    deliveryFilters: {
                        status: requestUrl.searchParams.get("status") || "",
                        dateFrom: requestUrl.searchParams.get("dateFrom") || "",
                        dateTo: requestUrl.searchParams.get("dateTo") || "",
                    },
                    pagination: { page: 1, pageSize: 8, totalItems: 1, totalPages: 1 },
                    conversationsByDay:
                        period === 30
                            ? Array.from({ length: 30 }, (_, index) => ({
                                  date: `2026-10-${String(index + 1).padStart(2, "0")}`,
                                  label: `Día ${index + 1}`,
                                  count: index === 12 ? 1 : 0,
                              }))
                            : window.whatsappResponse.conversationsByDay,
                }),
            };
        };
    }, overviewData());
    await page.addScriptTag({ content: dashboardScript });
    await page.addScriptTag({ content: whatsappScript });
    await page.getByRole("heading", { name: "Conversaciones por día" }).waitFor();
    await page.evaluate(() => {
        window.delayNextWhatsAppRequest = true;
    });
    await page.locator("[data-whatsapp-period]").selectOption("30");
    await page.getByText("Cargando información…").waitFor();
    if (
        (await page.locator("[data-whatsapp-panel]").innerText()).includes("Conversaciones por día")
    ) {
        throw new Error("Previous results must be cleared while the selected period is loading.");
    }
    await page.evaluate(() => window.releaseWhatsAppRequest?.());
    await page.getByText("Actividad de los últimos 30 días · hora de Bogotá").waitFor();
    await page.locator(".admin-whatsapp-bar-item").nth(29).waitFor();
    await page.getByRole("tab", { name: "Resumen" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.getByRole("heading", { name: "Conversaciones" }).waitFor();
    await page
        .getByRole("searchbox", { name: "Buscar por nombre o número de contacto" })
        .fill("Laura");
    await page.waitForFunction(() => window.requestedConversationSearch === "Laura");
    await page.getByLabel("Filtrar por estado").selectOption("Active");
    await page.waitForFunction(() => window.requestedConversationStatus === "Active");
    await page.getByRole("button", { name: "Abrir conversación de Laura Mendez" }).click();
    await page.getByText("<script>texto no ejecutable</script>").waitFor();
    if (await page.locator(".admin-whatsapp-message script").count()) {
        throw new Error("Persisted message content must render as text, not executable markup.");
    }
    for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const hasHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (hasHorizontalOverflow) {
            throw new Error(`The conversation history overflows horizontally at ${width}px.`);
        }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Volver a conversaciones" }).click();
    await page.getByRole("heading", { name: "Conversaciones" }).waitFor();
    await page.getByRole("tab", { name: "Conversaciones" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.getByRole("heading", { name: "Solicitudes de citas" }).waitFor();
    if ((await page.evaluate(() => window.requestedWhatsAppTab)) !== "requests") {
        throw new Error("The section control must load its corresponding backend tab.");
    }
    await page.getByRole("searchbox", { name: "Buscar por nombre o número" }).fill("Laura");
    await page.getByLabel("Estado").selectOption("Confirmed");
    await page.getByLabel("Especialidad").selectOption("4");
    await page.getByLabel("Fecha desde").fill("2026-10-22");
    await page.getByLabel("Fecha hasta").fill("2026-10-28");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("••••567").waitFor();
    const appliedRequestFilters = await page.evaluate(() => window.requestedRequestFilters);
    if (
        appliedRequestFilters.search !== "Laura" ||
        appliedRequestFilters.status !== "Confirmed" ||
        appliedRequestFilters.specialtyId !== "4" ||
        appliedRequestFilters.dateFrom !== "2026-10-22" ||
        appliedRequestFilters.dateTo !== "2026-10-28"
    ) {
        throw new Error("The WhatsApp request filters must be sent together to the backend.");
    }
    if ((await page.locator("[data-whatsapp-panel]").innerText()).includes("+573001234567")) {
        throw new Error("The request list must not expose a full contact number.");
    }
    for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const hasHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (hasHorizontalOverflow) {
            throw new Error(`The WhatsApp request list overflows horizontally at ${width}px.`);
        }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => {
        window.emptyWhatsAppRequests = true;
    });
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("No hay registros para esta sección.").waitFor();
    await page.evaluate(() => {
        window.emptyWhatsAppRequests = false;
    });
    await page.getByRole("tab", { name: "Resumen" }).click();
    await page.locator("[data-whatsapp-open-deliveries]").click();
    await page.getByRole("heading", { name: "Mensajes y estado de envío" }).waitFor();
    if ((await page.getByRole("tab").count()) !== 6) {
        throw new Error("The WhatsApp navigation must keep its six reference sections.");
    }
    await page.getByLabel("Estado").selectOption("Failed");
    await page.getByLabel("Fecha desde").fill("2026-10-22");
    await page.getByLabel("Fecha hasta").fill("2026-10-28");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await page.getByText("El proveedor no está disponible.").waitFor();
    const appliedDeliveryFilters = await page.evaluate(() => window.requestedDeliveryFilters);
    if (
        appliedDeliveryFilters.status !== "Failed" ||
        appliedDeliveryFilters.dateFrom !== "2026-10-22" ||
        appliedDeliveryFilters.dateTo !== "2026-10-28"
    ) {
        throw new Error(
            "The delivery status and date filters must be sent together to the backend.",
        );
    }
    if ((await page.locator("[data-whatsapp-panel]").innerText()).includes("+573001234567")) {
        throw new Error("The delivery list must not expose a full contact number.");
    }
    for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const hasHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (hasHorizontalOverflow) {
            throw new Error(`The WhatsApp delivery list overflows horizontally at ${width}px.`);
        }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => {
        window.failWhatsAppRequest = true;
    });
    await page.getByRole("tab", { name: "Flujos del chatbot" }).click();
    await page.waitForFunction(() => {
        const feedback = document.querySelector("[data-whatsapp-feedback]");
        return (
            feedback?.getAttribute("role") === "alert" &&
            feedback.textContent.includes("Error de prueba controlado.")
        );
    });
    await page.evaluate(() => {
        window.failWhatsAppRequest = false;
    });
    await page.getByRole("button", { name: "Reintentar" }).click();
    await page.getByText("No hay borradores de flujos guardados.").waitFor();
    await page.getByRole("button", { name: "Nuevo borrador" }).click();
    await page.getByLabel("Nombre del flujo").fill("Prueba de borrador");
    await page.getByLabel("Descripción").fill("Flujo de demostración guardado en prueba.");
    await page.getByLabel("Pasos, preguntas y transiciones").fill(
        JSON.stringify({
            startStepId: "welcome",
            steps: [{ id: "welcome", type: "message", text: "Hola" }],
        }),
    );
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await page.getByText("Borrador guardado correctamente.").waitFor();
    const savedFlow = await page.evaluate(() => window.savedChatbotFlow);
    if (savedFlow?.name !== "Prueba de borrador" || savedFlow.definition.steps.length !== 1) {
        throw new Error("A valid chatbot draft must be submitted with its structured definition.");
    }
    if (await page.getByRole("button", { name: "Activar" }).count()) {
        throw new Error("Draft-only flow management must not expose an activation control.");
    }
    await page.getByRole("tab", { name: "Plantillas de mensajes" }).click();
    await page.getByText("Recordatorio de cita", { exact: true }).waitFor();
    await page.getByLabel("Buscar plantillas por nombre o propósito").fill("cancelación");
    if ((await page.locator("[data-template-record]:visible").count()) !== 1) {
        throw new Error("Template search must narrow the visible configuration cards.");
    }
    await page.getByLabel("Filtrar por configuración local").selectOption("configured");
    if ((await page.locator("[data-template-record]:visible").count()) !== 0) {
        throw new Error("Template configuration filters must combine with the current search.");
    }
    await page.getByLabel("Buscar plantillas por nombre o propósito").fill("");
    if ((await page.locator("[data-template-record]:visible").count()) !== 1) {
        throw new Error("The local configuration filter must show only configured templates.");
    }
    for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const hasHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (hasHorizontalOverflow) {
            throw new Error(`The template view overflows horizontally at ${width}px.`);
        }
    }
    await page.getByRole("tab", { name: "Resumen" }).click();
    await page.locator(".admin-whatsapp-bar-item").nth(29).waitFor();

    for (const width of [320, 375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const hasHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (hasHorizontalOverflow) {
            throw new Error(`The WhatsApp overview overflows horizontally at ${width}px.`);
        }
    }

    await page.setViewportSize({ width: 375, height: 812 });
    const chartScroll = await page.locator(".admin-whatsapp-chart-scroll").evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
    }));
    if (chartScroll.scrollWidth <= chartScroll.clientWidth) {
        throw new Error("The 30-day chart should scroll within its card on a narrow screen.");
    }
    await page.getByRole("button", { name: "Abrir menú" }).click();
    if (
        (await page.getByRole("button", { name: "Abrir menú" }).getAttribute("aria-expanded")) !==
        "true"
    ) {
        throw new Error("The mobile menu button must open the administrator sidebar.");
    }

    console.log(
        "PASS: WhatsApp template search, local filters, activity period, and mobile navigation work without horizontal overflow.",
    );
} finally {
    await browser.close();
}
