(() => {
    const page = document.querySelector("[data-appointments-api-url]");
    const filterForm = document.querySelector("[data-appointment-filters]");
    const results = document.querySelector("[data-appointments-results]");
    const table = document.querySelector("[data-appointments-table]");
    const emptyState = document.querySelector("[data-appointments-empty]");
    const emptyTitle = document.querySelector("[data-appointments-empty-title]");
    const emptyMessage = document.querySelector("[data-appointments-empty-message]");
    const pagination = document.querySelector("[data-appointments-pagination]");
    const liveFeedback = document.querySelector("[data-appointment-live-feedback]");

    if (!page || !(filterForm instanceof HTMLFormElement) || !results) return;

    const liveSearch = filterForm.querySelector("[data-live-search]");
    const pageSize = 6;
    let searchDelay;
    let activeRequest;

    function createCell(label) {
        const cell = document.createElement("td");
        cell.dataset.label = label;
        return cell;
    }

    function getInitials(name) {
        return name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0))
            .join("")
            .toUpperCase();
    }

    function createAppointmentRow(appointment) {
        const row = document.createElement("tr");
        row.id = `appointment-${appointment.id}`;

        const dateCell = createCell("Fecha y hora");
        const appointmentDate = document.createElement("time");
        appointmentDate.className = "doctor-appointment-date";
        appointmentDate.dateTime = appointment.startAt;
        const dateLabel = document.createElement("strong");
        dateLabel.textContent = appointment.dateLabel;
        const timeLabel = document.createElement("span");
        timeLabel.textContent = `${appointment.time} ${appointment.meridiem}`;
        appointmentDate.append(dateLabel, timeLabel);
        dateCell.append(appointmentDate);

        const patientCell = createCell("Paciente");
        const patientSummary = document.createElement("div");
        patientSummary.className = "doctor-table-patient";
        const avatar = document.createElement("span");
        avatar.className = "doctor-patient-avatar";
        avatar.setAttribute("aria-hidden", "true");
        if (appointment.patientPhotoUrl) {
            const image = document.createElement("img");
            image.src = appointment.patientPhotoUrl;
            image.alt = "";
            image.loading = "lazy";
            avatar.append(image);
        } else {
            avatar.textContent = getInitials(appointment.patientName);
        }
        const patientInfo = document.createElement("span");
        patientInfo.className = "doctor-appointment-info";
        const patientName = document.createElement("strong");
        patientName.textContent = appointment.patientName;
        patientInfo.append(patientName);
        patientSummary.append(avatar, patientInfo);
        patientCell.append(patientSummary);

        const reasonCell = createCell("Tipo de consulta");
        reasonCell.textContent = appointment.reason || appointment.specialty;

        const statusCell = createCell("Estado");
        const status = document.createElement("span");
        status.className = `doctor-status status-${appointment.statusKey}`;
        status.textContent = appointment.statusLabel;
        statusCell.append(status);

        row.append(dateCell, patientCell, reasonCell, statusCell);
        return row;
    }

    function updatePagination(data, parameters) {
        const pageNumber = Number(data.appointmentPage) || 1;
        const totalPages = Number(data.appointmentTotalPages) || 1;
        const appointmentCount = Number(data.appointmentCount) || 0;
        const range = pagination.querySelector("[data-appointments-range]");
        const pageLabel = pagination.querySelector("[data-appointments-page-label]");
        const previousPage = pagination.querySelector("[data-previous-page]");
        const nextPage = pagination.querySelector("[data-next-page]");
        const previousButton = previousPage?.form?.querySelector("button");
        const nextButton = nextPage?.form?.querySelector("button");

        pagination.hidden = appointmentCount <= pageSize;
        if (range) {
            const firstResult = appointmentCount ? (pageNumber - 1) * pageSize + 1 : 0;
            const lastResult = Math.min(pageNumber * pageSize, appointmentCount);
            range.textContent = `Mostrando ${firstResult} a ${lastResult} de ${appointmentCount} citas`;
        }
        if (pageLabel) pageLabel.textContent = `Página ${pageNumber} de ${totalPages}`;

        [previousPage, nextPage].filter(Boolean).forEach((input) => {
            for (const name of ["startDate", "endDate", "status", "search"]) {
                const filterValue = parameters.get(name) || "";
                const hiddenInput = input.form.elements.namedItem(name);
                if (hiddenInput) hiddenInput.value = filterValue;
            }
        });
        if (previousPage) previousPage.value = String(pageNumber - 1);
        if (nextPage) nextPage.value = String(pageNumber + 1);
        if (previousButton) previousButton.disabled = pageNumber <= 1;
        if (nextButton) nextButton.disabled = pageNumber >= totalPages;
    }

    function updateQuickFilters(parameters) {
        document.querySelectorAll("[data-appointment-quick-filter]").forEach((form) => {
            for (const name of ["startDate", "endDate", "search"]) {
                const input = form.elements.namedItem(name);
                if (input) input.value = parameters.get(name) || "";
            }

            const statusButton = form.querySelector('button[name="status"]');
            if (statusButton) {
                statusButton.setAttribute(
                    "aria-pressed",
                    String((parameters.get("status") || "") === statusButton.value),
                );
            }
        });
    }

    function updateMainFilters(parameters) {
        for (const name of ["startDate", "endDate", "status", "search"]) {
            const input = filterForm.elements.namedItem(name);
            if (input) input.value = parameters.get(name) || "";
        }
    }

    async function refreshAppointments(form, submitter) {
        const formData = submitter ? new FormData(form, submitter) : new FormData(form);
        const parameters = new URLSearchParams(formData);
        const requestedPage = parameters.get("page");
        if (!requestedPage) parameters.delete("page");

        activeRequest?.abort();
        activeRequest = new AbortController();
        if (liveFeedback) {
            liveFeedback.hidden = false;
            liveFeedback.textContent = "Buscando citas…";
        }

        try {
            const query = parameters.toString();
            const response = await fetch(
                `${page.dataset.appointmentsApiUrl}${query ? `?${query}` : ""}`,
                {
                    headers: { Accept: "application/json" },
                    credentials: "same-origin",
                    signal: activeRequest.signal,
                },
            );
            if (response.redirected) {
                window.location.assign(response.url);
                return;
            }
            const responseIsJson = response.headers
                .get("content-type")
                ?.includes("application/json");
            const data = responseIsJson ? await response.json() : {};
            if (!response.ok) throw new Error(data.message || "No fue posible buscar las citas.");
            if (!Array.isArray(data.appointments)) {
                throw new Error("No fue posible cargar las citas. Inténtalo nuevamente.");
            }

            const rows = data.appointments.map(createAppointmentRow);
            results.replaceChildren(...rows);
            table.hidden = rows.length === 0;
            emptyState.hidden = rows.length !== 0;
            if (emptyTitle && emptyMessage) {
                const hasAppointments = Number(data.appointmentTotalCount) > 0;
                emptyTitle.textContent = hasAppointments
                    ? "No encontramos citas con esos filtros"
                    : "Aún no tienes citas";
                emptyMessage.textContent = hasAppointments
                    ? "Prueba cambiar los filtros o limpiar la búsqueda."
                    : "Tus citas asignadas aparecerán aquí.";
            }

            updatePagination(data, parameters);
            updateMainFilters(parameters);
            updateQuickFilters(parameters);
            const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
            window.history.replaceState({}, "", nextUrl);
            if (liveFeedback) {
                liveFeedback.hidden = false;
                liveFeedback.textContent = `${data.appointmentCount} ${data.appointmentCount === 1 ? "cita encontrada" : "citas encontradas"}.`;
            }
        } catch (error) {
            if (error.name === "AbortError") return;
            if (liveFeedback) {
                liveFeedback.hidden = false;
                liveFeedback.textContent = error.message;
            }
        }
    }

    document
        .querySelectorAll("[data-appointment-filters], [data-appointment-quick-filter], [data-appointment-page-filter]")
        .forEach((form) => {
            form.addEventListener("submit", (event) => {
                event.preventDefault();
                refreshAppointments(form, event.submitter);
            });
        });

    liveSearch?.addEventListener("input", () => {
        window.clearTimeout(searchDelay);
        activeRequest?.abort();
        searchDelay = window.setTimeout(() => filterForm.requestSubmit(), 200);
    });

    filterForm.querySelectorAll('input[type="date"], select').forEach((control) => {
        control.addEventListener("change", () => filterForm.requestSubmit());
    });
})();
