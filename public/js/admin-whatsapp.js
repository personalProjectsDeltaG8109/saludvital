const whatsappPage = document.querySelector("[data-whatsapp-page]");

if (whatsappPage) {
    const tabs = [...document.querySelectorAll("[data-whatsapp-tab]")];
    const panel = document.querySelector("[data-whatsapp-panel]");
    const feedback = document.querySelector("[data-whatsapp-feedback]");
    let selectedTab = whatsappPage.dataset.selectedTab || "summary";
    let activityPeriod = Number(whatsappPage.dataset.activityPeriod) || 7;
    let pageNumber = Number(whatsappPage.dataset.currentPage) || 1;
    let conversationSearch = whatsappPage.dataset.search || "";
    let conversationStatus = whatsappPage.dataset.status || "";
    let requestFilters = {
        search: whatsappPage.dataset.requestSearch || "",
        status: whatsappPage.dataset.requestStatus || "",
        specialtyId: whatsappPage.dataset.requestSpecialty || "",
        dateFrom: whatsappPage.dataset.requestDateFrom || "",
        dateTo: whatsappPage.dataset.requestDateTo || "",
    };
    let deliveryFilters = {
        status: whatsappPage.dataset.deliveryStatus || "",
        providerStatus: whatsappPage.dataset.providerDeliveryStatus || "",
        dateFrom: whatsappPage.dataset.deliveryDateFrom || "",
        dateTo: whatsappPage.dataset.deliveryDateTo || "",
    };
    let activeRequest = 0;
    let conversationSearchTimer;
    let selectedFlowId = null;
    let chatbotFlows = [];

    const labels = {
        Active: "Activa",
        Completed: "Finalizada",
        Expired: "Vencida",
        Blocked: "Bloqueada",
        Pending: "Pendiente",
        Confirmed: "Confirmada",
        Rejected: "Rechazada",
        Cancelled: "Cancelada",
        Sent: "Aceptado por proveedor",
        Processing: "En proceso",
        Failed: "Fallido",
        delivered: "Entregado",
        read: "Leído",
        Received: "Recibido",
        Processed: "Procesado",
        Inbound: "Mensaje recibido",
        Outbound: "Mensaje enviado",
    };

    function element(tag, className = "", text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function formatTime(value, includeDate = false) {
        if (!value) return "";
        return new Intl.DateTimeFormat("es-CO", {
            ...(includeDate ? { day: "2-digit", month: "short" } : {}),
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: "America/Bogota",
        }).format(new Date(value));
    }

    function initials(name) {
        return (
            name
                .trim()
                .split(/\s+/)
                .map((part) => part.charAt(0))
                .slice(0, 1)
                .join("")
                .toUpperCase() || "U"
        );
    }

    function setTabs(tab) {
        selectedTab = tab;
        const navigationTab = tab === "deliveries" ? "summary" : tab;
        tabs.forEach((button) => {
            const isSelected = button.dataset.whatsappTab === navigationTab;
            button.setAttribute("aria-selected", String(isSelected));
            button.tabIndex = isSelected ? 0 : -1;
        });
        panel.setAttribute("aria-labelledby", "admin-whatsapp-tab-" + navigationTab);
    }

    function updateUrl(tab, page, period) {
        const url = new URL(window.location.href);
        const navigationTab = tab === "deliveries" ? "summary" : tab;
        url.searchParams.set("tab", navigationTab);
        url.searchParams.set("page", String(page));
        url.searchParams.set("period", String(period));
        if (tab === "deliveries") url.searchParams.set("view", "deliveries");
        else url.searchParams.delete("view");
        if (tab === "conversations") {
            if (conversationSearch) url.searchParams.set("search", conversationSearch);
            else url.searchParams.delete("search");
            if (conversationStatus) url.searchParams.set("status", conversationStatus);
            else url.searchParams.delete("status");
        } else if (tab === "requests") {
            Object.entries(requestFilters).forEach(([key, value]) => {
                if (value) url.searchParams.set(key, value);
                else url.searchParams.delete(key);
            });
        } else if (tab === "deliveries") {
            Object.entries(deliveryFilters).forEach(([key, value]) => {
                if (value) url.searchParams.set(key, value);
                else url.searchParams.delete(key);
            });
        }
        window.history.replaceState({}, "", url);
    }

    function addEmptyState(parent, message) {
        parent.append(element("p", "admin-whatsapp-empty", message));
    }

    function createCard(title, value, note, icon, colorClass) {
        const card = element("article", "admin-whatsapp-count-card");
        const iconBox = element("span", "admin-whatsapp-stat-icon " + colorClass, icon);
        iconBox.setAttribute("aria-hidden", "true");
        const copy = element("div");
        copy.append(
            element("span", "", title),
            element("strong", "", Number(value).toLocaleString("es-CO")),
            element("small", "", note),
        );
        card.append(iconBox, copy);
        return card;
    }

    function renderActivityChart(data) {
        const card = element("section", "admin-whatsapp-card admin-whatsapp-chart-card");
        card.setAttribute("aria-labelledby", "whatsapp-activity-title");
        const heading = element("header", "admin-whatsapp-card-heading");
        const copy = element("div");
        copy.append(
            element("h2", "", "Conversaciones por día"),
            element(
                "p",
                "",
                "Actividad de los últimos " + data.activityPeriodDays + " días · hora de Bogotá",
            ),
        );
        const label = element("label", "admin-whatsapp-period-control");
        const accessibleLabel = element("span", "sr-only", "Período de actividad");
        const select = element("select");
        select.dataset.whatsappPeriod = "";
        select.setAttribute("aria-label", "Período de actividad");
        for (const [value, text] of [
            [7, "Últimos 7 días"],
            [30, "Últimos 30 días"],
        ]) {
            const option = element("option", "", text);
            option.value = String(value);
            option.selected = Number(data.activityPeriodDays) === value;
            select.append(option);
        }
        label.append(accessibleLabel, select);
        heading.append(copy, label);
        card.append(heading);

        const maximum = Math.max(0, ...data.conversationsByDay.map((day) => day.count));
        if (!maximum) {
            addEmptyState(card, "No hay conversaciones iniciadas durante este período.");
            return card;
        }

        const scrollArea = element("div", "admin-whatsapp-chart-scroll");
        scrollArea.tabIndex = 0;
        scrollArea.setAttribute("aria-label", "Desplazar gráfico de actividad");
        const chart = element("div", "admin-whatsapp-bar-chart");
        chart.style.setProperty("--chart-count", data.conversationsByDay.length);
        chart.setAttribute("role", "img");
        chart.setAttribute("aria-label", "Conversaciones iniciadas por día");
        data.conversationsByDay.forEach((day) => {
            const item = element("div", "admin-whatsapp-bar-item");
            item.append(element("strong", "", day.count.toLocaleString("es-CO")));
            const track = element("span", "admin-whatsapp-bar-track");
            const bar = element("span", "admin-whatsapp-bar");
            bar.style.height = Math.max(4, Math.round((day.count / maximum) * 100)) + "%";
            track.append(bar);
            item.append(track, element("small", "", day.label));
            chart.append(item);
        });
        scrollArea.append(chart);
        card.append(scrollArea);
        select.addEventListener("change", () => load(selectedTab, 1, Number(select.value)));
        return card;
    }

    function renderRequestStatusChart(data) {
        const card = element("section", "admin-whatsapp-card admin-whatsapp-request-chart");
        card.append(
            element("h2", "", "Estado de las solicitudes"),
            element("p", "admin-whatsapp-card-note", "Últimos 30 días por fecha de creación"),
        );
        if (!data.requestStatusTotal) {
            addEmptyState(card, "No hay solicitudes registradas durante este período.");
            return card;
        }

        const chart = element("div", "admin-whatsapp-status-chart");
        const donut = element("div", "admin-whatsapp-donut");
        donut.setAttribute("role", "img");
        donut.setAttribute("aria-label", "Distribución de solicitudes por estado");
        donut.style.background = data.requestStatusStyle;
        const total = element("span");
        total.append(
            element("strong", "", Number(data.requestStatusTotal).toLocaleString("es-CO")),
            element("small", "", "solicitudes"),
        );
        donut.append(total);
        const legend = element("ul", "admin-whatsapp-status-legend");
        data.appointmentRequestStatuses
            .filter((item) => item.count > 0)
            .forEach((item) => {
                const row = element("li");
                row.append(
                    element("span", "admin-whatsapp-legend-dot is-" + item.status.toLowerCase()),
                    element("span", "", item.label),
                    element("strong", "", item.count.toLocaleString("es-CO")),
                );
                legend.append(row);
            });
        chart.append(donut, legend);
        card.append(chart);
        return card;
    }

    function renderRecentRequests(data) {
        const card = element("section", "admin-whatsapp-card admin-whatsapp-recent-requests");
        const heading = element("header", "admin-whatsapp-card-heading");
        const copy = element("div");
        copy.append(
            element("h2", "", "Solicitudes recientes por WhatsApp"),
            element("p", "", "Últimos registros recibidos"),
        );
        const viewAll = element("a", "admin-whatsapp-view-all", "Ver todas");
        viewAll.href = "/admin/whatsapp?tab=requests";
        viewAll.dataset.whatsappTabLink = "requests";
        heading.append(copy, viewAll);
        card.append(heading);
        if (!data.recentRequests.length) {
            addEmptyState(card, "No hay solicitudes recientes.");
            return card;
        }

        const tableWrap = element("div", "admin-whatsapp-table-wrap");
        const table = element("table", "admin-whatsapp-request-table");
        const head = document.createElement("thead");
        const headRow = document.createElement("tr");
        ["Paciente", "Especialidad", "Estado", "Fecha"].forEach((label) => {
            const cell = element("th", "", label);
            cell.scope = "col";
            headRow.append(cell);
        });
        head.append(headRow);
        const body = document.createElement("tbody");
        data.recentRequests.forEach((request) => {
            const row = document.createElement("tr");
            row.append(
                element("td", "", request.patientName),
                element("td", "", request.specialty || "Sin especialidad indicada"),
            );
            const statusCell = document.createElement("td");
            statusCell.append(
                element(
                    "span",
                    "admin-whatsapp-record-status is-" + request.status.toLowerCase(),
                    request.statusLabel,
                ),
            );
            row.append(statusCell, element("td", "", formatTime(request.createdAt, true)));
            body.append(row);
        });
        table.append(head, body);
        tableWrap.append(table);
        card.append(tableWrap);
        return card;
    }

    function renderSystemEvents(data) {
        const card = element("section", "admin-whatsapp-card admin-whatsapp-events-card");
        const heading = element("header", "admin-whatsapp-card-heading");
        const copy = element("div");
        copy.append(
            element("h2", "", "Mensajes del sistema"),
            element(
                "p",
                "admin-whatsapp-card-note",
                "Estados de notificaciones WhatsApp; no se muestra el contenido enviado.",
            ),
        );
        const viewAll = element("a", "admin-whatsapp-view-all", "Ver todos");
        viewAll.href = "/admin/whatsapp?view=deliveries";
        viewAll.dataset.whatsappOpenDeliveries = "";
        heading.append(copy, viewAll);
        card.append(heading);
        if (!data.recentSystemEvents.length) {
            addEmptyState(card, "No hay eventos de notificación disponibles.");
            return card;
        }
        const list = element("ul", "admin-whatsapp-event-list");
        data.recentSystemEvents.forEach((event) => {
            const row = document.createElement("li");
            const iconClass =
                event.status === "Failed"
                    ? "is-error"
                    : event.status === "Sent"
                      ? "is-success"
                      : "is-neutral";
            row.append(
                element(
                    "span",
                    "admin-whatsapp-event-icon " + iconClass,
                    event.status === "Failed" ? "!" : event.status === "Sent" ? "✓" : "i",
                ),
            );
            const copy = element("span", "admin-whatsapp-record-copy");
            copy.append(
                element("strong", "", event.event),
                element("small", "", event.statusLabel),
            );
            row.append(copy, element("time", "", formatTime(event.occurredAt)));
            list.append(row);
        });
        card.append(list);
        return card;
    }

    function renderChatbotAndPreview(data) {
        const card = element("section", "admin-whatsapp-card admin-whatsapp-chatbot-card");
        card.append(element("h2", "", "Estado del chatbot"));
        const state = element("div", "admin-whatsapp-unknown-state");
        state.append(
            element("span", "admin-whatsapp-chatbot-icon", "◉"),
            element("strong", "", "Estado no disponible"),
            element("p", "", data.chatbotStatusMessage),
        );
        card.append(state, element("h2", "admin-whatsapp-preview-title", "Vista de conversación"));
        card.append(
            element(
                "p",
                "admin-whatsapp-card-note",
                "Se muestran metadatos; el contenido del mensaje permanece protegido.",
            ),
        );
        const preview = data.recentMessagePreviews[0];
        if (!preview) {
            addEmptyState(card, "No hay una conversación disponible para mostrar.");
            return card;
        }
        const previewRow = element("div", "admin-whatsapp-conversation-preview");
        previewRow.append(element("span", "admin-message-avatar", preview.initials));
        const copy = element("div");
        copy.append(
            element("strong", "", preview.patientName),
            element(
                "small",
                "",
                [
                    preview.directionLabel,
                    preview.messageTypeLabel,
                    preview.processingStatusLabel,
                ].join(" · "),
            ),
        );
        previewRow.append(copy, element("time", "", formatTime(preview.occurredAt)));
        const viewConversations = element("a", "admin-whatsapp-view-all", "Ver conversaciones");
        viewConversations.href = "/admin/whatsapp?tab=conversations";
        viewConversations.dataset.whatsappTabLink = "conversations";
        card.append(previewRow, viewConversations);
        return card;
    }

    function renderSummary(data) {
        const summary = element("div", "admin-whatsapp-summary");
        const countGrid = element("div", "admin-whatsapp-count-grid");
        countGrid.append(
            createCard(
                "Conversaciones hoy",
                data.summary.conversationsToday,
                data.summary.activeConversations.toLocaleString("es-CO") + " activas en total",
                "◉",
                "is-green",
            ),
            createCard(
                "Solicitudes de citas hoy",
                data.summary.requestsToday,
                data.summary.pendingRequestsToday.toLocaleString("es-CO") + " pendientes hoy",
                "▣",
                "is-blue",
            ),
            createCard(
                "Mensajes enviados hoy",
                data.summary.sentToday,
                data.summary.failedToday.toLocaleString("es-CO") + " fallidos hoy",
                "▤",
                "is-teal",
            ),
        );
        const integrationCard = element(
            "article",
            "admin-whatsapp-count-card admin-whatsapp-service-stat",
        );
        integrationCard.append(element("span", "admin-whatsapp-stat-icon is-neutral", "?"));
        const integrationCopy = element("div");
        integrationCopy.append(
            element("span", "", "Estado de conexión"),
            element("strong", "", "No verificado"),
            element(
                "small",
                "",
                data.summary.configurationStatus === "Configured"
                    ? "Configuración local completa"
                    : "Configuración local incompleta",
            ),
        );
        integrationCard.append(integrationCopy);
        countGrid.append(integrationCard);

        const chartGrid = element("div", "admin-whatsapp-dashboard-grid");
        chartGrid.append(renderActivityChart(data), renderRequestStatusChart(data));
        const lowerGrid = element("div", "admin-whatsapp-lower-grid");
        lowerGrid.append(
            renderRecentRequests(data),
            renderSystemEvents(data),
            renderChatbotAndPreview(data),
        );
        summary.append(countGrid, chartGrid, lowerGrid);
        panel.append(summary);
    }

    function renderRecord(record, tab) {
        const item = document.createElement("li");
        if (tab === "conversations") {
            const open = element("button", "admin-whatsapp-conversation-open");
            open.type = "button";
            open.dataset.conversationOpen = String(record.id);
            open.setAttribute("aria-label", "Abrir conversación de " + record.patientName);
            open.append(element("span", "admin-message-avatar", initials(record.patientName)));
            const conversationCopy = element("span", "admin-whatsapp-record-copy");
            conversationCopy.append(
                element("strong", "", record.patientName),
                element("small", "", record.contactNumber || "Número no disponible"),
            );
            open.append(conversationCopy);
            open.append(
                element(
                    "span",
                    "admin-whatsapp-record-status is-" + record.status.toLowerCase(),
                    record.statusLabel || labels[record.status] || "Estado registrado",
                ),
                element("time", "", formatTime(record.lastActivityAt, true)),
            );
            item.append(open);
            return item;
        }
        const displayName = tab === "deliveries" ? record.recipientName : record.patientName;
        item.append(element("span", "admin-message-avatar", initials(displayName)));
        const copy = element("span", "admin-whatsapp-record-copy");
        copy.append(element("strong", "", displayName));
        if (tab === "deliveries") {
            copy.append(
                element("small", "", record.contactNumber || "Número no disponible"),
                element("small", "", record.eventLabel),
            );
            if (record.error) {
                copy.append(
                    element(
                        "small",
                        "admin-whatsapp-delivery-error",
                        record.error.description +
                            (record.error.code ? ` (código ${record.error.code})` : ""),
                    ),
                );
            }
            if (record.providerDeliveryStatusLabel) {
                copy.append(element("small", "", "Entrega: " + record.providerDeliveryStatusLabel));
            }
        }
        if (tab === "requests") {
            copy.append(
                element("small", "", record.contactNumber || "Número no disponible"),
                element("small", "", record.specialty || "Especialidad no indicada"),
            );
            if (record.updatedAt) {
                copy.append(
                    element("small", "", "Actualizada: " + formatTime(record.updatedAt, true)),
                );
            }
        } else if (tab === "conversations") {
            copy.append(
                element(
                    "small",
                    "",
                    "Última actividad: " + formatTime(record.lastActivityAt, true),
                ),
            );
        }
        item.append(copy);
        const status = element(
            "span",
            "admin-whatsapp-record-status is-" + record.status.toLowerCase(),
            record.statusLabel || labels[record.status] || "Estado registrado",
        );
        item.append(
            status,
            element(
                "time",
                "",
                formatTime(
                    record.occurredAt ||
                        record.lastActivityAt ||
                        record.createdAt ||
                        record.startedAt,
                    true,
                ),
            ),
        );
        return item;
    }

    function renderPaginatedRecords(data) {
        const title =
            selectedTab === "conversations"
                ? "Conversaciones"
                : selectedTab === "requests"
                  ? "Solicitudes de citas"
                  : "Mensajes y estado de envío";
        if (selectedTab === "deliveries") {
            const summary = element("div", "admin-whatsapp-count-grid");
            summary.append(
                createCard(
                    "Total de mensajes",
                    data.deliveryTotal,
                    "Histórico de WhatsApp",
                    "#",
                    "",
                ),
            );
            data.deliveryStatuses.forEach((item) => {
                summary.append(
                    createCard(item.label, item.count, "Registros almacenados", "•", ""),
                );
            });
            const providerStatuses = (data.providerDeliveryStatuses || []).filter(
                (item) => item.count > 0,
            );
            if (providerStatuses.length) {
                providerStatuses.forEach((item) => {
                    summary.append(
                        createCard(item.label, item.count, "Estado informado por Meta", "•", ""),
                    );
                });
            } else {
                summary.append(
                    element(
                        "p",
                        "admin-whatsapp-empty",
                        "Meta aún no ha informado estados de entrega.",
                    ),
                );
            }
            panel.append(summary);
        }
        const heading = element("header", "admin-whatsapp-list-heading");
        const headingCopy = element("div");
        headingCopy.append(
            element("h2", "", title),
            element(
                "p",
                "",
                Number(data.pagination.totalItems).toLocaleString("es-CO") + " registros",
            ),
        );
        heading.append(headingCopy);
        if (selectedTab === "deliveries") {
            const backToSummary = element("a", "admin-whatsapp-view-all", "Volver al resumen");
            backToSummary.href = "/admin/whatsapp";
            backToSummary.dataset.whatsappBackSummary = "";
            heading.append(backToSummary);
        }
        panel.append(heading);
        if (selectedTab === "conversations") panel.append(renderConversationFilters(data));
        if (selectedTab === "requests") panel.append(renderRequestFilters(data));
        if (selectedTab === "deliveries") panel.append(renderDeliveryFilters(data));
        if (data.rows.length) {
            const records = element("ul", "admin-whatsapp-record-list");
            data.rows.forEach((record) => records.append(renderRecord(record, selectedTab)));
            panel.append(records);
        } else {
            addEmptyState(panel, "No hay registros para esta sección.");
        }
        const pagination = element("div", "admin-whatsapp-pagination");
        const previous = element("button", "", "Anterior");
        previous.type = "button";
        previous.disabled = data.pagination.page <= 1;
        const pageLabel = element(
            "span",
            "",
            `Página ${data.pagination.page} de ${data.pagination.totalPages}`,
        );
        const next = element("button", "", "Siguiente");
        next.type = "button";
        next.disabled = data.pagination.page >= data.pagination.totalPages;
        previous.addEventListener("click", () => load(selectedTab, pageNumber - 1));
        next.addEventListener("click", () => load(selectedTab, pageNumber + 1));
        pagination.append(previous, pageLabel, next);
        panel.append(pagination);
        pageNumber = data.pagination.page;
    }

    function renderConversationFilters(data) {
        const form = element("form", "admin-whatsapp-conversation-filters");
        form.dataset.conversationFilters = "";
        form.setAttribute("role", "search");
        const searchLabel = element("label", "admin-whatsapp-search-field");
        searchLabel.append(element("span", "sr-only", "Buscar por nombre o número de contacto"));
        const search = element("input");
        search.type = "search";
        search.name = "search";
        search.maxLength = 100;
        search.placeholder = "Buscar conversaciones...";
        search.autocomplete = "off";
        search.value = data.search || "";
        searchLabel.append(search);

        const statusLabel = element("label", "admin-whatsapp-status-filter");
        statusLabel.append(element("span", "sr-only", "Filtrar por estado"));
        const status = element("select");
        status.name = "status";
        [
            ["", "Todos los estados"],
            ["Active", "Activas"],
            ["Completed", "Finalizadas"],
            ["Expired", "Vencidas"],
            ["Blocked", "Bloqueadas"],
        ].forEach(([value, label]) => {
            const option = element("option", "", label);
            option.value = value;
            option.selected = value === (data.status || "");
            status.append(option);
        });
        statusLabel.append(status);
        form.append(searchLabel, statusLabel);
        return form;
    }

    function renderRequestFilters(data) {
        const filters = data.requestFilters || requestFilters;
        const form = element("form", "admin-whatsapp-request-filters");
        form.dataset.requestFilters = "";
        form.append(
            createFilterInput("search", "Buscar por nombre o número", "search", filters.search),
        );
        form.append(
            createFilterSelect("status", "Estado", filters.status, [
                ["", "Todos los estados"],
                ["Pending", "Pendientes"],
                ["Confirmed", "Confirmadas"],
                ["Rejected", "Rechazadas"],
                ["Cancelled", "Canceladas"],
                ["Expired", "Vencidas"],
            ]),
        );
        form.append(
            createFilterSelect("specialtyId", "Especialidad", filters.specialtyId, [
                ["", "Todas las especialidades"],
                ...(data.requestSpecialties || []).map((item) => [String(item.id), item.name]),
            ]),
        );
        form.append(createFilterInput("dateFrom", "Fecha desde", "date", filters.dateFrom));
        form.append(createFilterInput("dateTo", "Fecha hasta", "date", filters.dateTo));
        const submit = element("button", "admin-whatsapp-request-submit", "Buscar");
        submit.type = "submit";
        form.append(submit);
        return form;
    }

    function renderDeliveryFilters(data) {
        const filters = data.deliveryFilters || deliveryFilters;
        const form = element("form", "admin-whatsapp-request-filters");
        form.dataset.deliveryFilters = "";
        form.append(
            createFilterSelect("status", "Estado", filters.status, [
                ["", "Todos los estados"],
                ["Pending", "Pendiente"],
                ["Processing", "En proceso"],
                ["Sent", "Aceptado por proveedor"],
                ["Failed", "Fallido"],
                ["Cancelled", "Cancelado"],
            ]),
            createFilterSelect(
                "providerStatus",
                "Estado informado por Meta",
                filters.providerStatus,
                [
                    ["", "Todos"],
                    ["sent", "Aceptado por Meta"],
                    ["delivered", "Entregado"],
                    ["read", "Leído"],
                    ["failed", "Fallido en Meta"],
                ],
            ),
            createFilterInput("dateFrom", "Fecha desde", "date", filters.dateFrom),
            createFilterInput("dateTo", "Fecha hasta", "date", filters.dateTo),
        );
        const submit = element("button", "admin-whatsapp-request-submit", "Filtrar");
        submit.type = "submit";
        form.append(submit);
        return form;
    }

    function createFilterInput(name, labelText, type, value) {
        const label = element(
            "label",
            name === "search"
                ? "admin-whatsapp-request-control admin-whatsapp-search-field"
                : "admin-whatsapp-request-control",
        );
        label.append(element("span", "", labelText));
        const input = element("input");
        input.name = name;
        input.type = type;
        if (type === "search") {
            input.maxLength = 100;
            input.placeholder = labelText;
            input.autocomplete = "off";
        }
        input.value = value || "";
        label.append(input);
        return label;
    }

    function createFilterSelect(name, labelText, value, options) {
        const label = element("label", "admin-whatsapp-request-control");
        label.append(element("span", "", labelText));
        const select = element("select");
        select.name = name;
        options.forEach(([optionValue, optionLabel]) => {
            const option = element("option", "", optionLabel);
            option.value = optionValue;
            option.selected = optionValue === String(value || "");
            select.append(option);
        });
        label.append(select);
        return label;
    }

    function renderConversationDetail(data) {
        const heading = element("header", "admin-whatsapp-conversation-heading");
        const back = element("button", "admin-whatsapp-back-to-list", "Volver a conversaciones");
        back.type = "button";
        back.addEventListener("click", () => load("conversations", pageNumber));
        const copy = element("div", "admin-whatsapp-record-copy");
        copy.append(
            element("strong", "", data.conversation.patientName),
            element("small", "", data.conversation.contactNumber || "Número no disponible"),
            element(
                "span",
                "admin-whatsapp-record-status is-" + data.conversation.status.toLowerCase(),
                data.conversation.statusLabel,
            ),
        );
        heading.append(back, copy);
        panel.replaceChildren(heading);

        if (!data.messages.length) {
            addEmptyState(panel, "Esta conversación todavía no tiene mensajes registrados.");
        } else {
            const messages = element("ol", "admin-whatsapp-message-history");
            messages.setAttribute("aria-label", "Historial de mensajes");
            data.messages.forEach((message) => {
                const item = element(
                    "li",
                    "admin-whatsapp-message is-" + message.direction.toLowerCase(),
                );
                const body = element(
                    "p",
                    "",
                    message.contentExpired
                        ? "El contenido de este mensaje ya no está disponible."
                        : message.content || "Contenido no disponible.",
                );
                const details = element("div", "admin-whatsapp-message-meta");
                details.append(
                    element("span", "", labels[message.direction] || "Mensaje"),
                    element("time", "", formatTime(message.occurredAt, true)),
                );
                item.append(body, details);
                messages.append(item);
            });
            panel.append(messages);
        }

        const pagination = element("div", "admin-whatsapp-pagination");
        const previous = element("button", "", "Mensajes anteriores");
        previous.type = "button";
        previous.disabled = data.pagination.page <= 1;
        previous.addEventListener("click", () =>
            loadConversation(data.conversation.id, data.pagination.page - 1),
        );
        const label = element(
            "span",
            "",
            `Página ${data.pagination.page} de ${data.pagination.totalPages}`,
        );
        const next = element("button", "", "Mensajes siguientes");
        next.type = "button";
        next.disabled = data.pagination.page >= data.pagination.totalPages;
        next.addEventListener("click", () =>
            loadConversation(data.conversation.id, data.pagination.page + 1),
        );
        pagination.append(previous, label, next);
        panel.append(pagination);
    }

    async function loadConversation(conversationId, requestedPage = 1) {
        const requestId = ++activeRequest;
        panel.setAttribute("aria-busy", "true");
        panel.replaceChildren();
        feedback.setAttribute("role", "status");
        feedback.textContent = "Cargando conversación…";
        feedback.classList.remove("is-error");
        try {
            const response = await fetch(
                `${whatsappPage.dataset.whatsappEndpoint}/conversations/${encodeURIComponent(conversationId)}?page=${requestedPage}`,
                { headers: { Accept: "application/json" }, cache: "no-store" },
            );
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.message || "No fue posible cargar la conversación.");
            if (requestId !== activeRequest) return;
            renderConversationDetail(data);
            feedback.textContent = "";
        } catch (error) {
            if (requestId !== activeRequest) return;
            addEmptyState(panel, error.message || "No fue posible cargar la conversación.");
            const retry = element("button", "admin-whatsapp-retry", "Reintentar");
            retry.type = "button";
            retry.addEventListener("click", () => loadConversation(conversationId, requestedPage));
            panel.append(retry);
            feedback.textContent = error.message || "No fue posible cargar la conversación.";
            feedback.classList.add("is-error");
            feedback.setAttribute("role", "alert");
        } finally {
            if (requestId === activeRequest) panel.setAttribute("aria-busy", "false");
        }
    }

    function renderConfigurationList(items) {
        const list = element("ul", "admin-whatsapp-configuration-list");
        items.forEach((item) => {
            const row = document.createElement("li");
            row.append(
                element("span", "", item.name),
                element(
                    "strong",
                    item.configured ? "is-configured" : "is-incomplete",
                    item.configured ? "Configurada" : "Sin configurar",
                ),
            );
            list.append(row);
        });
        return list;
    }

    function renderChatbotFlowEditor(container, flow = null) {
        const form = element("form", "admin-whatsapp-flow-form");
        form.dataset.chatbotFlowForm = "";
        const heading = element("h2", "", flow ? "Editar borrador" : "Nuevo borrador");

        const nameLabel = element("label", "admin-whatsapp-request-control");
        nameLabel.append(element("span", "", "Nombre del flujo"));
        const nameInput = element("input");
        nameInput.name = "name";
        nameInput.required = true;
        nameInput.maxLength = 100;
        nameInput.value = flow?.name || "";
        nameLabel.append(nameInput);

        const descriptionLabel = element("label", "admin-whatsapp-request-control");
        descriptionLabel.append(element("span", "", "Descripción"));
        const descriptionInput = element("textarea");
        descriptionInput.name = "description";
        descriptionInput.maxLength = 500;
        descriptionInput.rows = 2;
        descriptionInput.value = flow?.description || "";
        descriptionLabel.append(descriptionInput);

        const definitionLabel = element("label", "admin-whatsapp-request-control");
        definitionLabel.append(element("span", "", "Pasos, preguntas y transiciones"));
        const definitionInput = element("textarea");
        definitionInput.name = "definition";
        definitionInput.required = true;
        definitionInput.rows = 14;
        definitionInput.spellcheck = false;
        definitionInput.setAttribute("aria-describedby", "chatbot-flow-definition-help");
        definitionInput.value = flow ? JSON.stringify(flow.definition, null, 2) : "";
        definitionLabel.append(definitionInput);

        const help = element(
            "p",
            "admin-whatsapp-flow-runtime-note",
            "Formato: objeto con startStepId y steps. Tipos admitidos: message (text y nextStepId opcional) y question (text y options con label y nextStepId). Cada transición debe apuntar a un paso existente. No se admiten acciones ejecutables.",
        );
        help.id = "chatbot-flow-definition-help";
        form.append(nameLabel, descriptionLabel, definitionLabel, help);
        if (flow) {
            form.append(
                element(
                    "p",
                    "admin-whatsapp-flow-runtime-note",
                    `Versión ${flow.version} · Borrador. Guardar creará la versión ${flow.version + 1}.`,
                ),
            );
        }
        form.append(
            element(
                "p",
                "admin-whatsapp-flow-runtime-note",
                "El borrador no se ejecuta ni afecta conversaciones existentes. La activación está deshabilitada hasta que exista un runtime compatible.",
            ),
        );
        const save = element("button", "admin-whatsapp-request-submit", "Guardar borrador");
        save.type = "submit";
        form.append(save);
        container.replaceChildren(heading, form);
    }

    function renderChatbotFlows(data) {
        chatbotFlows = data.chatbotFlows || [];
        const layout = element("section", "admin-whatsapp-flow-layout");
        const listCard = element("article", "admin-whatsapp-card admin-whatsapp-flow-list-card");
        const listHeading = element("header", "admin-whatsapp-card-heading");
        const title = element("div");
        title.append(
            element("h2", "", "Flujos de conversación"),
            element("p", "", "Definiciones persistidas en versiones de borrador."),
        );
        const create = element("button", "admin-whatsapp-request-submit", "Nuevo borrador");
        create.type = "button";
        create.dataset.chatbotNewFlow = "";
        listHeading.append(title, create);
        listCard.append(listHeading);

        if (!chatbotFlows.length) {
            addEmptyState(listCard, "No hay borradores de flujos guardados.");
        } else {
            const list = element("ul", "admin-whatsapp-flow-list");
            chatbotFlows.forEach((flow) => {
                const row = element("li");
                const open = element("button", "admin-whatsapp-flow-select");
                open.type = "button";
                open.dataset.chatbotEditFlow = String(flow.id);
                const copy = element("span", "admin-whatsapp-record-copy");
                copy.append(
                    element("strong", "", flow.name),
                    element("small", "", flow.description || "Sin descripción"),
                    element(
                        "small",
                        "",
                        `Versión ${flow.version} · ${flow.definition.steps.length} pasos`,
                    ),
                );
                open.append(
                    copy,
                    element("span", "admin-whatsapp-record-status is-pending", "Borrador"),
                );
                row.append(open);
                list.append(row);
            });
            listCard.append(list);
        }
        listCard.append(
            element(
                "p",
                "admin-whatsapp-flow-runtime-note",
                "Los borradores no se ejecutan en el chatbot ni modifican conversaciones activas.",
            ),
        );

        const editor = element("article", "admin-whatsapp-card");
        editor.dataset.chatbotFlowEditor = "";
        const selectedFlow = chatbotFlows.find((flow) => flow.id === selectedFlowId);
        if (selectedFlow) {
            renderChatbotFlowEditor(editor, selectedFlow);
        } else {
            editor.append(
                element("h2", "", "Selecciona un borrador o crea uno nuevo"),
                element("p", "", "Abrir un flujo solo muestra su configuración; no lo ejecuta."),
            );
        }
        layout.append(listCard, editor);
        panel.append(layout);
    }

    function createTemplateStatusCard(title, value, description, colorClass) {
        const card = element("article", "admin-whatsapp-count-card");
        const icon = element("span", `admin-whatsapp-stat-icon ${colorClass}`, "▤");
        icon.setAttribute("aria-hidden", "true");
        const details = element("div");
        details.append(element("span", "", title), element("strong", "", value));
        details.append(element("small", "", description));
        card.append(icon, details);
        return card;
    }

    function createTemplateCard(template) {
        const card = element("article", "admin-whatsapp-card admin-whatsapp-template-card");
        card.dataset.templateRecord = "";
        card.dataset.templateSearch = `${template.name} ${template.purpose}`.toLocaleLowerCase(
            "es-CO",
        );
        card.dataset.templateConfiguration = template.configured ? "configured" : "missing";

        const header = element("header", "admin-whatsapp-card-heading");
        const titleGroup = element("div");
        titleGroup.append(element("h3", "", template.name), element("p", "", template.purpose));
        const status = element(
            "span",
            `admin-whatsapp-record-status ${template.configured ? "is-active" : "is-incomplete"}`,
            template.configured ? "ID configurado" : "Sin configurar",
        );
        header.append(titleGroup, status);

        const details = element("dl", "admin-whatsapp-template-details");
        details.append(
            element("dt", "", "Contenido"),
            element("dd", "", "No disponible en la configuración local"),
            element("dt", "", "Fuente"),
            element("dd", "", "Configuración de la aplicación"),
            element("dt", "", "Idioma"),
            element("dd", "", "No informado"),
            element("dt", "", "Aprobación en Meta"),
            element("dd", "", "No consultada"),
        );
        card.append(header, details);
        return card;
    }

    function filterTemplateCards() {
        const search =
            panel
                .querySelector("[data-template-search]")
                ?.value.trim()
                .toLocaleLowerCase("es-CO") || "";
        const configuration =
            panel.querySelector("[data-template-configuration-filter]")?.value || "";
        const cards = [...panel.querySelectorAll("[data-template-record]")];
        let visibleCount = 0;

        cards.forEach((card) => {
            const matchesSearch = card.dataset.templateSearch.includes(search);
            const matchesConfiguration =
                !configuration || card.dataset.templateConfiguration === configuration;
            card.hidden = !matchesSearch || !matchesConfiguration;
            if (!card.hidden) visibleCount += 1;
        });

        const emptyState = panel.querySelector("[data-template-empty]");
        if (emptyState) emptyState.hidden = visibleCount > 0;
    }

    function renderMessageTemplates(data) {
        const templates = data.integrationConfiguration.templates || [];
        const configuredCount = templates.filter((template) => template.configured).length;
        const content = element("div", "admin-whatsapp-template-page");
        const summary = element("div", "admin-whatsapp-count-grid");
        summary.append(
            createTemplateStatusCard(
                "Tipos compatibles",
                String(templates.length),
                "Notificaciones de cita",
                "is-blue",
            ),
            createTemplateStatusCard(
                "ID local configurado",
                String(configuredCount),
                "Identificadores ocultos",
                "is-green",
            ),
            createTemplateStatusCard(
                "Sin configurar",
                String(templates.length - configuredCount),
                "Requieren configuración de despliegue",
                "is-amber",
            ),
            createTemplateStatusCard(
                "Estado del proveedor",
                "No consultado",
                "La integración no verifica aprobación",
                "is-neutral",
            ),
        );

        const section = element("section", "admin-whatsapp-card admin-whatsapp-template-list");
        const heading = element("header", "admin-whatsapp-card-heading");
        const title = element("div");
        title.append(
            element("h2", "", "Plantillas de mensajes"),
            element("p", "", "Configuraciones locales para las notificaciones compatibles."),
        );
        heading.append(title);

        const filters = element("div", "admin-whatsapp-template-filters");
        const searchLabel = element("label", "admin-whatsapp-request-control");
        searchLabel.append(element("span", "", "Buscar por nombre o propósito"));
        const searchInput = element("input");
        searchInput.type = "search";
        searchInput.setAttribute("aria-label", "Buscar plantillas por nombre o propósito");
        searchInput.dataset.templateSearch = "";
        searchInput.placeholder = "Buscar plantillas…";
        searchLabel.append(searchInput);

        const statusLabel = element("label", "admin-whatsapp-request-control");
        statusLabel.append(element("span", "", "Configuración local"));
        const statusSelect = element("select");
        statusSelect.setAttribute("aria-label", "Filtrar por configuración local");
        statusSelect.dataset.templateConfigurationFilter = "";
        [
            ["", "Todas"],
            ["configured", "ID configurado"],
            ["missing", "Sin configurar"],
        ].forEach(([value, label]) => {
            const option = element("option", "", label);
            option.value = value;
            statusSelect.append(option);
        });
        statusLabel.append(statusSelect);
        filters.append(searchLabel, statusLabel);

        const list = element("div", "admin-whatsapp-template-grid");
        templates.forEach((template) => list.append(createTemplateCard(template)));
        const emptyState = element(
            "p",
            "admin-whatsapp-empty",
            templates.length
                ? "No hay plantillas que coincidan con la búsqueda."
                : "No hay configuraciones de plantilla disponibles.",
        );
        emptyState.dataset.templateEmpty = "";
        emptyState.hidden = templates.length > 0;
        const limitation = element(
            "p",
            "admin-whatsapp-template-limitation",
            "La aplicación guarda los identificadores en la configuración de despliegue. El contenido, idioma y aprobación del proveedor no están disponibles aquí; esta vista no crea ni modifica plantillas.",
        );
        section.append(heading, filters, list, emptyState, limitation);
        content.append(summary, section);
        panel.append(content);
        filterTemplateCards();
    }

    function renderInformationTab(data) {
        if (selectedTab === "flows") {
            renderChatbotFlows(data);
            return;
        }
        if (selectedTab === "templates") {
            renderMessageTemplates(data);
            return;
        }
        const configuration = data.integrationConfiguration;
        const providers = configuration.providers || {};
        const card = element("section", "admin-whatsapp-info-card");
        const heading = element("div", "admin-whatsapp-configuration-heading");
        const headingCopy = element("div", "admin-whatsapp-configuration-heading-copy");
        headingCopy.append(
            element("h2", "", "Configuraci\u00f3n e integraci\u00f3n"),
            element("p", "", "Administra los canales que conectan a SaludVital con tus pacientes."),
        );
        heading.append(element("span", "admin-whatsapp-info-icon is-green", "\u2699"), headingCopy);
        const overview = element("section", "admin-whatsapp-channel-overview");
        const overviewHeading = element("header", "admin-whatsapp-channel-section-heading");
        const overviewCopy = element("div");
        overviewCopy.append(
            element("h3", "", "Estado general de los canales"),
            element(
                "p",
                "",
                "Resumen de la configuraci\u00f3n de los proveedores de comunicaci\u00f3n.",
            ),
        );
        overviewHeading.append(
            overviewCopy,
            createStatusBadge("Conexi\u00f3n no verificada", "is-warning"),
        );
        const channelDefinitions = [
            {
                key: "whatsapp",
                accent: "is-green",
                icon: "\u25c9",
                title: providers.whatsapp?.name || configuration.provider,
                configured: Boolean(providers.whatsapp?.configured),
                description:
                    "Mensajes de WhatsApp y respuestas del chatbot mediante Meta Cloud API.",
            },
            {
                key: "email",
                accent: "is-blue",
                icon: "\u2709",
                title: providers.email?.name || "Resend",
                configured: Boolean(
                    providers.email?.credentialsConfigured && providers.email?.senderConfigured,
                ),
                description:
                    "Notificaciones y c\u00f3digos de verificaci\u00f3n por correo electr\u00f3nico.",
            },
            {
                key: "sms",
                accent: "is-purple",
                icon: "\u25a4",
                title: providers.sms?.name || "Inalambria Express",
                configured: Boolean(providers.sms?.credentialsConfigured),
                description: "Entrega de notificaciones por SMS.",
            },
        ];
        const overviewGrid = element("div", "admin-whatsapp-provider-grid");
        channelDefinitions.forEach((provider) => {
            const providerCard = renderProviderCard(provider);
            providerCard.addEventListener("click", () => selectChannel(provider.key));
            providerCard.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectChannel(provider.key);
                }
            });
            overviewGrid.append(providerCard);
        });
        overview.append(overviewHeading, overviewGrid);
        const configurationSection = element("section", "admin-whatsapp-channel-configuration");
        const configurationHeading = element("header", "admin-whatsapp-channel-section-heading");
        const configurationCopy = element("div");
        configurationCopy.append(
            element("h3", "", "Configuraci\u00f3n por canal"),
            element("p", "", "Consulta los ajustes disponibles para cada proveedor."),
        );
        configurationHeading.append(
            configurationCopy,
            element("span", "admin-whatsapp-config-readonly", "Solo lectura"),
        );
        const tabs = element("div", "admin-whatsapp-channel-tabs");
        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", "Configuraci\u00f3n por canal");
        const tabPanel = element("div", "admin-whatsapp-channel-content");
        tabPanel.id = "admin-whatsapp-channel-panel";
        tabPanel.setAttribute("role", "tabpanel");
        let activeChannel = "whatsapp";
        const channelTabs = channelDefinitions.map((provider) => {
            const tab = element("button", "admin-whatsapp-channel-tab", provider.title);
            tab.type = "button";
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-controls", tabPanel.id);
            tab.dataset.communicationChannel = provider.key;
            tab.prepend(
                element(
                    "span",
                    "admin-whatsapp-channel-tab-icon " + provider.accent,
                    provider.icon,
                ),
            );
            tab.addEventListener("click", () => selectChannel(provider.key));
            tabs.append(tab);
            return tab;
        });
        function selectChannel(channel) {
            activeChannel = channel;
            channelTabs.forEach((tab) => {
                const isSelected = tab.dataset.communicationChannel === activeChannel;
                tab.setAttribute("aria-selected", String(isSelected));
                if (isSelected)
                    tabPanel.setAttribute(
                        "aria-labelledby",
                        tab.id || (tab.id = "admin-whatsapp-channel-tab-" + activeChannel),
                    );
                tab.classList.toggle("is-active", isSelected);
            });
            tabPanel.replaceChildren(renderChannelConfiguration(channel, providers, configuration));
        }
        selectChannel(activeChannel);
        configurationSection.append(configurationHeading, tabs, tabPanel);

        const serviceStatusGrid = element("div", "admin-whatsapp-service-status-grid");
        const chatbotCard = element("section", "admin-whatsapp-settings-summary is-chatbot");
        const chatbotCopy = element("div", "admin-whatsapp-settings-summary-copy");
        chatbotCopy.append(
            element("strong", "", "Chatbot de WhatsApp"),
            element(
                "span",
                "",
                "Estado de configuraci\u00f3n; no equivale a una comprobaci\u00f3n operativa.",
            ),
        );
        chatbotCard.append(
            element("span", "admin-whatsapp-settings-summary-icon", "\u2726"),
            chatbotCopy,
            createStatusBadge(
                configuration.chatbotEnabled ? "Habilitado" : "Deshabilitado",
                Boolean(configuration.chatbotEnabled),
            ),
        );
        const deliveryCard = element("section", "admin-whatsapp-settings-summary is-delivery");
        const deliveryCopy = element("div", "admin-whatsapp-settings-summary-copy");
        deliveryCopy.append(
            element("strong", "", "Env\u00edo de notificaciones"),
            element(
                "span",
                "",
                configuration.notificationDeliveryEnabled
                    ? "Habilitado en la aplicaci\u00f3n"
                    : "Deshabilitado en la aplicaci\u00f3n",
            ),
        );
        deliveryCard.append(
            element("span", "admin-whatsapp-delivery-indicator", "\u25cf"),
            deliveryCopy,
            createStatusBadge(
                configuration.notificationDeliveryEnabled ? "Habilitado" : "Deshabilitado",
                Boolean(configuration.notificationDeliveryEnabled),
            ),
        );
        serviceStatusGrid.append(chatbotCard, deliveryCard);
        card.append(
            heading,
            overview,
            configurationSection,
            serviceStatusGrid,
            element(
                "p",
                "admin-whatsapp-settings-security-note",
                "Por seguridad, solo se indica si cada valor est\u00e1 configurado. No se muestran claves, tokens ni secretos. La vista no modifica ajustes ni prueba conexiones.",
            ),
        );
        panel.append(card);
    }
    function statusText(isConfigured) {
        return isConfigured ? "Configurado" : "Sin configurar";
    }
    function createStatusBadge(label, status = "is-neutral") {
        const statusClass =
            status === true ? "is-positive" : status === false ? "is-neutral" : status;
        return element("span", "admin-whatsapp-config-badge " + statusClass, label);
    }
    function renderProviderCard(provider) {
        const card = element("article", "admin-whatsapp-provider-card " + provider.accent);
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", "Ver configuraci\u00f3n de " + provider.title);
        const heading = element("header", "admin-whatsapp-provider-heading");
        const title = element("div", "admin-whatsapp-provider-title");
        title.append(element("h3", "", provider.title), element("p", "", provider.description));
        heading.append(
            element("span", "admin-whatsapp-provider-icon " + provider.accent, provider.icon),
            title,
        );
        const status = element("div", "admin-whatsapp-provider-status");
        status.append(
            createStatusBadge(
                provider.configured ? "Configurado · sin verificar" : "Configuración incompleta",
                provider.configured ? "is-warning" : "is-incomplete",
            ),
            element(
                "span",
                "admin-whatsapp-provider-status-caption",
                provider.configured
                    ? "Las credenciales están presentes; falta validar conexión."
                    : "Revisa los ajustes requeridos en el servidor.",
            ),
        );
        card.append(heading, status);
        return card;
    }
    function renderChannelConfiguration(channel, providers, configuration) {
        const panel = element("section", "admin-whatsapp-channel-detail");
        const details = element("dl", "admin-whatsapp-provider-details");
        let title;
        let description;
        let fields;
        let icon;
        let accent;
        if (channel === "email") {
            title = "Correo (Resend)";
            description = "Canal para notificaciones y verificaci\u00f3n de cuenta.";
            icon = "\u2709";
            accent = "is-blue";
            fields = [
                ["Clave del proveedor", providers.email?.credentialsConfigured],
                ["Direcci\u00f3n remitente", providers.email?.senderConfigured],
                ["Nombre remitente", providers.email?.senderNameConfigured],
                ["Conexi\u00f3n con Resend", null],
            ];
        } else if (channel === "sms") {
            title = "SMS (Inalambria Express)";
            description = "Canal de mensajes de texto.";
            icon = "\u25a4";
            accent = "is-purple";
            fields = [
                ["Clave del proveedor", providers.sms?.credentialsConfigured],
                ["Conexi\u00f3n con Inalambria", null],
            ];
        } else {
            title = "WhatsApp Cloud API";
            description = "Canal de WhatsApp y recepci\u00f3n de eventos mediante webhook.";
            icon = "\u25c9";
            accent = "is-green";
            fields = [
                ["Token de acceso", providers.whatsapp?.credentialsConfigured],
                ["Versión de API", providers.whatsapp?.apiVersionConfigured],
                ["Identificador del n\u00famero", providers.whatsapp?.senderConfigured],
                ["Cuenta de negocio (WABA)", providers.whatsapp?.accountConfigured],
                ["Firma y verificaci\u00f3n del webhook", providers.whatsapp?.webhookConfigured],
                ["Conexi\u00f3n con Meta", null],
            ];
        }
        const heading = element("header", "admin-whatsapp-channel-detail-heading");
        const titleCopy = element("div");
        titleCopy.append(element("h4", "", title), element("p", "", description));
        heading.append(element("span", "admin-whatsapp-provider-icon " + accent, icon), titleCopy);
        fields.forEach(([label, isConfigured]) => {
            const row = element("div");
            row.append(element("dt", "", label));
            const stateClass =
                isConfigured === null
                    ? "is-unverified"
                    : isConfigured
                      ? "is-configured"
                      : "is-missing";
            row.append(
                element(
                    "dd",
                    "admin-whatsapp-setting-state " + stateClass,
                    isConfigured === null ? "No verificada" : statusText(Boolean(isConfigured)),
                ),
            );
            details.append(row);
        });
        panel.append(heading, details);
        if (channel === "whatsapp") panel.append(renderConfigurationList(configuration.templates));
        return panel;
    }

    function render(data) {
        panel.replaceChildren();
        if (selectedTab === "summary") renderSummary(data);
        else if (
            selectedTab === "conversations" ||
            selectedTab === "requests" ||
            selectedTab === "deliveries"
        )
            renderPaginatedRecords(data);
        else renderInformationTab(data);
    }

    async function load(tab, requestedPage = 1, requestedPeriod = activityPeriod) {
        const requestId = ++activeRequest;
        selectedTab = tab;
        pageNumber = requestedPage;
        activityPeriod = requestedPeriod;
        panel.setAttribute("aria-busy", "true");
        panel.replaceChildren();
        feedback.setAttribute("role", "status");
        feedback.textContent = "Cargando información…";
        feedback.classList.remove("is-error");

        try {
            const params = new URLSearchParams({
                tab,
                page: String(requestedPage),
                period: String(requestedPeriod),
            });
            if (tab === "conversations") {
                params.set("search", conversationSearch);
                params.set("status", conversationStatus);
            }
            if (tab === "requests") {
                Object.entries(requestFilters).forEach(([key, value]) => params.set(key, value));
            }
            if (tab === "deliveries") {
                Object.entries(deliveryFilters).forEach(([key, value]) => params.set(key, value));
            }
            const response = await fetch(whatsappPage.dataset.whatsappEndpoint + "?" + params, {
                headers: { Accept: "application/json" },
                cache: "no-store",
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.message || "No fue posible cargar la información.");
            if (requestId !== activeRequest) return;
            setTabs(tab);
            render(data);
            updateUrl(tab, data.pagination.page, requestedPeriod);
            feedback.textContent = "";
        } catch (error) {
            if (requestId !== activeRequest) return;
            panel.replaceChildren();
            const errorMessage = error.message || "No fue posible cargar la información.";
            addEmptyState(panel, errorMessage);
            const retry = element("button", "admin-whatsapp-retry", "Reintentar");
            retry.type = "button";
            retry.addEventListener("click", () => load(tab, requestedPage, requestedPeriod));
            panel.append(retry);
            feedback.textContent = errorMessage;
            feedback.classList.add("is-error");
            feedback.setAttribute("role", "alert");
        } finally {
            if (requestId === activeRequest) panel.setAttribute("aria-busy", "false");
        }
    }

    tabs.forEach((button, index) => {
        button.addEventListener("click", () => load(button.dataset.whatsappTab));
        button.addEventListener("keydown", (event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const nextIndex =
                event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
            tabs[nextIndex].focus();
            load(tabs[nextIndex].dataset.whatsappTab);
        });
    });

    document.querySelectorAll("[data-whatsapp-tab-link]").forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            load(link.dataset.whatsappTabLink);
        });
    });

    document.addEventListener("change", (event) => {
        if (event.target.matches("[data-whatsapp-period]")) {
            load("summary", 1, Number(event.target.value));
        }
    });
    async function saveChatbotFlowDraft(form) {
        const saveButton = form.querySelector("[type=submit]");
        let definition;
        try {
            definition = JSON.parse(form.elements.definition.value);
        } catch {
            feedback.textContent = "La definición debe tener un formato JSON válido.";
            feedback.classList.add("is-error");
            feedback.setAttribute("role", "alert");
            form.elements.definition.focus();
            return;
        }

        const requestBody = {
            name: form.elements.name.value,
            description: form.elements.description.value,
            definition,
        };
        const isEditing = selectedFlowId !== null;
        const endpoint =
            whatsappPage.dataset.whatsappEndpoint +
            "/flows" +
            (isEditing ? "/" + encodeURIComponent(selectedFlowId) : "");
        saveButton.disabled = true;
        feedback.textContent = "Guardando borrador…";
        feedback.classList.remove("is-error");
        try {
            const response = await fetch(endpoint, {
                method: isEditing ? "PATCH" : "POST",
                headers: { Accept: "application/json", "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
                cache: "no-store",
            });
            const result = await response.json();
            if (!response.ok)
                throw new Error(result.message || "No fue posible guardar el borrador.");
            selectedFlowId = result.id;
            await load("flows", 1);
            feedback.textContent = "Borrador guardado correctamente.";
        } catch (error) {
            feedback.textContent = error.message || "No fue posible guardar el borrador.";
            feedback.classList.add("is-error");
            feedback.setAttribute("role", "alert");
        } finally {
            saveButton.disabled = false;
        }
    }

    panel.addEventListener("click", (event) => {
        const createFlow = event.target.closest("[data-chatbot-new-flow]");
        if (createFlow) {
            selectedFlowId = null;
            const editor = panel.querySelector("[data-chatbot-flow-editor]");
            if (editor) renderChatbotFlowEditor(editor);
            return;
        }
        const editFlow = event.target.closest("[data-chatbot-edit-flow]");
        if (editFlow) {
            selectedFlowId = Number(editFlow.dataset.chatbotEditFlow);
            const editor = panel.querySelector("[data-chatbot-flow-editor]");
            const flow = chatbotFlows.find((item) => item.id === selectedFlowId);
            if (editor && flow) renderChatbotFlowEditor(editor, flow);
            return;
        }
        const deliveryLink = event.target.closest("[data-whatsapp-open-deliveries]");
        if (deliveryLink) {
            event.preventDefault();
            load("deliveries", 1);
            return;
        }
        const summaryLink = event.target.closest("[data-whatsapp-back-summary]");
        if (summaryLink) {
            event.preventDefault();
            load("summary", 1);
            return;
        }
        const button = event.target.closest("[data-conversation-open]");
        if (button) loadConversation(button.dataset.conversationOpen);
    });
    panel.addEventListener("submit", (event) => {
        if (event.target.matches("[data-chatbot-flow-form]")) {
            event.preventDefault();
            saveChatbotFlowDraft(event.target);
            return;
        }
        if (event.target.matches("[data-delivery-filters]")) {
            event.preventDefault();
            deliveryFilters = Object.fromEntries(new FormData(event.target).entries());
            load("deliveries", 1);
            return;
        }
        if (event.target.matches("[data-request-filters]")) {
            event.preventDefault();
            requestFilters = Object.fromEntries(new FormData(event.target).entries());
            load("requests", 1);
            return;
        }
        if (!event.target.matches("[data-conversation-filters]")) return;
        event.preventDefault();
        const form = event.target;
        conversationSearch = form.elements.search.value.trim();
        conversationStatus = form.elements.status.value;
        load("conversations", 1);
    });
    panel.addEventListener("input", (event) => {
        if (event.target.matches("[data-template-search]")) {
            filterTemplateCards();
            return;
        }
        if (
            !event.target.matches("[name=search]") ||
            !event.target.closest("[data-conversation-filters]")
        )
            return;
        clearTimeout(conversationSearchTimer);
        conversationSearchTimer = setTimeout(() => {
            const form = event.target.form;
            conversationSearch = form.elements.search.value.trim();
            conversationStatus = form.elements.status.value;
            load("conversations", 1);
        }, 300);
    });
    panel.addEventListener("change", (event) => {
        if (event.target.matches("[data-template-configuration-filter]")) {
            filterTemplateCards();
            return;
        }
        if (
            !event.target.matches("[name=status]") ||
            !event.target.closest("[data-conversation-filters]")
        )
            return;
        const form = event.target.form;
        conversationSearch = form.elements.search.value.trim();
        conversationStatus = form.elements.status.value;
        load("conversations", 1);
    });
    setTabs(selectedTab);
    panel.setAttribute("aria-busy", "false");
    if (selectedTab === "flows") load("flows", pageNumber);
}
