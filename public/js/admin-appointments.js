const appointmentsPage = document.querySelector("[data-admin-appointments]");

if (appointmentsPage) {
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
    const topSearch = document.querySelector("[data-user-top-search]");
    const topSearchForm = document.querySelector(".admin-global-search");
    const tabs = appointmentsPage.querySelector("[data-appointment-tabs]");
    const cancellationDialog = appointmentsPage.querySelector("[data-cancellation-dialog]");
    const cancellationForm = appointmentsPage.querySelector("[data-cancellation-form]");
    const cancellationReason = appointmentsPage.querySelector("[data-cancellation-reason]");
    const cancellationError = appointmentsPage.querySelector("[data-cancellation-error]");
    let selectedAppointmentId = null;
    let displayedAppointments = [];
    let currentPage = 1;

    function createOption(select, value, label) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.append(option);
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

    function createPatientCell(patient) {
        const cell = document.createElement("td");
        cell.dataset.label = "Paciente";

        const avatar = document.createElement("span");
        avatar.className = "appointment-patient-avatar";
        if (patient.photoUrl) {
            const image = document.createElement("img");
            image.src = patient.photoUrl;
            image.alt = "";
            image.addEventListener("error", () => image.remove());
            avatar.append(image);
        }
        const initials = document.createElement("span");
        initials.className = "appointment-patient-initials";
        initials.textContent = getInitials(patient.name);
        avatar.append(initials);

        const name = document.createElement("span");
        name.textContent = patient.name;
        cell.append(avatar, name);
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
        date.append(dateText, timeText);

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
        actionsCell.append(createAppointmentDetailsLink(appointment));
        if (appointment.status === "Confirmed") {
            actionsCell.append(createAppointmentEditLink(appointment));
            actionsCell.append(createAppointmentCancelButton(appointment));
        }

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

    function createAppointmentDetailsLink(appointment) {
        const link = document.createElement("a");
        link.className = "appointment-details-link";
        link.href = `/admin/appointments/${appointment.id}`;
        link.setAttribute("aria-label", `Ver detalles de la cita de ${appointment.patient.name}`);
        link.textContent = "Ver";
        return link;
    }

    function createAppointmentEditLink(appointment) {
        const link = document.createElement("a");
        link.className = "appointment-edit-link";
        link.href = `/admin/appointments/${appointment.id}/edit`;
        link.setAttribute(
            "aria-label",
            `Editar y reprogramar la cita de ${appointment.patient.name}`,
        );
        link.textContent = "Editar";
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
        const detailsLink = createAppointmentDetailsLink(appointment);
        const editLink =
            appointment.status === "Confirmed" ? createAppointmentEditLink(appointment) : null;
        const cancelButton =
            appointment.status === "Confirmed" ? createAppointmentCancelButton(appointment) : null;
        card.append(
            date,
            createPatientCell(appointment.patient).querySelector(".appointment-patient-avatar"),
            details,
            status,
            detailsLink,
        );
        if (editLink) card.append(editLink);
        if (cancelButton) card.append(cancelButton);
        return card;
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

    function renderStats(stats) {
        appointmentsPage.querySelector("[data-stat-total]").textContent = stats.total;
        appointmentsPage.querySelector("[data-stat-confirmed]").textContent = stats.Confirmed;
        appointmentsPage.querySelector("[data-stat-in-progress]").textContent =
            stats["In Progress"];
        appointmentsPage.querySelector("[data-stat-attended]").textContent = stats.Attended;
        appointmentsPage.querySelector("[data-stat-cancelled]").textContent = stats.Cancelled;
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
        feedback.textContent = "Cargando citas...";
        errorMessage.hidden = true;
        const params = new URLSearchParams({
            page: String(currentPage),
            pageSize: pageSize.value,
            status: status.value,
        });
        if (fromDate.value) params.set("from", fromDate.value);
        if (toDate.value) params.set("to", toDate.value);
        if (specialty.value !== "all") params.set("specialtyId", specialty.value);
        if (doctor.value !== "all") params.set("doctorId", doctor.value);
        if (search.value.trim()) params.set("search", search.value.trim());

        try {
            const response = await fetch(`${endpoint}?${params}`, {
                headers: { Accept: "application/json" },
                cache: "no-store",
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No pudimos cargar las citas.");
            renderOptions(data);
            renderStats(data.stats);
            renderAppointments(data.appointments);
            renderPagination(data.pagination);
            feedback.textContent = data.pagination.totalItems
                ? `${data.pagination.totalItems} cita${data.pagination.totalItems === 1 ? "" : "s"} encontrada${data.pagination.totalItems === 1 ? "" : "s"}.`
                : "No hay citas para mostrar.";
        } catch (error) {
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
            if (topSearch) topSearch.value = search.value;
            loadAppointments();
        });
    topSearchForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        search.value = topSearch.value;
        currentPage = 1;
        loadAppointments();
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
        currentPage = 1;
        syncSelectedTab(status.value);
        loadAppointments();
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
    search.addEventListener("input", () => {
        if (topSearch) topSearch.value = search.value;
    });
    topSearch?.addEventListener("input", () => {
        search.value = topSearch.value;
    });

    appointmentsPage.addEventListener("click", (event) => {
        const button = event.target.closest("[data-cancel-appointment]");
        if (!button) return;
        const appointment = displayedAppointments.find(
            (item) => String(item.id) === button.dataset.cancelAppointment,
        );
        const patientName = appointment?.patient.name || "el paciente";
        openCancellationDialog(button.dataset.cancelAppointment, patientName);
    });

    appointmentsPage.querySelector("[data-cancellation-close]").addEventListener("click", () => {
        cancellationDialog.close();
    });

    cancellationForm.addEventListener("submit", async (event) => {
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
