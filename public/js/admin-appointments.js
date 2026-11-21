const appointmentsPage = document.querySelector("[data-admin-appointments]");

if (appointmentsPage) {
    const SEARCH_DEBOUNCE_MS = 300;
    const endpoint = appointmentsPage.dataset.endpoint;
    const list = appointmentsPage.querySelector("[data-appointment-list]");
    const mobileList = appointmentsPage.querySelector("[data-appointment-mobile-list]");
    const feedback = appointmentsPage.querySelector("[data-appointment-feedback]");
    const errorMessage = appointmentsPage.querySelector("[data-appointment-error]");
    const fromDate = appointmentsPage.querySelector("[data-appointment-from]");
    const toDate = appointmentsPage.querySelector("[data-appointment-to]");
    const status = appointmentsPage.querySelector("[data-appointment-status]");
    const specialty = appointmentsPage.querySelector("[data-appointment-specialty]");
    const doctor = appointmentsPage.querySelector("[data-appointment-doctor]");
    const search = appointmentsPage.querySelector("[data-appointment-search]");
    const pageSize = appointmentsPage.querySelector("[data-appointment-page-size]");
    const tabs = appointmentsPage.querySelector("[data-appointment-tabs]");
    const exportButton = appointmentsPage.querySelector("[data-appointment-export]");
    const pdfExportButton = appointmentsPage.querySelector("[data-appointment-pdf-export]");
    const exportFeedback = appointmentsPage.querySelector("[data-appointment-export-feedback]");
    const cancellationDialog = document.querySelector("[data-cancellation-dialog]");
    const cancellationForm = document.querySelector("[data-cancellation-form]");
    const cancellationReason = document.querySelector("[data-cancellation-reason]");
    const cancellationError = document.querySelector("[data-cancellation-error]");
    const detailsDialog = document.querySelector("[data-appointment-details-dialog]");
    const detailsFeedback = document.querySelector("[data-appointment-details-feedback]");
    const detailsContent = document.querySelector("[data-appointment-details-content]");
    const detailsSummary = document.querySelector("[data-appointment-details-summary]");
    const detailsAvatar = document.querySelector("[data-appointment-details-avatar]");
    const detailsPatientName = document.querySelector("[data-appointment-details-patient-name]");
    const detailsPatientContact = document.querySelector(
        "[data-appointment-details-patient-contact]",
    );
    const detailsFields = document.querySelector("[data-appointment-details-fields]");
    let selectedAppointmentId = null;
    let displayedAppointments = [];
    let currentPage = 1;
    let searchDebounce = null;
    let activeRequestId = 0;
    let activeDetailsRequestId = 0;

    function createOption(select, value, label) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.append(option);
    }

    function createFilterParams() {
        const params = new URLSearchParams();
        if (fromDate.value) params.set("from", fromDate.value);
        if (toDate.value) params.set("to", toDate.value);
        if (status.value !== "all") params.set("status", status.value);
        if (specialty.value !== "all") params.set("specialtyId", specialty.value);
        if (doctor.value !== "all") params.set("doctorId", doctor.value);
        if (search.value.trim()) params.set("search", search.value.trim());
        return params;
    }

    function formatDateTime(value, options) {
        return new Intl.DateTimeFormat("es-CO", {
            timeZone: "America/Bogota",
            ...options,
        }).format(new Date(value));
    }

    function getInitials(name) {
        return name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0].toLocaleUpperCase("es-CO"))
            .join("");
    }

    function createIcon(name) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "1.8");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");

        const elements =
            name === "edit"
                ? [
                      ["path", { d: "m15 5 4 4" }],
                      ["path", { d: "M4 20h4l11-11a2.12 2.12 0 0 0-4-4L4 16v4z" }],
                  ]
                : [
                      [
                          "path",
                          { d: "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" },
                      ],
                      ["circle", { cx: "12", cy: "12", r: "2.5" }],
                  ];

        elements.forEach(([tag, attributes]) => {
            const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
            Object.entries(attributes).forEach(([attribute, value]) =>
                element.setAttribute(attribute, value),
            );
            svg.append(element);
        });
        return svg;
    }

    function createPatientCell(patient) {
        const cell = document.createElement("td");
        cell.dataset.label = "Paciente";

        const avatar = document.createElement("span");
        avatar.className = "appointment-patient-avatar";
        const initials = document.createElement("span");
        initials.className = "appointment-patient-initials";
        initials.textContent = getInitials(patient.name);
        if (patient.photoUrl) {
            const image = document.createElement("img");
            image.src = patient.photoUrl;
            image.alt = "";
            image.loading = "lazy";
            initials.hidden = true;
            image.addEventListener("load", () => {
                initials.hidden = true;
            });
            image.addEventListener("error", () => {
                image.remove();
                initials.hidden = false;
            });
            avatar.append(image);
        }
        avatar.append(initials);

        const name = document.createElement("span");
        name.textContent = patient.name;
        const content = document.createElement("span");
        content.className = "appointment-patient-cell";
        content.append(avatar, name);
        cell.append(content);
        return cell;
    }

    function createStatusBadge(appointment) {
        const badge = document.createElement("span");
        badge.className = `appointment-status-badge status-${appointment.status.toLowerCase().replaceAll(" ", "-")}`;
        badge.textContent = appointment.statusLabel;
        return badge;
    }

    function createAppointmentRow(appointment) {
        const row = document.createElement("tr");
        const date = document.createElement("td");
        date.dataset.label = "Fecha y hora";
        date.className = "appointment-date-cell";
        const dateContent = document.createElement("span");
        dateContent.className = "appointment-date-content";
        const dateText = document.createElement("span");
        dateText.textContent = formatDateTime(appointment.startAt, {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
        const timeText = document.createElement("small");
        timeText.textContent = formatDateTime(appointment.startAt, {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
        dateContent.append(dateText, timeText);
        date.append(dateContent);

        const documentCell = document.createElement("td");
        documentCell.dataset.label = "Documento";
        documentCell.textContent = appointment.patient.document;

        const specialtyCell = document.createElement("td");
        specialtyCell.dataset.label = "Especialidad";
        specialtyCell.textContent = appointment.specialty;

        const doctorCell = document.createElement("td");
        doctorCell.dataset.label = "Médico";
        doctorCell.textContent = appointment.doctor;

        const statusCell = document.createElement("td");
        statusCell.dataset.label = "Estado";
        statusCell.append(createStatusBadge(appointment));

        const actionsCell = document.createElement("td");
        actionsCell.dataset.label = "Acciones";
        const actions = document.createElement("div");
        actions.className = "appointment-row-actions";
        actions.append(createAppointmentDetailsButton(appointment));
        if (appointment.status === "Confirmed") {
            actions.append(createAppointmentEditLink(appointment));
            actions.append(createAppointmentCancelButton(appointment));
        }
        actionsCell.append(actions);

        row.append(
            date,
            createPatientCell(appointment.patient),
            documentCell,
            specialtyCell,
            doctorCell,
            statusCell,
            actionsCell,
        );
        return row;
    }

    function createAppointmentDetailsButton(appointment) {
        const button = document.createElement("button");
        button.className = "appointment-details-link appointment-action-icon";
        button.type = "button";
        button.dataset.viewAppointment = String(appointment.id);
        button.setAttribute("aria-label", `Ver detalles de la cita de ${appointment.patient.name}`);
        button.title = "Ver detalles";
        button.append(createIcon("view"));
        return button;
    }

    function createAppointmentEditLink(appointment) {
        const link = document.createElement("a");
        link.className = "appointment-edit-link";
        link.href = `/admin/appointments/${appointment.id}/edit`;
        link.setAttribute(
            "aria-label",
            `Editar y reprogramar la cita de ${appointment.patient.name}`,
        );
        link.title = "Editar cita";
        link.classList.add("appointment-action-icon");
        link.append(createIcon("edit"));
        return link;
    }

    function createAppointmentCancelButton(appointment) {
        const button = document.createElement("button");
        button.className = "appointment-cancel-button";
        button.type = "button";
        button.dataset.cancelAppointment = String(appointment.id);
        button.textContent = "Cancelar";
        button.setAttribute("aria-label", `Cancelar la cita de ${appointment.patient.name}`);
        return button;
    }

    function createAppointmentCard(appointment) {
        const card = document.createElement("article");
        card.className = "appointment-mobile-card";

        const date = document.createElement("div");
        date.className = "appointment-mobile-date";
        date.textContent = formatDateTime(appointment.startAt, {
            day: "2-digit",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });

        const details = document.createElement("div");
        details.className = "appointment-mobile-details";
        const patient = document.createElement("strong");
        patient.textContent = appointment.patient.name;
        const specialtyText = document.createElement("span");
        specialtyText.textContent = appointment.specialty;
        const doctorText = document.createElement("span");
        doctorText.textContent = appointment.doctor;
        details.append(patient, specialtyText, doctorText);

        const status = createStatusBadge(appointment);
        const detailsButton = createAppointmentDetailsButton(appointment);
        const editLink =
            appointment.status === "Confirmed" ? createAppointmentEditLink(appointment) : null;
        const cancelButton =
            appointment.status === "Confirmed" ? createAppointmentCancelButton(appointment) : null;
        const actions = document.createElement("div");
        actions.className = "appointment-mobile-actions";
        actions.append(detailsButton);
        if (editLink) actions.append(editLink);
        if (cancelButton) actions.append(cancelButton);
        card.append(
            date,
            createPatientCell(appointment.patient).querySelector(".appointment-patient-avatar"),
            details,
            status,
            actions,
        );
        return card;
    }

    function createDetailField(label, value) {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = label;
        description.textContent = value || "Sin información";
        row.append(term, description);
        return row;
    }

    function renderAppointmentDetails(appointment) {
        const date = formatDateTime(appointment.startAt, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
        });
        const time = formatDateTime(appointment.startAt, {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
        detailsSummary.replaceChildren();
        detailsSummary.append(
            createDetailField("Número de cita", `#${appointment.id}`),
            createDetailField("Fecha", date),
            createDetailField("Hora", time),
        );

        detailsPatientName.textContent = appointment.patient.name;
        detailsPatientContact.textContent = [
            appointment.patient.document,
            appointment.patient.phone,
        ]
            .filter(Boolean)
            .join(" · ");
        detailsAvatar.replaceChildren();
        const fallback = document.createElement("span");
        fallback.textContent = getInitials(appointment.patient.name);
        if (appointment.patient.photoUrl) {
            const image = document.createElement("img");
            image.src = appointment.patient.photoUrl;
            image.alt = "";
            image.addEventListener(
                "error",
                () => {
                    image.remove();
                    fallback.hidden = false;
                },
                { once: true },
            );
            fallback.hidden = true;
            detailsAvatar.append(fallback, image);
        } else {
            detailsAvatar.append(fallback);
        }

        detailsFields.replaceChildren(
            createDetailField("Especialidad", appointment.specialty),
            createDetailField("Médico", appointment.doctor),
            createDetailField("Estado", appointment.statusLabel),
        );
        detailsContent.hidden = false;
        detailsFeedback.textContent = "";
    }

    async function openAppointmentDetails(appointmentId) {
        if (!detailsDialog) return;
        const requestId = ++activeDetailsRequestId;
        detailsContent.hidden = true;
        detailsFeedback.textContent = "Cargando información de la cita...";
        detailsDialog.showModal();
        detailsDialog.querySelector("[data-appointment-details-close]").focus();
        try {
            const response = await fetch(`/api/admin/appointments/${appointmentId}`, {
                headers: { Accept: "application/json" },
                cache: "no-store",
            });
            const contentType = response.headers?.get("content-type") || "";
            const result = contentType.includes("application/json") ? await response.json() : {};
            if (!response.ok || response.redirected || !contentType.includes("application/json")) {
                throw new Error(result.message || "No pudimos cargar los datos de la cita.");
            }
            if (requestId !== activeDetailsRequestId || !detailsDialog.open) return;
            renderAppointmentDetails(result.appointment);
        } catch (error) {
            if (requestId !== activeDetailsRequestId || !detailsDialog.open) return;
            detailsFeedback.textContent = error.message;
        }
    }

    function openCancellationDialog(appointmentId, patientName) {
        selectedAppointmentId = appointmentId;
        cancellationForm.reset();
        cancellationError.hidden = true;
        appointmentsPage.querySelector("[data-cancellation-description]").textContent =
            `Confirma la cancelación de la cita de ${patientName}.`;
        cancellationDialog.showModal();
        cancellationReason.focus();
    }

    function renderAppointments(appointments, showEmptyState = true) {
        displayedAppointments = appointments;
        list.replaceChildren();
        mobileList.replaceChildren();
        appointments.forEach((appointment) => {
            list.append(createAppointmentRow(appointment));
            mobileList.append(createAppointmentCard(appointment));
        });
        if (appointments.length || !showEmptyState) return;

        const row = document.createElement("tr");
        row.className = "appointments-empty-row";
        const cell = document.createElement("td");
        cell.colSpan = 7;
        cell.textContent = "No encontramos citas con esos criterios.";
        row.append(cell);
        list.append(row);
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "appointments-empty-mobile";
        emptyMessage.textContent = cell.textContent;
        mobileList.append(emptyMessage);
    }

    function renderOptions(data) {
        const selectedSpecialty = specialty.value;
        const selectedDoctor = doctor.value;
        specialty.replaceChildren();
        doctor.replaceChildren();
        createOption(specialty, "all", "Todas");
        createOption(doctor, "all", "Todos");
        data.specialties.forEach((item) => createOption(specialty, String(item.id), item.name));
        data.doctors.forEach((item) => createOption(doctor, String(item.id), item.name));
        specialty.value = selectedSpecialty;
        doctor.value = selectedDoctor;

        const selectedStatus = status.value;
        status.replaceChildren();
        createOption(status, "all", "Todos");
        data.statuses.forEach((item) => createOption(status, item.value, item.label));
        status.value = selectedStatus || "all";

        const selectedTab = status.value;
        tabs.replaceChildren();
        const allTab = createStatusTab(
            "all",
            `Todas ${Number(data.stats.total).toLocaleString("es-CO")}`,
        );
        tabs.append(allTab);
        data.statuses.forEach((item) => {
            const count = Number(data.stats[item.value]).toLocaleString("es-CO");
            tabs.append(createStatusTab(item.value, `${item.label} ${count}`));
        });
        syncSelectedTab(selectedTab);
    }

    function createStatusTab(value, label) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.statusTab = value;
        button.setAttribute("aria-pressed", "false");
        button.textContent = label;
        return button;
    }

    function syncSelectedTab(value) {
        tabs.querySelectorAll("[data-status-tab]").forEach((tab) => {
            const selected = tab.dataset.statusTab === value;
            tab.classList.toggle("is-selected", selected);
            tab.setAttribute("aria-pressed", String(selected));
        });
    }

    function refreshFromFirstPage() {
        clearTimeout(searchDebounce);
        searchDebounce = null;
        currentPage = 1;
        loadAppointments();
    }

    function renderStats(stats) {
        appointmentsPage.querySelector("[data-stat-total]").textContent = stats.total;
        appointmentsPage.querySelector("[data-stat-confirmed]").textContent = stats.Confirmed;
        appointmentsPage.querySelector("[data-stat-in-progress]").textContent =
            stats["In Progress"];
        appointmentsPage.querySelector("[data-stat-attended]").textContent = stats.Attended;
        appointmentsPage.querySelector("[data-stat-cancelled]").textContent = stats.Cancelled;
        appointmentsPage.querySelector("[data-stat-no-show]").textContent = stats["No Show"];
    }

    function renderPagination(pagination) {
        const totalPages = Math.max(1, pagination.totalPages);
        const first = pagination.totalItems ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
        const last = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);
        appointmentsPage.querySelector("[data-appointment-page-summary]").textContent =
            `Mostrando ${first}–${last} de ${pagination.totalItems} citas`;
        appointmentsPage.querySelector("[data-appointment-page-label]").textContent =
            `${pagination.page} / ${totalPages}`;
        appointmentsPage.querySelector("[data-appointment-prev]").disabled = pagination.page <= 1;
        appointmentsPage.querySelector("[data-appointment-next]").disabled =
            pagination.page >= totalPages;
    }

    async function loadAppointments() {
        clearTimeout(searchDebounce);
        searchDebounce = null;
        // Only the latest filter request may update the visible appointment list.
        const requestId = ++activeRequestId;
        feedback.textContent = "Cargando citas...";
        errorMessage.hidden = true;
        const params = createFilterParams();
        params.set("page", String(currentPage));
        params.set("pageSize", pageSize.value);

        try {
            const response = await fetch(`${endpoint}?${params}`, {
                headers: { Accept: "application/json" },
                cache: "no-store",
            });
            if (requestId !== activeRequestId) return;
            const data = await response.json();
            if (requestId !== activeRequestId) return;
            if (!response.ok) throw new Error(data.message || "No pudimos cargar las citas.");
            renderOptions(data);
            renderStats(data.stats);
            renderAppointments(data.appointments);
            renderPagination(data.pagination);
            feedback.textContent = data.pagination.totalItems
                ? `${data.pagination.totalItems} cita${data.pagination.totalItems === 1 ? "" : "s"} encontrada${data.pagination.totalItems === 1 ? "" : "s"}.`
                : "No hay citas para mostrar.";
        } catch (error) {
            if (requestId !== activeRequestId) return;
            renderAppointments([], false);
            feedback.textContent = "No se pudieron cargar las citas.";
            errorMessage.textContent = error.message;
            errorMessage.hidden = false;
        }
    }

    appointmentsPage
        .querySelector("[data-appointment-filters]")
        .addEventListener("submit", (event) => {
            event.preventDefault();
            currentPage = 1;
            loadAppointments();
        });
    search.addEventListener("input", () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            refreshFromFirstPage();
        }, SEARCH_DEBOUNCE_MS);
    });
    tabs.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-status-tab]");
        if (!tab) return;
        status.value = tab.dataset.statusTab;
        currentPage = 1;
        syncSelectedTab(status.value);
        loadAppointments();
    });
    status.addEventListener("change", () => {
        syncSelectedTab(status.value);
        refreshFromFirstPage();
    });
    [fromDate, toDate, specialty, doctor].forEach((filter) => {
        filter.addEventListener("change", refreshFromFirstPage);
    });
    pageSize.addEventListener("change", () => {
        currentPage = 1;
        loadAppointments();
    });
    appointmentsPage.querySelector("[data-appointment-prev]").addEventListener("click", () => {
        currentPage -= 1;
        loadAppointments();
    });
    appointmentsPage.querySelector("[data-appointment-next]").addEventListener("click", () => {
        currentPage += 1;
        loadAppointments();
    });
    exportButton?.addEventListener("click", async () => {
        exportButton.disabled = true;
        exportFeedback.textContent = "Preparando archivo CSV...";
        try {
            const params = createFilterParams();
            const response = await fetch(`/api/admin/appointments/export?${params}`, {
                headers: { Accept: "text/csv" },
                cache: "no-store",
            });
            if (response.status === 204) {
                exportFeedback.textContent = "No hay citas para exportar con esos filtros.";
                return;
            }
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                exportFeedback.textContent = error.message || "No pudimos exportar las citas.";
                return;
            }

            const downloadUrl = URL.createObjectURL(await response.blob());
            const downloadLink = document.createElement("a");
            downloadLink.href = downloadUrl;
            downloadLink.download = "saludvital-citas.csv";
            document.body.append(downloadLink);
            downloadLink.click();
            downloadLink.remove();
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
            exportFeedback.textContent = "La descarga CSV comenzó.";
        } catch {
            exportFeedback.textContent = "No pudimos exportar las citas. Inténtalo de nuevo.";
        } finally {
            exportButton.disabled = false;
        }
    });

    pdfExportButton?.addEventListener("click", () => {
        const params = createFilterParams();
        const reportWindow = window.open(`/admin/appointments/export/pdf?${params}`, "_blank");
        if (reportWindow) reportWindow.opener = null;
        exportFeedback.textContent = reportWindow
            ? "El reporte está listo. Puedes imprimirlo o guardarlo como PDF."
            : "Permite las ventanas emergentes para abrir el reporte PDF.";
    });

    appointmentsPage.addEventListener("click", (event) => {
        const detailsButton = event.target.closest("[data-view-appointment]");
        if (detailsButton) {
            openAppointmentDetails(detailsButton.dataset.viewAppointment);
            return;
        }
        const button = event.target.closest("[data-cancel-appointment]");
        if (!button || !cancellationDialog || !cancellationForm) return;
        const appointment = displayedAppointments.find(
            (item) => String(item.id) === button.dataset.cancelAppointment,
        );
        const patientName = appointment?.patient.name || "el paciente";
        openCancellationDialog(button.dataset.cancelAppointment, patientName);
    });

    detailsDialog
        ?.querySelector("[data-appointment-details-close]")
        .addEventListener("click", () => {
            activeDetailsRequestId += 1;
            detailsDialog.close();
        });

    cancellationForm?.querySelector("[data-cancellation-close]")?.addEventListener("click", () => {
        cancellationDialog.close();
    });

    cancellationForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!selectedAppointmentId) return;
        cancellationError.hidden = true;
        const submitButton = cancellationForm.querySelector("[type='submit']");
        submitButton.disabled = true;
        try {
            const response = await fetch(
                `/api/admin/appointments/${selectedAppointmentId}/status`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({ reason: cancellationReason.value }),
                },
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "No pudimos cancelar la cita.");
            cancellationDialog.close();
            appointmentsPage.querySelector("[data-appointment-feedback]").textContent =
                result.message;
            await loadAppointments();
        } catch (error) {
            cancellationError.textContent = error.message;
            cancellationError.hidden = false;
        } finally {
            submitButton.disabled = false;
        }
    });

    loadAppointments();
}
