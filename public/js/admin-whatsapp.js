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
    let activeRequest = 0;
    let conversationSearchTimer;

    const labels = {
        Active: "Activa",
        Completed: "Finalizada",
        Expired: "Vencida",
        Blocked: "Bloqueada",
        Pending: "Pendiente",
        Confirmed: "Confirmada",
        Rejected: "Rechazada",
        Cancelled: "Cancelada",
        Sent: "Enviado",
        Processing: "En proceso",
        Failed: "Fallido",
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
        tabs.forEach((button) => {
            const isSelected = button.dataset.whatsappTab === tab;
            button.setAttribute("aria-selected", String(isSelected));
            button.tabIndex = isSelected ? 0 : -1;
        });
        panel.setAttribute("aria-labelledby", "admin-whatsapp-tab-" + tab);
    }

    function updateUrl(tab, page, period) {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tab);
        url.searchParams.set("page", String(page));
        url.searchParams.set("period", String(period));
        if (tab === "conversations") {
            if (conversationSearch) url.searchParams.set("search", conversationSearch);
            else url.searchParams.delete("search");
            if (conversationStatus) url.searchParams.set("status", conversationStatus);
            else url.searchParams.delete("status");
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
        card.append(
            element("h2", "", "Mensajes del sistema"),
            element(
                "p",
                "admin-whatsapp-card-note",
                "Estados de notificaciones WhatsApp; no se muestra el contenido enviado.",
            ),
        );
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
        item.append(element("span", "admin-message-avatar", initials(record.patientName)));
        const copy = element("span", "admin-whatsapp-record-copy");
        copy.append(element("strong", "", record.patientName));
        const subtitle =
            tab === "conversations"
                ? "Última actividad: " + formatTime(record.lastActivityAt, true)
                : record.specialty || "Sin especialidad indicada";
        copy.append(element("small", "", subtitle));
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
                formatTime(record.lastActivityAt || record.createdAt || record.startedAt, true),
            ),
        );
        return item;
    }

    function renderPaginatedRecords(data) {
        const title = selectedTab === "conversations" ? "Conversaciones" : "Solicitudes de citas";
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
        panel.append(heading);
        if (selectedTab === "conversations") panel.append(renderConversationFilters(data));
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

    function renderInformationTab(data) {
        const card = element("section", "admin-whatsapp-info-card");
        if (selectedTab === "flows") {
            card.append(
                element("span", "admin-whatsapp-info-icon", "◉"),
                element("h2", "", "Flujos del chatbot"),
                element("p", "", data.flowUnavailableMessage),
                element(
                    "p",
                    "",
                    "El proyecto actual no almacena definiciones, pasos ni transiciones de flujos.",
                ),
            );
        } else if (selectedTab === "templates") {
            card.append(
                element("h2", "", "Plantillas de mensajes"),
                element(
                    "p",
                    "",
                    "Solo se muestra la configuración local de las categorías utilizadas por las notificaciones.",
                ),
                renderConfigurationList(data.integrationConfiguration.templates),
                element("p", "", "La aprobación del proveedor no se consulta en este sistema."),
            );
        } else {
            const configuration = data.integrationConfiguration;
            const details = [
                ["Proveedor", configuration.provider],
                ["Remitente configurado", configuration.senderConfigured ? "Sí" : "No"],
                ["Credenciales disponibles", configuration.credentialsConfigured ? "Sí" : "No"],
                ["Conexión con el proveedor", "Estado no verificado"],
                ["Chatbot", "Estado no disponible"],
            ];
            const list = element("dl", "admin-whatsapp-configuration-list");
            details.forEach(([name, value]) => {
                list.append(element("dt", "", name), element("dd", "", value));
            });
            card.append(
                element("h2", "", "Configuración e integración"),
                element(
                    "p",
                    "",
                    "El estado describe la configuración local; no verifica conexión con Twilio.",
                ),
                list,
                renderConfigurationList(configuration.templates),
                element(
                    "p",
                    "",
                    "No se muestran credenciales y esta vista no modifica la configuración.",
                ),
            );
        }
        panel.append(card);
    }

    function render(data) {
        panel.replaceChildren();
        if (selectedTab === "summary") renderSummary(data);
        else if (selectedTab === "conversations" || selectedTab === "requests")
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
                search: conversationSearch,
                status: conversationStatus,
            });
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
    panel.addEventListener("click", (event) => {
        const button = event.target.closest("[data-conversation-open]");
        if (button) loadConversation(button.dataset.conversationOpen);
    });
    panel.addEventListener("submit", (event) => {
        if (!event.target.matches("[data-conversation-filters]")) return;
        event.preventDefault();
        const form = event.target;
        conversationSearch = form.elements.search.value.trim();
        conversationStatus = form.elements.status.value;
        load("conversations", 1);
    });
    panel.addEventListener("input", (event) => {
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
}
