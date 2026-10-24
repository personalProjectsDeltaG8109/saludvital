const whatsappPage = document.querySelector("[data-whatsapp-page]");

if (whatsappPage) {
    const app = document.querySelector(".admin-app");
    const sidebar = document.querySelector("[data-admin-sidebar]");
    const menuButton = document.querySelector("[data-admin-open]");
    const tabs = [...document.querySelectorAll("[data-whatsapp-tab]")];
    const panel = document.querySelector("[data-whatsapp-panel]");
    const feedback = document.querySelector("[data-whatsapp-feedback]");
    let selectedTab = whatsappPage.dataset.selectedTab || "summary";
    let pageNumber = Number(whatsappPage.dataset.currentPage) || 1;
    let totalPages = 1;

    const labels = {
        Active: "Activa",
        Completed: "Finalizada",
        Expired: "Vencida",
        Blocked: "Bloqueada",
        Pending: "Nueva",
        Confirmed: "Confirmada",
        Rejected: "Rechazada",
        Cancelled: "Cancelada",
        Received: "Recibido",
        Processing: "En proceso",
        Processed: "Procesado",
        Failed: "Error",
        Inbound: "Mensaje recibido",
        Outbound: "Mensaje enviado",
    };

    function closeMenu() {
        app.classList.remove("is-sidebar-open");
        menuButton?.setAttribute("aria-expanded", "false");
    }

    function openMenu() {
        app.classList.add("is-sidebar-open");
        menuButton?.setAttribute("aria-expanded", "true");
        sidebar?.querySelector('a[href="/admin/dashboard"]')?.focus();
    }

    document.querySelector("[data-admin-open]")?.addEventListener("click", openMenu);
    document.querySelectorAll("[data-admin-close]").forEach((button) => {
        button.addEventListener("click", closeMenu);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", () => {
        if (window.matchMedia("(min-width: 761px)").matches) closeMenu();
    });

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function formatTime(value) {
        if (!value) return "";
        return new Intl.DateTimeFormat("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: "America/Bogota",
        }).format(new Date(value));
    }

    function initials(name) {
        return (
            name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 1)
                .map((part) => part.charAt(0))
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

    function renderRecord(record, tab) {
        const item = element("li");
        item.append(element("span", "admin-message-avatar", initials(record.patientName)));
        const copy = element("span", "admin-whatsapp-record-copy");
        copy.append(element("strong", "", record.patientName));
        let subtitle = "";
        if (tab === "conversations") {
            subtitle = "Última actividad: " + formatTime(record.lastActivityAt);
        } else if (tab === "requests") {
            subtitle = record.specialty || "Especialidad por definir";
        } else {
            subtitle =
                (labels[record.direction] || "Mensaje") + " · " + (record.messageType || "texto");
        }
        copy.append(element("small", "", subtitle));
        item.append(copy);

        const status =
            tab === "conversations"
                ? record.status
                : tab === "requests"
                  ? record.status
                  : record.processingStatus;
        const statusClass =
            status === "Failed" || status === "Rejected" || status === "Expired"
                ? "is-error"
                : status === "Active" || status === "Pending"
                  ? "is-new"
                  : status === "Confirmed" || status === "Processed"
                    ? "is-confirmed"
                    : "is-closed";
        item.append(
            element(
                "span",
                "admin-whatsapp-record-status " + statusClass,
                labels[status] || "En revisión",
            ),
        );
        item.append(
            element(
                "time",
                "",
                formatTime(
                    record.lastActivityAt ||
                        record.createdAt ||
                        record.occurredAt ||
                        record.startedAt,
                ),
            ),
        );
        return item;
    }

    function render(data) {
        panel.replaceChildren();
        if (selectedTab === "summary") {
            const counts = [
                ["Conversaciones activas", data.summary.conversations.Active || 0],
                ["Solicitudes pendientes", data.summary.appointmentRequests.Pending || 0],
                ["Mensajes con error", data.summary.messages.Failed || 0],
            ];
            const countGrid = element("div", "admin-whatsapp-count-grid");
            counts.forEach(([title, count]) => {
                const card = element("article", "admin-whatsapp-count-card");
                card.append(
                    element("span", "", title),
                    element("strong", "", Number(count).toLocaleString("es-CO")),
                );
                countGrid.append(card);
            });
            const list = element("section", "admin-whatsapp-list-card");
            const heading = element("header", "admin-whatsapp-list-heading");
            const copy = element("div");
            copy.append(element("h2", "", "Mensajes recientes"));
            copy.append(
                element("p", "", "Solo se muestran datos de estado; el contenido no se expone."),
            );
            heading.append(copy);
            list.append(heading);
            if (data.rows.length) {
                const records = element("ul", "admin-whatsapp-record-list");
                data.rows.forEach((record) => records.append(renderRecord(record, selectedTab)));
                list.append(records);
            } else {
                list.append(element("p", "admin-whatsapp-empty", "No hay mensajes recientes."));
            }
            panel.append(countGrid, list);
            return;
        }

        const heading = element("header", "admin-whatsapp-list-heading");
        const headingCopy = element("div");
        headingCopy.append(
            element(
                "h2",
                "",
                selectedTab === "conversations"
                    ? "Conversaciones recientes"
                    : "Solicitudes de cita",
            ),
        );
        headingCopy.append(
            element(
                "p",
                "",
                Number(data.pagination.totalItems).toLocaleString("es-CO") + " registros",
            ),
        );
        heading.append(headingCopy);
        panel.append(heading);

        if (data.rows.length) {
            const records = element("ul", "admin-whatsapp-record-list");
            data.rows.forEach((record) => records.append(renderRecord(record, selectedTab)));
            panel.append(records);
        } else {
            panel.append(
                element("p", "admin-whatsapp-empty", "No hay registros para esta sección."),
            );
        }

        totalPages = data.pagination.totalPages;
        pageNumber = data.pagination.page;
        const pagination = element("div", "admin-whatsapp-pagination");
        const previous = element("button", "", "Anterior");
        previous.type = "button";
        previous.disabled = pageNumber <= 1;
        previous.dataset.pagePrevious = "";
        const label = element("span", "", "Página " + pageNumber + " de " + totalPages);
        label.dataset.pageLabel = "";
        const next = element("button", "", "Siguiente");
        next.type = "button";
        next.disabled = pageNumber >= totalPages;
        next.dataset.pageNext = "";
        pagination.append(previous, label, next);
        panel.append(pagination);
        previous.addEventListener("click", () => load(selectedTab, pageNumber - 1));
        next.addEventListener("click", () => load(selectedTab, pageNumber + 1));
    }

    async function load(tab, requestedPage = 1) {
        feedback.textContent = "Cargando información…";
        feedback.classList.remove("is-error");
        try {
            const url =
                whatsappPage.dataset.whatsappEndpoint +
                "?tab=" +
                encodeURIComponent(tab) +
                "&page=" +
                requestedPage;
            const response = await fetch(url, { headers: { Accept: "application/json" } });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.message || "No fue posible cargar la información.");
            setTabs(tab);
            render(data);
            feedback.textContent = "";
        } catch (error) {
            feedback.textContent = error.message || "No fue posible cargar la información.";
            feedback.classList.add("is-error");
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

    document
        .querySelector("[data-page-previous]")
        ?.addEventListener("click", () => load(selectedTab, pageNumber - 1));
    document
        .querySelector("[data-page-next]")
        ?.addEventListener("click", () => load(selectedTab, pageNumber + 1));
}
