const agendaRoot = document.querySelector("[data-doctor-agenda]");

if (agendaRoot) {
    const apiUrl = agendaRoot.dataset.agendaApiUrl;
    const dateInput = agendaRoot.querySelector("[data-agenda-date]");
    const calendar = agendaRoot.querySelector("[data-agenda-calendar]");
    const timeline = agendaRoot.querySelector("[data-agenda-timeline]");
    const loadingState = agendaRoot.querySelector("[data-agenda-loading]");
    const emptyState = agendaRoot.querySelector("[data-agenda-empty]");
    const feedback = agendaRoot.querySelector("[data-agenda-feedback]");
    const title = agendaRoot.querySelector("[data-agenda-title]");
    const periodsList = agendaRoot.querySelector("[data-agenda-periods]");
    const exceptionsList = agendaRoot.querySelector("[data-agenda-exceptions]");
    let activeRequest = 0;

    function createElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function getInitials(name) {
        return name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase();
    }

    function getAppointmentLink(date) {
        const query = new URLSearchParams({ startDate: date, endDate: date });
        return `/doctor/appointments?${query.toString()}`;
    }

    function renderAvatar(appointment) {
        const avatar = createElement("span", "doctor-patient-avatar");
        if (appointment.patientPhotoUrl) {
            const image = document.createElement("img");
            image.src = appointment.patientPhotoUrl;
            image.alt = "";
            image.loading = "lazy";
            avatar.append(image);
        } else {
            avatar.textContent = getInitials(appointment.patientName);
        }
        return avatar;
    }

    function renderTimeline(data) {
        timeline.replaceChildren();
        if (!data.timeline) return;

        const { startHour, endHour } = data.timeline;
        const totalMinutes = (endHour - startHour) * 60;
        timeline.style.setProperty("--agenda-hours", String(endHour - startHour));
        timeline.setAttribute("aria-label", `Agenda del ${data.dateLabel}`);

        data.workingPeriods.forEach((period) => {
            const block = createElement("div", "doctor-agenda-working-period");
            block.style.top = `${((period.startMinute - startHour * 60) / totalMinutes) * 100}%`;
            block.style.height = `${((period.endMinute - period.startMinute) / totalMinutes) * 100}%`;
            block.setAttribute("aria-hidden", "true");
            timeline.append(block);
        });

        data.exceptions.forEach((exception) => {
            const block = createElement("div", "doctor-agenda-exception-band");
            block.style.top = `${((exception.startMinute - startHour * 60) / totalMinutes) * 100}%`;
            block.style.height = `${((exception.endMinute - exception.startMinute) / totalMinutes) * 100}%`;
            block.textContent = exception.label;
            block.setAttribute("aria-hidden", "true");
            timeline.append(block);
        });

        for (let hour = startHour; hour < endHour; hour += 1) {
            const row = createElement("div", "doctor-agenda-hour");
            row.style.top = `${((hour - startHour) / (endHour - startHour)) * 100}%`;
            const label = new Intl.DateTimeFormat("es-CO", {
                timeZone: "UTC",
                hour: "numeric",
                hour12: true,
            }).format(new Date(Date.UTC(2020, 0, 1, hour)));
            row.append(createElement("span", "doctor-agenda-hour-label", label));
            row.append(createElement("span", "doctor-agenda-hour-rule"));
            timeline.append(row);
        }

        data.appointments.forEach((appointment) => {
            const duration = Math.max(0, appointment.endMinute - appointment.startMinute);
            const card = document.createElement("a");
            card.className = `doctor-agenda-appointment doctor-agenda-status-${appointment.status.toLowerCase().replace(/\s+/g, "-")}`;
            card.href = getAppointmentLink(data.selectedDate);
            card.style.top = `${((appointment.startMinute - startHour * 60) / totalMinutes) * 100}%`;
            const hourHeight = Number.parseFloat(
                getComputedStyle(timeline).getPropertyValue("--agenda-hour-height"),
            );
            card.style.height = `${Math.max(38, (duration / 60) * hourHeight)}px`;
            card.setAttribute(
                "aria-label",
                `${appointment.startTime} a ${appointment.endTime}, ${appointment.patientName}, ${appointment.statusLabel}, ${appointment.reason}`,
            );
            const content = createElement("span", "doctor-agenda-appointment-copy");
            content.append(
                createElement("strong", "", `${appointment.startTime} – ${appointment.endTime}`),
            );
            const details = createElement("span", "doctor-agenda-appointment-detail");
            details.append(createElement("b", "", appointment.patientName));
            details.append(createElement("span", "", appointment.reason));
            content.append(details);
            const status = createElement("span", "doctor-status", appointment.statusLabel);
            card.append(renderAvatar(appointment), content, status);
            timeline.append(card);
        });
    }

    function renderPeriods(periods) {
        periodsList.replaceChildren();
        if (!periods.length) {
            periodsList.append(
                createElement(
                    "li",
                    "doctor-agenda-aside-empty",
                    "No hay horario laboral configurado.",
                ),
            );
            return;
        }
        periods.forEach((period) => {
            const item = createElement("li", "doctor-agenda-period");
            item.append(createElement("span", "doctor-agenda-period-icon", "◷"));
            item.append(
                createElement(
                    "span",
                    "doctor-agenda-period-copy",
                    `${period.startTime} – ${period.endTime}`,
                ),
            );
            periodsList.append(item);
        });
    }

    function renderExceptions(exceptions) {
        exceptionsList.replaceChildren();
        if (!exceptions.length) {
            exceptionsList.append(
                createElement(
                    "li",
                    "doctor-agenda-aside-empty",
                    "No hay excepciones para este día.",
                ),
            );
            return;
        }
        exceptions.forEach((exception) => {
            const item = createElement("li", "doctor-agenda-exception");
            item.append(createElement("strong", "", exception.label));
            item.append(createElement("span", "", `${exception.startTime} – ${exception.endTime}`));
            if (exception.reason) item.append(createElement("small", "", exception.reason));
            exceptionsList.append(item);
        });
    }

    function formatDateHeading(data) {
        return data.dateLabel.charAt(0).toUpperCase() + data.dateLabel.slice(1);
    }

    function renderAgenda(data) {
        title.textContent = formatDateHeading(data);
        renderTimeline(data);
        renderPeriods(data.workingPeriods);
        renderExceptions(data.exceptions);
        timeline.hidden = !data.timeline;
        emptyState.hidden = Boolean(data.timeline);
        calendar.setAttribute("aria-busy", "false");
    }

    async function loadAgenda() {
        const requestId = ++activeRequest;
        loadingState.hidden = false;
        timeline.hidden = true;
        emptyState.hidden = true;
        feedback.hidden = true;
        calendar.setAttribute("aria-busy", "true");
        try {
            const response = await fetch(`${apiUrl}?date=${encodeURIComponent(dateInput.value)}`, {
                headers: { Accept: "application/json" },
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "No fue posible cargar la agenda.");
            if (requestId !== activeRequest) return;
            renderAgenda(result);
        } catch (error) {
            if (requestId !== activeRequest) return;
            feedback.textContent = error.message || "Ocurrió un error al cargar la agenda.";
            feedback.hidden = false;
            title.textContent = "No se pudo cargar la agenda";
            renderPeriods([]);
            renderExceptions([]);
        } finally {
            if (requestId === activeRequest) loadingState.hidden = true;
        }
    }

    function moveSelectedDate(days) {
        const date = new Date(`${dateInput.value}T12:00:00`);
        date.setDate(date.getDate() + days);
        dateInput.value = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0"),
        ].join("-");
        loadAgenda();
    }

    agendaRoot
        .querySelector("[data-agenda-previous]")
        .addEventListener("click", () => moveSelectedDate(-1));
    agendaRoot
        .querySelector("[data-agenda-next]")
        .addEventListener("click", () => moveSelectedDate(1));
    agendaRoot.querySelector("[data-agenda-today]").addEventListener("click", () => {
        dateInput.value = agendaRoot.dataset.todayDate;
        loadAgenda();
    });
    dateInput.addEventListener("change", loadAgenda);
    loadAgenda();
}
