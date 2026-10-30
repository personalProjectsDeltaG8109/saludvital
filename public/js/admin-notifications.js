const notificationsPage = document.querySelector("[data-notifications-page]");

if (notificationsPage) {
    const dashboard = document.querySelector(".admin-notifications");
    const loading = document.querySelector("[data-notifications-loading]");
    const errorPanel = document.querySelector("[data-notifications-error]");
    const errorMessage = document.querySelector("[data-notifications-error-message]");
    const filterError = document.querySelector("[data-notifications-filter-error]");
    const resultsPanel = document.querySelector("[data-notifications-results]");
    const searchInput = document.querySelector("[data-notification-search]");
    const statusSelect = document.querySelector("[data-notification-status]");
    const periodSelect = document.querySelector("[data-notification-period]");
    const startDateInput = document.querySelector("[data-notification-start-date]");
    const endDateInput = document.querySelector("[data-notification-end-date]");
    const channelButtons = [...document.querySelectorAll("[data-notification-channel]")];
    const metricElements = Object.fromEntries(
        [...document.querySelectorAll("[data-notification-metric]")].map((element) => [
            element.dataset.notificationMetric,
            element,
        ]),
    );
    const tableBody = document.querySelector("[data-notifications-table-body]");
    const mobileList = document.querySelector("[data-notifications-mobile-list]");
    const emptyState = document.querySelector("[data-notifications-empty]");
    const tableWrap = document.querySelector("[data-notifications-table-wrap]");
    const pagination = document.querySelector("[data-notifications-pagination]");
    const paginationLabel = document.querySelector("[data-notifications-pagination-label]");
    const pageLabel = document.querySelector("[data-notifications-page-label]");
    const previousButton = document.querySelector("[data-notifications-previous]");
    const nextButton = document.querySelector("[data-notifications-next]");
    const countLabel = document.querySelector("[data-notifications-count]");
    const detailDialog = document.querySelector("[data-notification-detail-dialog]");
    const detailCloseButton = document.querySelector("[data-notification-detail-close]");
    const detailLoading = document.querySelector("[data-notification-detail-loading]");
    const detailError = document.querySelector("[data-notification-detail-error]");
    const detailContent = document.querySelector("[data-notification-detail-content]");
    const detailFields = document.querySelector("[data-notification-detail-fields]");
    const detailEvents = document.querySelector("[data-notification-detail-events]");
    const detailAppointment = document.querySelector("[data-notification-detail-appointment]");
    const detailFailure = document.querySelector("[data-notification-detail-failure]");
    const detailNote = document.querySelector("[data-notification-detail-note]");

    let selectedChannel = "all";
    let currentPage = 1;
    let totalPages = 1;
    let requestSequence = 0;
    let searchTimer;

    function appendTextCell(row, text, className = "") {
        const cell = document.createElement("td");
        cell.textContent = text || "—";
        if (className) cell.className = className;
        row.append(cell);
        return cell;
    }

    function appendBadge(container, label, tone) {
        const badge = document.createElement("span");
        badge.className = `admin-notifications-badge is-${tone}`;
        badge.textContent = label;
        container.append(badge);
    }

    function createDetailsButton(notification) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "admin-notifications-details-button";
        button.textContent = "Ver detalles";
        button.setAttribute("aria-label", `Ver detalles de la notificación #${notification.id}`);
        button.addEventListener("click", () => openNotificationDetails(notification.id));
        return button;
    }

    function appendDetailField(list, label, value) {
        if (value === null || value === undefined || value === "") return;
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = value;
        list.append(term, description);
    }

    function formatDate(value) {
        if (!value) return "No disponible";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "No disponible";
        return new Intl.DateTimeFormat("es-CO", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "America/Bogota",
        }).format(date);
    }

    function renderNotificationEvents(events) {
        detailEvents.replaceChildren();
        for (const event of events || []) {
            const item = document.createElement("li");
            const heading = document.createElement("strong");
            heading.textContent = event.label;
            const time = document.createElement("time");
            time.dateTime = event.occurredAt;
            time.textContent = formatDate(event.occurredAt);
            const description = document.createElement("p");
            description.textContent = event.description || "Sin información adicional.";
            item.append(heading, time, description);
            detailEvents.append(item);
        }
        if (!events?.length) {
            const emptyItem = document.createElement("li");
            emptyItem.textContent = "No hay eventos de entrega disponibles.";
            detailEvents.append(emptyItem);
        }
    }

    function renderAppointmentReference(appointment) {
        detailAppointment.replaceChildren();
        if (!appointment) {
            detailAppointment.hidden = true;
            return;
        }

        detailAppointment.hidden = false;
        const title = document.createElement("h3");
        title.textContent = "Cita relacionada";
        const summary = document.createElement("p");
        summary.textContent = [
            `Cita #${appointment.id}`,
            appointment.status ? `Estado: ${appointment.status}` : null,
            appointment.startAt ? `Inicio: ${formatDate(appointment.startAt)}` : null,
            appointment.endAt ? `Fin: ${formatDate(appointment.endAt)}` : null,
        ]
            .filter(Boolean)
            .join(" · ");
        detailAppointment.append(title, summary);
    }

    function renderNotificationDetails(notification) {
        detailFields.replaceChildren();
        appendDetailField(detailFields, "Tipo", notification.eventType);
        appendDetailField(detailFields, "Canal", notification.channel);
        appendDetailField(detailFields, "Creada", formatDate(notification.createdAt));
        appendDetailField(
            detailFields,
            "Destinatario",
            `${notification.recipientName} · ${notification.maskedRecipient}`,
        );
        appendDetailField(detailFields, "Estado en SaludVital", notification.applicationStatus);
        appendDetailField(detailFields, "Estado del proveedor", notification.providerStatus);
        appendDetailField(detailFields, "Referencia del proveedor", notification.providerReference);
        appendDetailField(detailFields, "Programada para", formatDate(notification.scheduledAt));
        appendDetailField(
            detailFields,
            "Aceptada por el proveedor",
            formatDate(notification.acceptedAt),
        );
        appendDetailField(detailFields, "Última actualización", formatDate(notification.updatedAt));
        appendDetailField(detailFields, "Intentos de envío", String(notification.attemptCount));
        renderNotificationEvents(notification.events);
        renderAppointmentReference(notification.appointment);
        detailFailure.replaceChildren();
        if (notification.failure) {
            detailFailure.hidden = false;
            const heading = document.createElement("h3");
            heading.textContent = "Información del fallo";
            const description = document.createElement("p");
            description.textContent = notification.failure.description;
            detailFailure.append(heading, description);
            if (notification.failure.providerCode) {
                const code = document.createElement("small");
                code.textContent = `Código del proveedor: ${notification.failure.providerCode}`;
                detailFailure.append(code);
            }
        } else {
            detailFailure.hidden = true;
        }
        detailNote.textContent = notification.eventHistoryNote;
    }

    async function openNotificationDetails(notificationId) {
        detailDialog.showModal();
        detailLoading.hidden = false;
        detailError.hidden = true;
        detailContent.hidden = true;
        detailFields.replaceChildren();
        detailEvents.replaceChildren();
        detailAppointment.hidden = true;
        detailFailure.hidden = true;

        try {
            const response = await fetch(
                `/api/admin/notifications/${encodeURIComponent(notificationId)}`,
                {
                    headers: { Accept: "application/json" },
                    cache: "no-store",
                },
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No pudimos cargar este detalle.");
            renderNotificationDetails(data.notification);
            detailLoading.hidden = true;
            detailContent.hidden = false;
        } catch (error) {
            detailLoading.hidden = true;
            detailError.textContent = error.message || "No pudimos cargar este detalle.";
            detailError.hidden = false;
        }
    }

    function createTableRow(notification) {
        const row = document.createElement("tr");
        appendTextCell(row, formatDate(notification.occurredAt));
        appendTextCell(row, notification.channel);

        const recipientCell = document.createElement("td");
        recipientCell.className = "admin-notifications-recipient";
        const recipientName = document.createElement("strong");
        recipientName.textContent = notification.recipientName;
        const maskedDestination = document.createElement("small");
        maskedDestination.textContent = notification.maskedRecipient;
        recipientCell.append(recipientName, maskedDestination);
        row.append(recipientCell);

        appendTextCell(row, notification.eventType);
        appendTextCell(row, notification.messagePreview, "admin-notifications-message");

        const statusCell = document.createElement("td");
        appendBadge(statusCell, notification.applicationStatus, notification.applicationTone);
        const providerStatus = document.createElement("small");
        providerStatus.className = "admin-notifications-provider-status";
        providerStatus.textContent = notification.providerStatus;
        statusCell.append(providerStatus);
        row.append(statusCell);

        const actionCell = document.createElement("td");
        actionCell.append(createDetailsButton(notification));
        row.append(actionCell);
        return row;
    }

    function channelSymbol(channel) {
        return { WhatsApp: "◉", "Correo electrónico": "✉", SMS: "▤" }[channel] || "•";
    }

    function createMobileCard(notification) {
        const item = document.createElement("li");
        item.className = "admin-notifications-mobile-item";

        const channelIcon = document.createElement("span");
        channelIcon.className = "admin-notifications-channel-icon";
        channelIcon.setAttribute("aria-hidden", "true");
        channelIcon.textContent = channelSymbol(notification.channel);

        const content = document.createElement("div");
        content.className = "admin-notifications-mobile-content";
        const recipientName = document.createElement("strong");
        recipientName.textContent = notification.recipientName;
        const description = document.createElement("span");
        description.textContent = notification.eventType;
        const preview = document.createElement("span");
        preview.textContent = notification.messagePreview;
        const metadata = document.createElement("small");
        metadata.textContent = `${notification.channel} · ${notification.maskedRecipient} · ${formatDate(notification.occurredAt)}`;
        content.append(recipientName, description, preview, metadata);

        const status = document.createElement("div");
        status.className = "admin-notifications-mobile-status";
        appendBadge(status, notification.applicationStatus, notification.applicationTone);
        const providerStatus = document.createElement("small");
        providerStatus.className = "admin-notifications-provider-status";
        providerStatus.textContent = notification.providerStatus;
        status.append(providerStatus);
        item.append(channelIcon, content, status);
        item.append(createDetailsButton(notification));
        if (notification.failureSummary) {
            const failureSummary = document.createElement("span");
            failureSummary.className =
                "admin-notifications-failure admin-notifications-mobile-failure";
            failureSummary.textContent = notification.failureSummary;
            item.append(failureSummary);
        }
        return item;
    }

    function renderNotifications(data) {
        for (const [name, element] of Object.entries(metricElements)) {
            element.textContent = Number(data.summary?.[name] || 0).toLocaleString("es-CO");
        }

        const rows = Array.isArray(data.rows) ? data.rows : [];
        tableBody.replaceChildren(...rows.map(createTableRow));
        mobileList.replaceChildren(...rows.map(createMobileCard));
        const hasRows = rows.length > 0;
        emptyState.hidden = hasRows;
        tableWrap.hidden = !hasRows;
        mobileList.hidden = !hasRows;

        currentPage = data.pagination?.page || 1;
        totalPages = data.pagination?.totalPages || 1;
        const totalItems = data.pagination?.totalItems || 0;
        const firstItem = totalItems ? (currentPage - 1) * data.pagination.pageSize + 1 : 0;
        const lastItem = Math.min(currentPage * data.pagination.pageSize, totalItems);
        paginationLabel.textContent = `Mostrando ${firstItem} a ${lastItem} de ${totalItems.toLocaleString("es-CO")} notificaciones`;
        countLabel.textContent = `${totalItems.toLocaleString("es-CO")} registros`;
        pageLabel.textContent = `${currentPage} de ${totalPages}`;
        previousButton.disabled = currentPage <= 1;
        nextButton.disabled = currentPage >= totalPages;
        pagination.hidden = !totalItems;
    }

    function updateDateInputs() {
        const customRange = periodSelect.value === "custom";
        startDateInput.disabled = !customRange;
        endDateInput.disabled = !customRange;
        startDateInput.required = customRange;
        endDateInput.required = customRange;
    }

    function updateUrl() {
        const url = new URL(window.location.href);
        url.searchParams.set("period", periodSelect.value);
        url.searchParams.set("channel", selectedChannel);
        url.searchParams.set("status", statusSelect.value);
        if (searchInput.value.trim()) url.searchParams.set("search", searchInput.value.trim());
        else url.searchParams.delete("search");
        if (periodSelect.value === "custom") {
            url.searchParams.set("startDate", startDateInput.value);
            url.searchParams.set("endDate", endDateInput.value);
        } else {
            url.searchParams.delete("startDate");
            url.searchParams.delete("endDate");
        }
        url.searchParams.set("page", String(currentPage));
        window.history.replaceState({}, "", url);
    }

    async function loadNotifications({ page = 1, showResults = false } = {}) {
        const sequence = ++requestSequence;
        currentPage = page;
        if (periodSelect.value === "custom") {
            if (!startDateInput.value || !endDateInput.value) {
                loading.hidden = true;
                resultsPanel.hidden = false;
                filterError.textContent = "Selecciona las fechas inicial y final del rango.";
                filterError.hidden = false;
                dashboard.setAttribute("aria-busy", "false");
                return;
            }
            if (startDateInput.value > endDateInput.value) {
                loading.hidden = true;
                resultsPanel.hidden = false;
                filterError.textContent =
                    "La fecha inicial no puede ser posterior a la fecha final.";
                filterError.hidden = false;
                dashboard.setAttribute("aria-busy", "false");
                return;
            }
        }
        filterError.hidden = true;
        loading.hidden = false;
        errorPanel.hidden = true;
        resultsPanel.hidden = true;
        dashboard.setAttribute("aria-busy", "true");

        const parameters = new URLSearchParams({
            period: periodSelect.value,
            channel: selectedChannel,
            status: statusSelect.value,
            page: String(page),
            search: searchInput.value.trim(),
        });
        if (periodSelect.value === "custom") {
            parameters.set("startDate", startDateInput.value);
            parameters.set("endDate", endDateInput.value);
        }

        try {
            const response = await fetch(`/api/admin/notifications?${parameters}`, {
                headers: { Accept: "application/json" },
                cache: "no-store",
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.message || "No pudimos cargar las notificaciones.");
            if (sequence !== requestSequence) return;

            renderNotifications(data);
            loading.hidden = true;
            resultsPanel.hidden = false;
            if (showResults) resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
            updateUrl();
        } catch (error) {
            if (sequence !== requestSequence) return;
            loading.hidden = true;
            errorMessage.textContent = error.message || "Inténtalo de nuevo en unos momentos.";
            errorPanel.hidden = false;
        } finally {
            if (sequence === requestSequence) dashboard.setAttribute("aria-busy", "false");
        }
    }

    for (const button of channelButtons) {
        button.addEventListener("click", () => {
            selectedChannel = button.dataset.notificationChannel;
            for (const tab of channelButtons) {
                const isSelected = tab === button;
                tab.classList.toggle("is-active", isSelected);
                tab.setAttribute("aria-pressed", String(isSelected));
            }
            loadNotifications({ page: 1, showResults: true });
        });
    }

    searchInput.addEventListener("input", () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => loadNotifications({ page: 1 }), 250);
    });
    statusSelect.addEventListener("change", () => loadNotifications({ page: 1 }));
    periodSelect.addEventListener("change", () => {
        updateDateInputs();
        if (periodSelect.value !== "custom") {
            startDateInput.value = "";
            endDateInput.value = "";
        }
        loadNotifications({ page: 1 });
    });
    startDateInput.addEventListener("change", () => loadNotifications({ page: 1 }));
    endDateInput.addEventListener("change", () => loadNotifications({ page: 1 }));
    previousButton.addEventListener("click", () => loadNotifications({ page: currentPage - 1 }));
    nextButton.addEventListener("click", () => loadNotifications({ page: currentPage + 1 }));
    document
        .querySelector("[data-notifications-retry]")
        .addEventListener("click", () => loadNotifications({ page: currentPage }));
    detailCloseButton.addEventListener("click", () => detailDialog.close());

    const pageUrl = new URL(window.location.href);
    const initialPeriod = pageUrl.searchParams.get("period");
    const initialStatus = pageUrl.searchParams.get("status");
    const initialChannel = pageUrl.searchParams.get("channel");
    const initialSearch = pageUrl.searchParams.get("search");
    const initialStartDate = pageUrl.searchParams.get("startDate");
    const initialEndDate = pageUrl.searchParams.get("endDate");
    const initialPage = Number(pageUrl.searchParams.get("page"));
    if (["7", "30", "90", "custom"].includes(initialPeriod)) periodSelect.value = initialPeriod;
    if (
        ["all", "pending", "accepted", "delivered", "failed", "cancelled"].includes(initialStatus)
    ) {
        statusSelect.value = initialStatus;
    }
    if (["all", "Email", "WhatsApp", "SMS"].includes(initialChannel)) {
        selectedChannel = initialChannel;
        const selectedButton = channelButtons.find(
            (button) => button.dataset.notificationChannel === selectedChannel,
        );
        for (const button of channelButtons) {
            const isSelected = button === selectedButton;
            button.classList.toggle("is-active", isSelected);
            button.setAttribute("aria-pressed", String(isSelected));
        }
    }
    if (initialSearch) searchInput.value = initialSearch.slice(0, 100);
    if (initialStartDate) startDateInput.value = initialStartDate;
    if (initialEndDate) endDateInput.value = initialEndDate;
    if (initialStartDate || initialEndDate) periodSelect.value = "custom";
    updateDateInputs();
    loadNotifications({
        page: Number.isSafeInteger(initialPage) && initialPage > 0 ? initialPage : 1,
    });
}
