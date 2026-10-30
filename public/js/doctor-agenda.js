const agendaRoot = document.querySelector("[data-doctor-agenda]");

if (agendaRoot) {
    const apiUrl = agendaRoot.dataset.agendaApiUrl;
    const dateInput = agendaRoot.querySelector("[data-agenda-date]");
    const calendar = agendaRoot.querySelector("[data-agenda-calendar]");
    const calendarLayout = agendaRoot.querySelector(".doctor-agenda-layout");
    const calendarAside = agendaRoot.querySelector("[data-agenda-aside]");
    const loadingState = agendaRoot.querySelector("[data-agenda-loading]");
    const feedback = agendaRoot.querySelector("[data-agenda-feedback]");
    const headingEyebrow = agendaRoot.querySelector("[data-agenda-eyebrow]");
    const title = agendaRoot.querySelector("[data-agenda-title]");
    const dailyTimeline = agendaRoot.querySelector("[data-agenda-timeline]");
    const dailyEmpty = agendaRoot.querySelector("[data-agenda-empty]");
    const weeklyView = agendaRoot.querySelector("[data-agenda-week-view]");
    const weeklyTitle = agendaRoot.querySelector("[data-agenda-week-title]");
    const weeklyGrid = agendaRoot.querySelector("[data-agenda-week-grid]");
    const monthlyView = agendaRoot.querySelector("[data-agenda-month-view]");
    const monthlyTitle = agendaRoot.querySelector("[data-agenda-month-title]");
    const monthlyGrid = agendaRoot.querySelector("[data-agenda-month-grid]");
    const monthlyEmpty = agendaRoot.querySelector("[data-agenda-month-empty]");
    const periodsList = agendaRoot.querySelector("[data-agenda-periods]");
    const exceptionsList = agendaRoot.querySelector("[data-agenda-exceptions]");
    let selectedView = agendaRoot.dataset.initialView || "day";
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

    function renderDailyTimeline(data) {
        dailyTimeline.replaceChildren();
        if (!data.timeline) return;

        const { startHour, endHour } = data.timeline;
        const totalMinutes = (endHour - startHour) * 60;
        dailyTimeline.style.setProperty("--agenda-hours", String(endHour - startHour));
        dailyTimeline.setAttribute("aria-label", `Agenda del ${data.dateLabel}`);

        data.workingPeriods.forEach((period) => {
            const block = createElement("div", "doctor-agenda-working-period");
            block.style.top = `${((period.startMinute - startHour * 60) / totalMinutes) * 100}%`;
            block.style.height = `${((period.endMinute - period.startMinute) / totalMinutes) * 100}%`;
            block.setAttribute("aria-hidden", "true");
            dailyTimeline.append(block);
        });

        data.exceptions.forEach((exception) => {
            const block = createElement("div", "doctor-agenda-exception-band", exception.label);
            block.style.top = `${((exception.startMinute - startHour * 60) / totalMinutes) * 100}%`;
            block.style.height = `${((exception.endMinute - exception.startMinute) / totalMinutes) * 100}%`;
            block.setAttribute("aria-hidden", "true");
            dailyTimeline.append(block);
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
            dailyTimeline.append(row);
        }

        data.appointments.forEach((appointment) => {
            const duration = Math.max(0, appointment.endMinute - appointment.startMinute);
            const card = document.createElement("a");
            card.className = "doctor-agenda-appointment doctor-agenda-status-confirmed";
            card.href = getAppointmentLink(data.selectedDate);
            card.style.top = `${((appointment.startMinute - startHour * 60) / totalMinutes) * 100}%`;
            const hourHeight = Number.parseFloat(
                getComputedStyle(dailyTimeline).getPropertyValue("--agenda-hour-height"),
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
            card.append(renderAvatar(appointment), content);
            dailyTimeline.append(card);
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
            exceptionsList.append(item);
        });
    }

    function renderWeeklyView(data) {
        weeklyGrid.replaceChildren();
        weeklyTitle.textContent = data.periodLabel;
        data.days.forEach((day) => {
            const dayCard = createElement("section", "doctor-agenda-week-day");
            dayCard.append(createElement("h3", "", day.dateLabel));
            if (!day.appointments.length) {
                dayCard.append(
                    createElement("p", "doctor-agenda-week-empty", "Sin citas confirmadas"),
                );
            } else {
                const appointmentList = createElement("ul", "doctor-agenda-week-appointments");
                day.appointments.forEach((appointment) => {
                    const item = createElement("li", "");
                    const link = document.createElement("a");
                    link.className = "doctor-agenda-week-appointment";
                    link.href = getAppointmentLink(day.date);
                    link.setAttribute(
                        "aria-label",
                        `${appointment.startTime}, ${appointment.patientName}, ${appointment.reason}, ${appointment.statusLabel}`,
                    );
                    link.append(createElement("time", "", appointment.startTime));
                    const details = createElement("span", "doctor-agenda-week-appointment-copy");
                    details.append(createElement("b", "", appointment.patientName));
                    details.append(createElement("span", "", appointment.reason));
                    link.append(details);
                    item.append(link);
                    appointmentList.append(item);
                });
                dayCard.append(appointmentList);
            }
            weeklyGrid.append(dayCard);
        });
    }

    function getMonthWeekdayOffset(dateString) {
        const weekday = new Date(`${dateString}T00:00:00.000Z`).getUTCDay();
        return (weekday + 6) % 7;
    }

    function renderMonthlyView(data) {
        monthlyGrid.replaceChildren();
        monthlyTitle.textContent = data.periodLabel;
        ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].forEach((label) => {
            monthlyGrid.append(createElement("span", "doctor-agenda-month-weekday", label));
        });
        for (let index = 0; index < getMonthWeekdayOffset(data.rangeStart); index += 1) {
            monthlyGrid.append(createElement("span", "doctor-agenda-month-day is-empty"));
        }
        data.days.forEach((day) => {
            const cell = createElement("button", "doctor-agenda-month-day");
            cell.type = "button";
            cell.dataset.agendaDate = day.date;
            if (day.isToday) cell.classList.add("is-today");
            if (day.appointmentCount > 0) cell.classList.add("has-appointments");
            cell.setAttribute(
                "aria-label",
                `${formatAccessibleDate(day.date)}: ${day.appointmentCount} citas confirmadas`,
            );
            cell.append(
                createElement("span", "doctor-agenda-month-day-number", String(day.dayNumber)),
            );
            if (day.appointmentCount > 0) {
                cell.append(
                    createElement(
                        "span",
                        "doctor-agenda-month-count",
                        `${day.appointmentCount} ${day.appointmentCount === 1 ? "cita" : "citas"}`,
                    ),
                );
            }
            cell.addEventListener("click", () => selectAgenda(day.date, "day"));
            monthlyGrid.append(cell);
        });
        monthlyEmpty.hidden = data.days.some((day) => day.appointmentCount > 0);
    }

    function formatAccessibleDate(dateString) {
        const date = new Date(`${dateString}T05:00:00.000Z`);
        return new Intl.DateTimeFormat("es-CO", {
            timeZone: "America/Bogota",
            dateStyle: "full",
        }).format(date);
    }

    function renderAgenda(data) {
        const isDaily = selectedView === "day";
        const isWeekly = selectedView === "week";
        headingEyebrow.textContent = isDaily ? "Jornada" : "Vista de agenda";
        title.textContent = isDaily
            ? data.dateLabel.charAt(0).toUpperCase() + data.dateLabel.slice(1)
            : isWeekly
              ? "Agenda semanal"
              : "Agenda mensual";
        calendarAside.hidden = !isDaily;
        calendarLayout.classList.toggle("is-calendar-only", !isDaily);
        dailyTimeline.hidden = !isDaily || !data.timeline;
        dailyEmpty.hidden = !isDaily || Boolean(data.timeline);
        weeklyView.hidden = !isWeekly;
        monthlyView.hidden = isDaily || isWeekly;

        if (isDaily) {
            renderDailyTimeline(data);
            renderPeriods(data.workingPeriods);
            renderExceptions(data.exceptions);
        } else if (isWeekly) {
            renderWeeklyView(data);
        } else {
            renderMonthlyView(data);
        }
        updateViewButtons();
        calendar.setAttribute("aria-busy", "false");
    }

    function updateViewButtons() {
        agendaRoot.querySelectorAll("[data-agenda-view]").forEach((button) => {
            const isSelected = button.dataset.agendaView === selectedView;
            button.setAttribute("aria-pressed", String(isSelected));
        });
    }

    function updateAddressBar() {
        const url = new URL(window.location.href);
        url.searchParams.set("view", selectedView);
        url.searchParams.set("date", dateInput.value);
        window.history.pushState({ view: selectedView, date: dateInput.value }, "", url);
    }

    async function loadAgenda() {
        const requestId = ++activeRequest;
        loadingState.hidden = false;
        dailyTimeline.hidden = true;
        dailyEmpty.hidden = true;
        weeklyView.hidden = true;
        monthlyView.hidden = true;
        feedback.hidden = true;
        calendar.setAttribute("aria-busy", "true");
        try {
            const query = new URLSearchParams({ view: selectedView, date: dateInput.value });
            const response = await fetch(`${apiUrl}?${query.toString()}`, {
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
            calendarAside.hidden = true;
            calendarLayout.classList.add("is-calendar-only");
        } finally {
            if (requestId === activeRequest) loadingState.hidden = true;
        }
    }

    function selectAgenda(date, view, updateHistory = true) {
        dateInput.value = date;
        selectedView = view;
        updateViewButtons();
        if (updateHistory) updateAddressBar();
        loadAgenda();
    }

    function moveSelectedPeriod(direction) {
        const selectedDate = new Date(`${dateInput.value}T00:00:00.000Z`);
        if (selectedView === "day") {
            selectedDate.setUTCDate(selectedDate.getUTCDate() + direction);
        } else if (selectedView === "week") {
            selectedDate.setUTCDate(selectedDate.getUTCDate() + direction * 7);
        } else {
            const selectedDay = selectedDate.getUTCDate();
            selectedDate.setUTCDate(1);
            selectedDate.setUTCMonth(selectedDate.getUTCMonth() + direction);
            const lastDay = new Date(
                Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth() + 1, 0),
            ).getUTCDate();
            selectedDate.setUTCDate(Math.min(selectedDay, lastDay));
        }
        selectAgenda(selectedDate.toISOString().slice(0, 10), selectedView);
    }

    agendaRoot
        .querySelector("[data-agenda-previous]")
        .addEventListener("click", () => moveSelectedPeriod(-1));
    agendaRoot
        .querySelector("[data-agenda-next]")
        .addEventListener("click", () => moveSelectedPeriod(1));
    agendaRoot.querySelector("[data-agenda-today]").addEventListener("click", () => {
        selectAgenda(agendaRoot.dataset.todayDate, selectedView);
    });
    agendaRoot.querySelectorAll("[data-agenda-view]").forEach((button) => {
        button.addEventListener("click", () =>
            selectAgenda(dateInput.value, button.dataset.agendaView),
        );
    });
    dateInput.addEventListener("change", () => selectAgenda(dateInput.value, selectedView));
    window.addEventListener("popstate", () => {
        const url = new URL(window.location.href);
        const view = ["day", "week", "month"].includes(url.searchParams.get("view"))
            ? url.searchParams.get("view")
            : "day";
        const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") || "")
            ? url.searchParams.get("date")
            : agendaRoot.dataset.todayDate;
        selectAgenda(date, view, false);
    });
    updateViewButtons();
    loadAgenda();
}
