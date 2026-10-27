(() => {
    const page = document.querySelector("[data-admin-audit]");
    if (!page) return;

    const endpoint = page.dataset.endpoint;
    const startDateInput = page.querySelector("[data-audit-start]");
    const endDateInput = page.querySelector("[data-audit-end]");
    const actionSelect = page.querySelector("[data-audit-action]");
    const moduleSelect = page.querySelector("[data-audit-module]");
    const loadingMessage = page.querySelector("[data-audit-loading]");
    const errorMessage = page.querySelector("[data-audit-error]");
    const emptyMessage = page.querySelector("[data-audit-empty]");
    const results = page.querySelector("[data-audit-results]");
    const tableBody = page.querySelector("[data-audit-table-body]");
    const cardList = page.querySelector("[data-audit-card-list]");
    const countLabel = page.querySelector("[data-audit-count]");
    const pagination = page.querySelector("[data-audit-pagination]");
    let requestNumber = 0;
    let filterOptionsLoaded = false;
    let currentPage = 1;

    const moduleIcons = {
        "Citas médicas": "▣",
        Médicos: "♙",
        Horarios: "◷",
        Especialidades: "▱",
        "Usuarios y roles": "♧",
        Otros: "•",
    };

    function formatDateTime(value) {
        const date = new Date(value);
        const dateLabel = new Intl.DateTimeFormat("es-CO", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "America/Bogota",
        }).format(date);
        const timeLabel = new Intl.DateTimeFormat("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: "America/Bogota",
        }).format(date);
        return { dateLabel, timeLabel };
    }

    function createActionBadge(label) {
        const badge = document.createElement("span");
        badge.className = "admin-audit-action";
        if (label.startsWith("Creación") || label.startsWith("Registro")) {
            badge.classList.add("is-creation");
        }
        if (label.startsWith("Cancelación")) badge.classList.add("is-cancellation");
        badge.textContent = label;
        return badge;
    }

    function createModuleLabel(label) {
        const container = document.createElement("span");
        container.className = "admin-audit-module";

        const icon = document.createElement("span");
        icon.className = "admin-audit-module-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = moduleIcons[label] || moduleIcons.Otros;

        const text = document.createElement("span");
        text.textContent = label;
        container.append(icon, text);
        return container;
    }

    function createDateLabel(value) {
        const { dateLabel, timeLabel } = formatDateTime(value);
        const date = document.createElement("span");
        date.className = "admin-audit-date";

        const day = document.createElement("span");
        day.textContent = dateLabel;
        const time = document.createElement("span");
        time.textContent = timeLabel;
        date.append(day, time);
        return date;
    }

    function renderTable(records) {
        tableBody.replaceChildren();
        for (const record of records) {
            const row = document.createElement("tr");
            const dateCell = document.createElement("td");
            dateCell.append(createDateLabel(record.occurredAt));

            const actorCell = document.createElement("td");
            actorCell.textContent = record.actor;

            const moduleCell = document.createElement("td");
            moduleCell.append(createModuleLabel(record.module));

            const actionCell = document.createElement("td");
            actionCell.append(createActionBadge(record.action));

            const descriptionCell = document.createElement("td");
            descriptionCell.textContent = record.description;

            row.append(dateCell, actorCell, moduleCell, actionCell, descriptionCell);
            tableBody.append(row);
        }
    }

    function renderCards(records) {
        cardList.replaceChildren();
        for (const record of records) {
            const card = document.createElement("li");
            card.className = "admin-audit-card";
            const icon = document.createElement("span");
            icon.className = "admin-audit-module-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = moduleIcons[record.module] || moduleIcons.Otros;

            const main = document.createElement("div");
            main.className = "admin-audit-card-main";
            main.append(createActionBadge(record.action));

            const actor = document.createElement("strong");
            actor.textContent = record.actor;
            const module = document.createElement("span");
            module.textContent = record.module;
            const description = document.createElement("p");
            description.textContent = record.description;
            main.append(actor, module, description);

            const time = document.createElement("time");
            time.className = "admin-audit-card-time";
            time.dateTime = record.occurredAt;
            time.textContent = formatDateTime(record.occurredAt).timeLabel;

            card.append(icon, main, time);
            cardList.append(card);
        }
    }

    function addFilterOptions(select, options, defaultLabel) {
        const selectedValue = select.value;
        select.replaceChildren(new Option(defaultLabel, ""));
        for (const option of options) {
            const element = new Option(option.label, option.value);
            select.add(element);
        }
        select.value = options.some((option) => option.value === selectedValue)
            ? selectedValue
            : "";
    }

    function updateFilterOptions(filters) {
        if (filterOptionsLoaded) return;
        addFilterOptions(actionSelect, filters.actions, "Todas");
        addFilterOptions(moduleSelect, filters.modules, "Todos");
        filterOptionsLoaded = true;
    }

    function renderPagination(pageInfo) {
        pagination.replaceChildren();
        pagination.hidden = pageInfo.totalPages < 2;
        if (pagination.hidden) return;

        const list = document.createElement("div");
        list.className = "admin-audit-pagination-list";

        function addPageButton(label, pageNumber, { disabled = false, current = false } = {}) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "admin-audit-page-button";
            button.textContent = label;
            button.disabled = disabled;
            if (current) button.setAttribute("aria-current", "page");
            button.addEventListener("click", () => {
                currentPage = pageNumber;
                loadAuditLogs();
            });
            list.append(button);
        }

        addPageButton("Anterior", pageInfo.page - 1, { disabled: pageInfo.page <= 1 });

        const pageNumbers = new Set([1, pageInfo.totalPages]);
        for (
            let pageNumber = Math.max(1, pageInfo.page - 2);
            pageNumber <= Math.min(pageInfo.totalPages, pageInfo.page + 2);
            pageNumber += 1
        ) {
            pageNumbers.add(pageNumber);
        }

        let previousPage = 0;
        for (const pageNumber of [...pageNumbers].sort((first, second) => first - second)) {
            if (previousPage && pageNumber - previousPage > 1) {
                const ellipsis = document.createElement("span");
                ellipsis.className = "admin-audit-pagination-ellipsis";
                ellipsis.textContent = "…";
                ellipsis.setAttribute("aria-hidden", "true");
                list.append(ellipsis);
            }
            addPageButton(String(pageNumber), pageNumber, {
                current: pageNumber === pageInfo.page,
            });
            previousPage = pageNumber;
        }

        addPageButton("Siguiente", pageInfo.page + 1, {
            disabled: pageInfo.page >= pageInfo.totalPages,
        });
        pagination.append(list);
    }

    async function loadAuditLogs() {
        const currentRequest = ++requestNumber;
        loadingMessage.hidden = false;
        errorMessage.hidden = true;
        emptyMessage.hidden = true;
        results.hidden = true;
        countLabel.textContent = "";

        const params = new URLSearchParams();
        if (startDateInput.value) params.set("startDate", startDateInput.value);
        if (endDateInput.value) params.set("endDate", endDateInput.value);
        if (actionSelect.value) params.set("action", actionSelect.value);
        if (moduleSelect.value) params.set("module", moduleSelect.value);
        params.set("page", String(currentPage));

        try {
            const response = await fetch(`${endpoint}?${params.toString()}`, {
                headers: { Accept: "application/json" },
            });
            const data = await response.json();
            if (currentRequest !== requestNumber) return;
            if (!response.ok) throw new Error(data.message || "No pudimos cargar la auditoría.");

            updateFilterOptions(data.filters);
            loadingMessage.hidden = true;
            if (!data.records.length) {
                emptyMessage.hidden = false;
                return;
            }

            renderTable(data.records);
            renderCards(data.records);
            results.hidden = false;
            currentPage = data.pagination.page;
            const firstRecord = (currentPage - 1) * data.pagination.pageSize + 1;
            const lastRecord = firstRecord + data.records.length - 1;
            countLabel.textContent = `Mostrando ${firstRecord} a ${lastRecord} de ${data.pagination.totalItems} registros`;
            renderPagination(data.pagination);
        } catch (error) {
            if (currentRequest !== requestNumber) return;
            loadingMessage.hidden = true;
            errorMessage.textContent = error.message || "No pudimos cargar la auditoría.";
            errorMessage.hidden = false;
        }
    }

    [startDateInput, endDateInput, actionSelect, moduleSelect].forEach((control) => {
        control.addEventListener("change", () => {
            currentPage = 1;
            loadAuditLogs();
        });
    });

    loadAuditLogs();
})();
