(() => {
    const page = document.querySelector("[data-doctor-schedules]");
    if (!page) return;

    const endpoint = page.dataset.endpoint;
    const exceptionsEndpoint = page.dataset.exceptionsEndpoint;
    const filterForm = page.querySelector("[data-schedule-filters]");
    const searchInput = page.querySelector("[data-schedule-search]");
    const doctorSelect = page.querySelector("[data-schedule-doctor]");
    const specialtySelect = page.querySelector("[data-schedule-specialty]");
    const statusSelect = page.querySelector("[data-schedule-status]");
    const weekInput = page.querySelector("[data-schedule-week]");
    const configureOpenButton = page.querySelector("[data-configure-open]");
    const configureDialog = document.querySelector("[data-schedule-config-dialog]");
    const configureForm = document.querySelector("[data-schedule-config-form]");
    const configureDoctorSelect = document.querySelector("[data-config-doctor]");
    const configureError = document.querySelector("[data-config-error]");
    const configureSuccess = document.querySelector("[data-config-success]");
    const configureImpact = document.querySelector("[data-config-impact]");
    const configureImpactList = document.querySelector("[data-config-impact-list]");
    const configureSubmitButton = document.querySelector("[data-config-submit]");
    const configureDeleteButton = document.querySelector("[data-config-delete]");
    const exceptionDialog = document.querySelector("[data-exception-manager-dialog]");
    const exceptionForm = document.querySelector("[data-exception-form]");
    const exceptionList = document.querySelector("[data-exception-list]");
    const exceptionLoading = document.querySelector("[data-exception-loading]");
    const exceptionEmpty = document.querySelector("[data-exception-empty]");
    const exceptionError = document.querySelector("[data-exception-error]");
    const exceptionFeedback = document.querySelector("[data-exception-feedback]");
    const exceptionStatus = document.querySelector("[data-exception-status]");
    const exceptionDoctor = document.querySelector("[data-exception-doctor]");
    const exceptionType = document.querySelector("[data-exception-type]");
    const exceptionStart = document.querySelector("[data-exception-start]");
    const exceptionEnd = document.querySelector("[data-exception-end]");
    const exceptionReason = document.querySelector("[data-exception-reason]");
    const exceptionSubmit = document.querySelector("[data-exception-submit]");
    const exceptionImpact = document.querySelector("[data-exception-impact]");
    const exceptionImpactList = document.querySelector("[data-exception-impact-list]");
    const exceptionImpactConfirm = document.querySelector("[data-exception-impact-confirm]");
    const exceptionManager = document.querySelector("[data-exception-manager]");
    const exceptionToolbar = document.querySelector(".schedule-exception-toolbar");
    let managedExceptions = [];
    let exceptionDoctors = [];
    let pendingExceptionStatusRequest = null;
    const configPageFeedback = page.querySelector("[data-config-page-feedback]");
    const feedback = page.querySelector("[data-schedule-feedback]");
    const errorMessage = page.querySelector("[data-schedule-error]");
    const doctorList = page.querySelector("[data-schedule-doctor-list]");
    const emptyMessage = page.querySelector("[data-schedule-empty]");
    const weeklyView = page.querySelector("[data-weekly-view]");
    const weeklyContent = page.querySelector("[data-weekly-content]");
    const weeklyFeedback = page.querySelector("[data-weekly-feedback]");
    const weeklyError = page.querySelector("[data-weekly-error]");
    const exceptionsList = page.querySelector("[data-schedule-exceptions]");
    const exceptionsEmpty = page.querySelector("[data-schedule-exceptions-empty]");
    const topbarSearch = document.querySelector("[data-user-top-search]");
    const topbarForm = topbarSearch?.closest("form");
    const weekdayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

    function setText(selector, value) {
        const element = page.querySelector(selector);
        if (element) element.textContent = String(value);
    }

    function escapeAttribute(value) {
        return String(value).replace(
            /[&"<>']/g,
            (character) =>
                ({
                    "&": "&amp;",
                    '"': "&quot;",
                    "<": "&lt;",
                    ">": "&gt;",
                    "'": "&#39;",
                })[character],
        );
    }

    function formatTime(value) {
        if (value === "24:00") return "12:00 a. m.";
        const [hours, minutes] = value.split(":").map(Number);
        const suffix = hours >= 12 ? "p. m." : "a. m.";
        const displayHour = hours % 12 || 12;
        return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
    }

    function formatDate(value, options = { day: "numeric", month: "short" }) {
        return new Intl.DateTimeFormat("es-CO", {
            ...options,
            timeZone: "America/Bogota",
        }).format(new Date(value));
    }

    function getInitials(name) {
        return name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0] || "")
            .join("")
            .toLocaleUpperCase("es-CO");
    }

    function getDateForWeekday(dayIndex) {
        const monday = new Date(`${weekInput.value}T00:00:00Z`);
        monday.setUTCDate(monday.getUTCDate() + dayIndex);
        return monday.toISOString().slice(0, 10);
    }

    function getSafeImageUrl(value) {
        if (!value) return null;
        try {
            const url = new URL(value, window.location.origin);
            return ["http:", "https:"].includes(url.protocol) ? url.href : null;
        } catch {
            return null;
        }
    }

    function renderSelectOptions(select, options, label, getLabel) {
        const selectedValue = select.value;
        select.replaceChildren(new Option(label, ""));
        for (const option of options) {
            const item = new Option(getLabel(option), String(option.id));
            if (String(option.id) === selectedValue) item.selected = true;
            select.add(item);
        }
    }

    function updateConfigurationOptions(doctors) {
        renderSelectOptions(doctorSelect, doctors, "Todos los médicos", (doctor) => doctor.name);
        if (!configureDoctorSelect || !configureOpenButton) return;
        const activeDoctors = doctors.filter((doctor) => doctor.isActive);
        renderSelectOptions(
            configureDoctorSelect,
            activeDoctors,
            "Selecciona un médico activo",
            (doctor) => doctor.name,
        );
        configureOpenButton.disabled = activeDoctors.length === 0;
        if (doctorSelect.value) configureDoctorSelect.value = doctorSelect.value;
    }

    function resetConfigurationMessages() {
        configureError.hidden = true;
        configureSuccess.hidden = true;
        configureImpact.hidden = true;
        configureImpactList.replaceChildren();
        configureSubmitButton.dataset.confirmImpact = "false";
        configureSubmitButton.textContent = "Guardar horario";
        if (configureDeleteButton) configureDeleteButton.hidden = true;
    }

    function openConfigurationDialog(mode, schedule = null) {
        resetConfigurationMessages();
        configureForm.reset();
        configureForm.dataset.mode = mode;
        configureForm.dataset.scheduleId = schedule?.id || "";
        const todayParts = new Intl.DateTimeFormat("en-GB", {
            timeZone: "America/Bogota",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(new Date());
        const today = Object.fromEntries(todayParts.map(({ type, value }) => [type, value]));
        configureForm.querySelector("[data-config-valid-from]").value =
            schedule?.validFrom || `${today.year}-${today.month}-${today.day}`;
        configureForm.querySelector("[data-config-valid-until]").value = schedule?.validUntil || "";
        configureDoctorSelect.value = String(schedule?.doctorId || doctorSelect.value || "");

        configureForm.querySelectorAll("[data-config-day]").forEach((dayElement) => {
            setEnabledDay(dayElement, false);
            dayElement.querySelector("[data-day-enabled]").checked = false;
            const intervalList = dayElement.querySelector("[data-config-intervals]");
            [...intervalList.querySelectorAll("[data-config-interval]")]
                .slice(1)
                .forEach((row) => row.remove());
            updateIntervalRemoveButtons(dayElement);
        });

        if (schedule) {
            const dayElement = configureForm.querySelector(
                `[data-config-day="${schedule.dayOfWeek}"]`,
            );
            dayElement.querySelector("[data-day-enabled]").checked = true;
            setEnabledDay(dayElement, true);
            dayElement.querySelector("[data-interval-start]").value = schedule.startTime;
            dayElement.querySelector("[data-interval-end]").value = schedule.endTime;
        }

        configureForm.querySelector("[data-config-title]").textContent = schedule
            ? "Editar horario"
            : "Configurar horario";
        configureSubmitButton.textContent = schedule ? "Guardar cambios" : "Guardar horario";
        if (configureDeleteButton) configureDeleteButton.hidden = !schedule;
        configureDialog.showModal();
        configureDoctorSelect.focus();
    }

    function openScheduleEditor(schedule) {
        openConfigurationDialog("edit", schedule);
    }

    function renderEditableScheduleBlocks(blocks) {
        const list = page.querySelector("[data-weekly-editable-blocks]");
        if (!list) return;
        list.replaceChildren();
        if (!blocks.length) {
            const emptyItem = document.createElement("li");
            emptyItem.textContent = "No hay intervalos que editar para esta semana.";
            list.append(emptyItem);
            return;
        }

        for (const block of blocks) {
            const item = document.createElement("li");
            const details = document.createElement("span");
            details.textContent = `${block.dayLabel}: ${formatTime(block.startTime)} a ${formatTime(block.endTime)}`;
            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "schedule-edit-block-button";
            editButton.textContent = "Editar";
            editButton.setAttribute(
                "aria-label",
                `Editar horario del ${block.dayLabel}, ${formatTime(block.startTime)} a ${formatTime(block.endTime)}`,
            );
            editButton.addEventListener("click", () =>
                openScheduleEditor({
                    ...block,
                    doctorId: doctorSelect.value,
                }),
            );
            item.append(details, editButton);
            list.append(item);
        }
    }

    function setEnabledDay(dayElement, enabled) {
        dayElement
            .querySelectorAll("[data-interval-start], [data-interval-end]")
            .forEach((input) => {
                input.disabled = !enabled;
                input.required = enabled;
            });
        dayElement.querySelector("[data-add-interval]").hidden = !enabled;
    }

    function updateIntervalRemoveButtons(dayElement) {
        const intervals = [...dayElement.querySelectorAll("[data-config-interval]")];
        intervals.forEach((interval) => {
            interval.querySelector("[data-remove-interval]").hidden = intervals.length === 1;
        });
    }

    function renderImpactAppointments(appointments) {
        configureImpactList.replaceChildren();
        for (const appointment of appointments) {
            const item = document.createElement("li");
            const date = new Date(`${appointment.date}T12:00:00-05:00`);
            const dateLabel = new Intl.DateTimeFormat("es-CO", {
                dateStyle: "full",
                timeZone: "America/Bogota",
            }).format(date);
            item.textContent = `Cita #${appointment.id} · ${dateLabel}, ${formatTime(appointment.startTime)} a ${formatTime(appointment.endTime)} · ${appointment.reason}`;
            configureImpactList.append(item);
        }
        configureImpact.hidden = false;
        configureSubmitButton.dataset.confirmImpact = "true";
        configureSubmitButton.textContent =
            configureForm.dataset.mode === "delete"
                ? "Confirmar eliminación, cancelar citas y notificar"
                : "Confirmar cambio, cancelar citas y notificar";
        configureSubmitButton.focus();
    }

    function collectConfiguration() {
        const blocks = [];
        configureForm.querySelectorAll("[data-config-day]").forEach((dayElement) => {
            if (!dayElement.querySelector("[data-day-enabled]").checked) return;
            dayElement.querySelectorAll("[data-config-interval]").forEach((interval) => {
                const startTime = interval.querySelector("[data-interval-start]").value;
                const endTime = interval.querySelector("[data-interval-end]").value;
                if (startTime && endTime) {
                    blocks.push({
                        dayOfWeek: Number(dayElement.dataset.configDay),
                        startTime,
                        endTime,
                    });
                }
            });
        });
        return {
            doctorId: configureDoctorSelect.value,
            validFrom: configureForm.querySelector("[data-config-valid-from]").value,
            validUntil: configureForm.querySelector("[data-config-valid-until]").value || null,
            blocks,
            confirmImpact: configureSubmitButton.dataset.confirmImpact === "true",
        };
    }

    async function submitConfiguration(event) {
        event.preventDefault();
        configureError.hidden = true;
        configureSuccess.hidden = true;
        configureSubmitButton.disabled = true;
        const isConfirmingImpact = configureSubmitButton.dataset.confirmImpact === "true";
        const isDeleting = configureForm.dataset.mode === "delete";
        configureSubmitButton.textContent = isConfirmingImpact
            ? "Confirmando…"
            : isDeleting
              ? "Eliminando…"
              : "Revisando…";
        try {
            const isEditing = configureForm.dataset.mode === "edit";
            const scheduleId = configureForm.dataset.scheduleId;
            const requestUrl = isDeleting || isEditing ? `${endpoint}/${scheduleId}` : endpoint;
            const requestBody = isDeleting
                ? { confirmImpact: configureSubmitButton.dataset.confirmImpact === "true" }
                : collectConfiguration();
            const response = await fetch(requestUrl, {
                method: isDeleting ? "DELETE" : isEditing ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(requestBody),
            });
            const data = await response.json();
            if (response.status === 409 && data.requiresConfirmation) {
                renderImpactAppointments(data.impactedAppointments || []);
                return;
            }
            if (!response.ok) throw new Error(data.message || "No pudimos guardar el horario.");

            configureDialog.close();
            configPageFeedback.textContent = [data.message, data.cancellationDetails]
                .filter(Boolean)
                .join(" ");
            configPageFeedback.hidden = false;
            doctorSelect.value = String(data.doctorId);
            await loadSchedules();
        } catch (error) {
            configureSubmitButton.dataset.confirmImpact = "false";
            configureImpact.hidden = true;
            configureError.textContent = error.message || "Revisa la información del horario.";
            configureError.hidden = false;
            configureError.focus?.();
        } finally {
            configureSubmitButton.disabled = false;
            if (configureSubmitButton.dataset.confirmImpact !== "true") {
                configureSubmitButton.textContent =
                    configureForm.dataset.mode === "edit"
                        ? "Guardar cambios"
                        : configureForm.dataset.mode === "delete"
                          ? "Eliminar intervalo"
                          : "Guardar horario";
            }
        }
    }

    function renderDoctor(doctor) {
        const profilePhotoUrl = getSafeImageUrl(doctor.profilePhotoUrl);
        const avatar = profilePhotoUrl
            ? `<img src="${escapeAttribute(profilePhotoUrl)}" alt="" loading="lazy">`
            : escapeAttribute(getInitials(doctor.name));
        const days = weekdayNames
            .map((day, index) => {
                const date = getDateForWeekday(index);
                const blocks = doctor.availability.filter(
                    (block) =>
                        block.dayOfWeek === index + 1 &&
                        block.validFrom <= date &&
                        (!block.validUntil || block.validUntil >= date),
                );
                const ranges = blocks.length
                    ? blocks
                          .map(
                              (block) =>
                                  `<div class="schedule-interval-item"><p>${formatTime(block.startTime)} – ${formatTime(block.endTime)}</p><button class="schedule-edit-block-button" type="button" data-edit-schedule="${block.id}" data-doctor-id="${doctor.id}" data-day-of-week="${block.dayOfWeek}" data-start-time="${escapeAttribute(block.startTime)}" data-end-time="${escapeAttribute(block.endTime)}" data-valid-from="${escapeAttribute(block.validFrom)}" data-valid-until="${escapeAttribute(block.validUntil || "")}" aria-label="Editar horario de ${escapeAttribute(day)}, ${formatTime(block.startTime)} a ${formatTime(block.endTime)}">Editar</button></div>`,
                          )
                          .join("")
                    : '<p class="schedule-day-empty">Sin horario</p>';
                return `<section class="schedule-day"><h4>${day}</h4>${ranges}</section>`;
            })
            .join("");
        const specialty = doctor.specialty?.name || "Sin especialidad asignada";
        const stateLabel = doctor.isActive ? "Activo" : "Cuenta inactiva";
        const stateClass = doctor.isActive ? "" : " is-inactive";

        return `<article class="schedule-doctor-card">
            <header class="schedule-doctor-heading">
                <span class="schedule-doctor-avatar">${avatar}</span>
                <div class="schedule-doctor-identity"><h3>${escapeAttribute(doctor.name)}</h3><p>${escapeAttribute(specialty)} · ${escapeAttribute(doctor.email)}</p></div>
                <span class="schedule-doctor-state${stateClass}">${stateLabel}</span>
            </header>
            <div class="schedule-week-grid" aria-label="Disponibilidad semanal de ${escapeAttribute(doctor.name)}">${days}</div>
            <button class="schedule-view-week-button" type="button" data-view-week="${doctor.id}">Ver horario semanal</button>
        </article>`;
    }

    function minuteOfDay(time) {
        const [hours, minutes] = time.split(":").map(Number);
        return hours * 60 + minutes;
    }

    function timeLabel(minutes) {
        if (minutes === 1440) return "12:00 a. m.";
        const hours = Math.floor(minutes / 60);
        const suffix = hours >= 12 ? "p. m." : "a. m.";
        return `${hours % 12 || 12}:00 ${suffix}`;
    }

    function formatDayDate(date) {
        return formatDate(new Date(`${date}T12:00:00-05:00`), {
            day: "numeric",
            month: "short",
        });
    }

    function assignEventLanes(events) {
        const laneEndTimes = [];
        return [...events]
            .sort((first, second) => first.startTime.localeCompare(second.startTime))
            .map((event) => {
                const start = minuteOfDay(event.startTime);
                const end = minuteOfDay(event.endTime);
                let lane = laneEndTimes.findIndex((laneEnd) => laneEnd <= start);
                if (lane < 0) lane = laneEndTimes.length;
                laneEndTimes[lane] = end;
                return { ...event, lane };
            });
    }

    function renderTimelineEvent(event, rangeStart, pixelsPerMinute) {
        const top = Math.max(0, (minuteOfDay(event.startTime) - rangeStart) * pixelsPerMinute);
        const duration = Math.max(
            20,
            (minuteOfDay(event.endTime) - minuteOfDay(event.startTime)) * pixelsPerMinute,
        );
        const label =
            event.type === "appointment"
                ? `${event.reference} · ${event.statusLabel}`
                : event.type === "blocked"
                  ? `${event.label}${event.reason ? ` · ${event.reason}` : ""}`
                  : event.label;
        const isAppointment = event.type === "appointment";
        const className = `weekly-event is-${event.type}`;
        const lane = Math.min(event.lane, 2);
        const isWideEvent = ["available", "additionalAvailability", "blocked"].includes(event.type);
        const laneStyle = isWideEvent
            ? "left: 3%; width: 94%;"
            : `left: ${3 + lane * 31}%; width: 29%;`;
        const isEditable = event.type === "available" && event.scheduleId;
        const editAttributes = isEditable
            ? ` role="button" tabindex="0" data-edit-schedule="${event.scheduleId}" data-doctor-id="${event.doctorId}" data-day-of-week="${event.dayOfWeek}" data-start-time="${escapeAttribute(event.startTime)}" data-end-time="${escapeAttribute(event.endTime)}" data-valid-from="${escapeAttribute(event.validFrom)}" data-valid-until="${escapeAttribute(event.validUntil || "")}" aria-label="Editar horario disponible de ${escapeAttribute(formatTime(event.startTime))} a ${escapeAttribute(formatTime(event.endTime))}" title="Editar horario"`
            : ` aria-label="${escapeAttribute(label)}, ${formatTime(event.startTime)} a ${formatTime(event.endTime)}"`;
        return `<div class="${className}${isEditable ? " is-editable" : ""}" style="top:${top}px;height:${duration}px;${laneStyle}"${editAttributes}>
            <strong>${escapeAttribute(isAppointment ? event.reference : event.label)}</strong>
            <span>${escapeAttribute(isAppointment ? event.statusLabel : event.reason || `${formatTime(event.startTime)}–${formatTime(event.endTime)}`)}</span>
        </div>`;
    }

    function renderWeeklyGrid(data) {
        const allTimes = data.days.flatMap((day) =>
            day.events.flatMap((event) => [
                minuteOfDay(event.startTime),
                minuteOfDay(event.endTime),
            ]),
        );
        const rangeStart = Math.min(420, ...allTimes.map((time) => Math.floor(time / 60) * 60));
        const rangeEnd = Math.max(1140, ...allTimes.map((time) => Math.ceil(time / 60) * 60));
        const pixelsPerMinute = 0.6;
        const timelineHeight = (rangeEnd - rangeStart) * pixelsPerMinute;
        const hourLabels = [];
        for (let minute = rangeStart; minute <= rangeEnd; minute += 60) {
            const top = (minute - rangeStart) * pixelsPerMinute;
            hourLabels.push(
                `<span class="weekly-time-label" style="top:${top}px">${timeLabel(minute)}</span>`,
            );
        }

        const header = `<div class="weekly-grid-header"><span>Hora</span>${data.days.map((day) => `<span><strong>${day.dayLabel.slice(0, 3)}</strong><small>${formatDayDate(day.date)}</small></span>`).join("")}</div>`;
        const axis = `<div class="weekly-time-axis" style="height:${timelineHeight}px">${hourLabels.join("")}</div>`;
        const columns = data.days
            .map((day) => {
                const availability = day.events
                    .filter((event) => ["available", "additionalAvailability"].includes(event.type))
                    .map((event) => ({ ...event, doctorId: data.doctor.id }));
                const timedEvents = assignEventLanes(
                    day.events.filter((event) => event.type !== "available"),
                );
                const items = [
                    ...availability.map((event) =>
                        renderTimelineEvent(event, rangeStart, pixelsPerMinute),
                    ),
                    ...timedEvents.map((event) =>
                        renderTimelineEvent(event, rangeStart, pixelsPerMinute),
                    ),
                ].join("");
                return `<section class="weekly-day-column"><h5>${day.dayLabel} · ${formatDayDate(day.date)}</h5><div class="weekly-day-timeline" style="height:${timelineHeight}px">${items}</div></section>`;
            })
            .join("");

        return `${header}<div class="weekly-grid-body">${axis}<div class="weekly-day-columns">${columns}</div></div>`;
    }

    function renderWorkingInformation(data) {
        setText("[data-weekly-doctor-name]", data.doctor.name);
        setText("[data-weekly-specialty]", data.doctor.specialty || "Sin especialidad asignada");
        setText(
            "[data-weekly-duration]",
            `${data.appointmentDurationMinutes} minutos · duración del sistema`,
        );
        setText(
            "[data-weekly-working-days]",
            data.workingDays.length
                ? data.workingDays.map((day) => day.dayLabel).join(", ")
                : "Sin horario configurado",
        );
        const hours = data.workingDays.flatMap((day) =>
            day.intervals.map(
                (interval) =>
                    `${day.dayLabel}: ${formatTime(interval.startTime)}–${formatTime(interval.endTime)}`,
            ),
        );
        setText(
            "[data-weekly-working-hours]",
            hours.length ? hours.join(" · ") : "Sin horario configurado",
        );
        const start = new Date(`${data.week.start}T12:00:00-05:00`);
        const end = new Date(`${data.week.end}T12:00:00-05:00`);
        setText(
            "[data-weekly-date-range]",
            `${formatDate(start)} – ${formatDate(end, { day: "numeric", month: "short", year: "numeric" })}`,
        );
        page.querySelector("[data-weekly-grid]").innerHTML = renderWeeklyGrid(data);
        renderEditableScheduleBlocks(data.availabilityBlocks || []);
        page.querySelector("[data-weekly-empty]").hidden =
            data.workingDays.length > 0 || data.days.some((day) => day.events.length > 0);
    }

    async function loadWeeklySchedule(doctorId) {
        weeklyView.hidden = false;
        weeklyContent.hidden = true;
        page.querySelector("[data-weekly-empty]").hidden = true;
        weeklyError.hidden = true;
        weeklyFeedback.hidden = false;
        weeklyFeedback.textContent = "Cargando disponibilidad de la semana…";
        try {
            const params = new URLSearchParams({ weekStart: weekInput.value });
            const response = await fetch(
                `${page.dataset.weeklyEndpoint}/${doctorId}/week?${params}`,
                {
                    headers: { Accept: "application/json" },
                },
            );
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.message || "No pudimos cargar la semana del médico.");
            renderWorkingInformation(data);
            weeklyContent.hidden = false;
            weeklyFeedback.hidden = true;
        } catch (error) {
            weeklyFeedback.hidden = true;
            weeklyError.textContent =
                error.message || "Ocurrió un error al cargar la semana del médico.";
            weeklyError.hidden = false;
        }
    }

    function renderException(exception) {
        const isUnavailable = exception.type === "Unavailable";
        const typeLabel = isUnavailable ? "No disponible" : "Disponibilidad adicional";
        const startDate = formatDate(exception.startAt, {
            day: "numeric",
            month: "long",
            year: "numeric",
        });
        const endDate = formatDate(exception.endAt, {
            day: "numeric",
            month: "long",
            year: "numeric",
        });
        const dateLabel = startDate === endDate ? startDate : `${startDate} – ${endDate}`;
        const reason = exception.reason || typeLabel;
        return `<li class="schedule-exception${isUnavailable ? " is-unavailable" : ""}">
            <span class="schedule-exception-icon" aria-hidden="true">${isUnavailable ? "!" : "◷"}</span>
            <div><h3>${escapeAttribute(reason)}</h3><p>${escapeAttribute(exception.doctorName)} · ${escapeAttribute(typeLabel)}</p><p class="schedule-exception-date">${escapeAttribute(dateLabel)}</p></div>
        </li>`;
    }

    function formatExceptionRange(startAt, endAt) {
        const localStart =
            typeof startAt === "string" && startAt.includes("T")
                ? startAt
                : new Intl.DateTimeFormat("sv-SE", {
                      timeZone: "America/Bogota",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hourCycle: "h23",
                  })
                      .format(new Date(startAt))
                      .replace(" ", "T");
        const localEnd =
            typeof endAt === "string" && endAt.includes("T")
                ? endAt
                : new Intl.DateTimeFormat("sv-SE", {
                      timeZone: "America/Bogota",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hourCycle: "h23",
                  })
                      .format(new Date(endAt))
                      .replace(" ", "T");
        const startDate = new Date(`${localStart}:00-05:00`);
        const endDate = new Date(`${localEnd}:00-05:00`);
        const startLabel = `${formatDate(startDate, { day: "numeric", month: "short", year: "numeric" })} · ${formatTime(localStart.slice(11, 16))}`;
        const endLabel = `${formatDate(endDate, { day: "numeric", month: "short", year: "numeric" })} · ${formatTime(localEnd.slice(11, 16))}`;
        return `${startLabel} – ${endLabel}`;
    }

    function renderManagedExceptions() {
        exceptionList.replaceChildren();
        for (const exception of managedExceptions) {
            const item = document.createElement("li");
            item.className = "schedule-exception-manage-item";
            const details = document.createElement("div");
            const title = document.createElement("h3");
            const typeLabel =
                exception.type === "Unavailable" ? "No disponible" : "Disponibilidad adicional";
            title.textContent = exception.reason;
            const doctor = document.createElement("p");
            doctor.textContent = `${exception.doctorName} · ${typeLabel}`;
            const range = document.createElement("p");
            range.textContent = formatExceptionRange(exception.startAtLocal, exception.endAtLocal);
            const status = document.createElement("p");
            status.textContent = exception.isActive ? "Activa" : "Inactiva";
            details.append(title, doctor, range, status);

            const actions = document.createElement("div");
            actions.className = "schedule-exception-manage-actions";
            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.dataset.editException = exception.id;
            editButton.textContent = "Editar";
            const statusButton = document.createElement("button");
            statusButton.type = "button";
            statusButton.dataset.toggleException = exception.id;
            statusButton.dataset.nextActive = String(!exception.isActive);
            statusButton.textContent = exception.isActive ? "Desactivar" : "Reactivar";
            if (exception.isActive) statusButton.classList.add("is-danger");
            actions.append(editButton, statusButton);
            item.append(details, actions);
            exceptionList.append(item);
        }
        exceptionEmpty.hidden = managedExceptions.length > 0;
    }

    function setExceptionManagerMode(mode) {
        const showForm = mode === "form";
        exceptionForm.hidden = !showForm;
        exceptionList.hidden = showForm;
        exceptionEmpty.hidden = showForm || managedExceptions.length > 0;
        exceptionToolbar.hidden = showForm;
        exceptionManager.querySelector("[data-exception-loading]").hidden = true;
        exceptionImpact.hidden = true;
        exceptionImpactList.replaceChildren();
        pendingExceptionStatusRequest = null;
    }

    function showExceptionError(message) {
        exceptionError.textContent = message;
        exceptionError.hidden = false;
        exceptionError.focus();
    }

    async function loadExceptionManager() {
        exceptionError.hidden = true;
        exceptionFeedback.hidden = true;
        exceptionList.hidden = false;
        exceptionEmpty.hidden = true;
        exceptionLoading.hidden = false;
        exceptionToolbar.hidden = false;
        exceptionForm.hidden = true;
        exceptionImpact.hidden = true;
        try {
            const params = new URLSearchParams({ status: exceptionStatus.value });
            const response = await fetch(`${exceptionsEndpoint}?${params.toString()}`, {
                headers: { Accept: "application/json" },
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No pudimos cargar las excepciones.");
            managedExceptions = data.exceptions || [];
            exceptionDoctors = data.doctors || [];
            renderManagedExceptions();
            renderSelectOptions(
                exceptionDoctor,
                exceptionDoctors,
                "Selecciona un médico activo",
                (doctor) => doctor.name,
            );
            exceptionEmpty.hidden = managedExceptions.length > 0;
        } catch (error) {
            exceptionList.replaceChildren();
            exceptionEmpty.hidden = true;
            showExceptionError(error.message || "No pudimos cargar las excepciones.");
        } finally {
            exceptionLoading.hidden = true;
        }
    }

    function openExceptionForm(exception = null) {
        exceptionError.hidden = true;
        exceptionFeedback.hidden = true;
        exceptionForm.reset();
        exceptionForm.dataset.mode = exception ? "edit" : "create";
        exceptionForm.querySelector("[data-exception-id]").value = exception?.id || "";
        exceptionSubmit.dataset.confirmImpact = "false";
        exceptionSubmit.textContent = exception ? "Guardar cambios" : "Guardar excepción";
        if (exception) {
            exceptionDoctor.value = String(exception.doctorId);
            exceptionType.value = exception.type;
            exceptionStart.value = exception.startAtLocal;
            exceptionEnd.value = exception.endAtLocal;
            exceptionReason.value = exception.reason;
        }
        setExceptionManagerMode("form");
        exceptionForm.hidden = false;
        exceptionList.hidden = true;
        exceptionToolbar.hidden = true;
        exceptionSubmit.focus();
    }

    function renderExceptionImpacts(appointments) {
        exceptionImpactList.replaceChildren();
        for (const appointment of appointments) {
            const item = document.createElement("li");
            item.textContent = `Cita #${appointment.id} · ${formatExceptionRange(appointment.startAtLocal, appointment.endAtLocal)}`;
            exceptionImpactList.append(item);
        }
        exceptionImpact.hidden = false;
        exceptionImpactConfirm.focus();
    }

    function collectExceptionForm() {
        return {
            doctorId: exceptionDoctor.value,
            type: exceptionType.value,
            startAt: exceptionStart.value,
            endAt: exceptionEnd.value,
            reason: exceptionReason.value,
            confirmImpact: exceptionSubmit.dataset.confirmImpact === "true",
        };
    }

    async function submitExceptionForm(event) {
        event.preventDefault();
        exceptionError.hidden = true;
        exceptionFeedback.hidden = true;
        const isEditing = exceptionForm.dataset.mode === "edit";
        const exceptionId = exceptionForm.querySelector("[data-exception-id]").value;
        const method = isEditing ? "PATCH" : "POST";
        const url = isEditing ? `${exceptionsEndpoint}/${exceptionId}` : exceptionsEndpoint;
        exceptionSubmit.disabled = true;
        try {
            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(collectExceptionForm()),
            });
            const data = await response.json();
            if (response.status === 409 && data.requiresConfirmation) {
                exceptionSubmit.dataset.confirmImpact = "true";
                exceptionSubmit.textContent = "Confirmar y guardar sin modificar las citas";
                renderExceptionImpacts(data.affectedAppointments || []);
                return;
            }
            if (!response.ok) throw new Error(data.message || "No pudimos guardar la excepción.");
            exceptionForm.hidden = true;
            exceptionList.hidden = false;
            exceptionToolbar.hidden = false;
            exceptionImpact.hidden = true;
            await loadExceptionManager();
            await loadSchedules();
            exceptionFeedback.textContent = data.affectedAppointmentsReviewed
                ? `${data.message} ${data.affectedAppointmentsReviewed} citas confirmadas quedaron sin cambios y requieren revisión.`
                : data.message;
            exceptionFeedback.hidden = false;
        } catch (error) {
            showExceptionError(error.message || "No pudimos guardar la excepción.");
        } finally {
            exceptionSubmit.disabled = false;
            if (exceptionSubmit.dataset.confirmImpact !== "true") {
                exceptionSubmit.textContent = isEditing ? "Guardar cambios" : "Guardar excepción";
            }
        }
    }

    async function submitExceptionStatus(request) {
        const response = await fetch(request.url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(request.body),
        });
        const data = await response.json();
        if (response.status === 409 && data.requiresConfirmation) {
            pendingExceptionStatusRequest = {
                ...request,
                body: { ...request.body, confirmImpact: true },
            };
            renderExceptionImpacts(data.affectedAppointments || []);
            return;
        }
        if (!response.ok) throw new Error(data.message || "No pudimos actualizar el estado.");
        pendingExceptionStatusRequest = null;
        exceptionImpact.hidden = true;
        await loadExceptionManager();
        await loadSchedules();
        exceptionFeedback.textContent = data.affectedAppointmentsReviewed
            ? `${data.message} ${data.affectedAppointmentsReviewed} citas confirmadas quedaron sin cambios y requieren revisión.`
            : data.message;
        exceptionFeedback.hidden = false;
    }

    function renderWeekLabel(week) {
        const start = new Date(`${week.start}T12:00:00-05:00`);
        const end = new Date(`${week.end}T12:00:00-05:00`);
        const label = `${formatDate(start, { day: "numeric", month: "short" })} – ${formatDate(end, { day: "numeric", month: "short", year: "numeric" })}`;
        page.querySelector("[data-schedule-week-label]").textContent = label;
        weekInput.value = week.start;
    }

    async function loadSchedules() {
        feedback.hidden = false;
        feedback.textContent = "Cargando horarios…";
        errorMessage.hidden = true;
        emptyMessage.hidden = true;
        doctorList.replaceChildren();

        const params = new URLSearchParams({
            search: searchInput.value.trim(),
            doctorId: doctorSelect.value,
            specialtyId: specialtySelect.value,
            status: statusSelect.value,
            weekStart: weekInput.value,
        });

        try {
            const response = await fetch(`${endpoint}?${params.toString()}`, {
                headers: { Accept: "application/json" },
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No pudimos cargar los horarios.");

            setText("[data-stat-active-doctors]", data.summary.activeDoctors);
            setText("[data-stat-configured]", data.summary.configuredSchedules);
            setText("[data-stat-exceptions]", data.summary.upcomingExceptions);
            setText("[data-stat-affected]", data.summary.affectedAppointments);
            renderWeekLabel(data.week);
            updateConfigurationOptions(data.doctorOptions);
            renderSelectOptions(
                specialtySelect,
                data.specialtyOptions,
                "Todas las especialidades",
                (specialty) => specialty.name,
            );

            doctorList.innerHTML = data.doctors.map(renderDoctor).join("");
            doctorList.hidden = Boolean(doctorSelect.value);
            weeklyView.hidden = !doctorSelect.value;
            exceptionsList.innerHTML = data.exceptions.map(renderException).join("");
            exceptionsEmpty.hidden = data.exceptions.length > 0;
            feedback.hidden = true;
            emptyMessage.hidden = Boolean(doctorSelect.value) || data.doctors.length > 0;
            doctorList.querySelectorAll("[data-view-week]").forEach((button) => {
                button.addEventListener("click", () => {
                    doctorSelect.value = button.dataset.viewWeek;
                    loadSchedules();
                });
            });
            if (doctorSelect.value) await loadWeeklySchedule(doctorSelect.value);
        } catch (error) {
            feedback.hidden = true;
            errorMessage.textContent = error.message || "Ocurrió un error al cargar los horarios.";
            errorMessage.hidden = false;
            exceptionsList.replaceChildren();
            exceptionsEmpty.hidden = false;
        }
    }

    page.addEventListener("click", (event) => {
        const button = event.target.closest("[data-edit-schedule]");
        if (!button || !page.contains(button)) return;
        openScheduleEditor({
            id: button.dataset.editSchedule,
            doctorId: button.dataset.doctorId,
            dayOfWeek: Number(button.dataset.dayOfWeek),
            startTime: button.dataset.startTime,
            endTime: button.dataset.endTime,
            validFrom: button.dataset.validFrom,
            validUntil: button.dataset.validUntil,
        });
    });
    page.addEventListener("keydown", (event) => {
        if (!event.target.matches("[data-edit-schedule][role='button']")) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.target.click();
    });

    function moveWeek(amount) {
        if (!weekInput.value) return;
        const date = new Date(`${weekInput.value}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + amount * 7);
        weekInput.value = date.toISOString().slice(0, 10);
        loadSchedules();
    }

    filterForm.addEventListener("submit", (event) => {
        event.preventDefault();
        loadSchedules();
    });
    page.querySelector("[data-week-previous]").addEventListener("click", () => moveWeek(-1));
    page.querySelector("[data-week-next]").addEventListener("click", () => moveWeek(1));
    doctorSelect.addEventListener("change", () => loadSchedules());
    page.querySelector("[data-weekly-clear]").addEventListener("click", () => {
        doctorSelect.value = "";
        loadSchedules();
    });
    weekInput.addEventListener("change", () => {
        if (!weekInput.value) return;
        const selectedDate = new Date(`${weekInput.value}T00:00:00Z`);
        const dayOfWeek = selectedDate.getUTCDay() || 7;
        selectedDate.setUTCDate(selectedDate.getUTCDate() - dayOfWeek + 1);
        weekInput.value = selectedDate.toISOString().slice(0, 10);
    });
    topbarForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        searchInput.value = topbarSearch.value;
        loadSchedules();
    });
    topbarSearch?.addEventListener("input", () => {
        searchInput.value = topbarSearch.value;
    });

    configureOpenButton?.addEventListener("click", () => {
        openConfigurationDialog("create");
    });

    page.querySelector("[data-exceptions-open]")?.addEventListener("click", () => {
        exceptionError.hidden = true;
        exceptionFeedback.hidden = true;
        exceptionManager.querySelector("[data-exception-loading]").hidden = false;
        exceptionDialog.showModal();
        loadExceptionManager();
    });
    exceptionDialog?.querySelector("[data-exception-close]")?.addEventListener("click", () => {
        exceptionDialog.close();
    });
    exceptionDialog?.querySelector("[data-exception-create]")?.addEventListener("click", () => {
        openExceptionForm();
    });
    exceptionDialog?.querySelector("[data-exception-back]")?.addEventListener("click", () => {
        exceptionError.hidden = true;
        exceptionImpact.hidden = true;
        exceptionSubmit.dataset.confirmImpact = "false";
        exceptionList.hidden = false;
        exceptionForm.hidden = true;
        exceptionToolbar.hidden = false;
    });
    exceptionStatus?.addEventListener("change", loadExceptionManager);
    exceptionForm?.addEventListener("submit", submitExceptionForm);
    exceptionList?.addEventListener("click", async (event) => {
        const editButton = event.target.closest("[data-edit-exception]");
        if (editButton) {
            const exception = managedExceptions.find(
                (item) => String(item.id) === editButton.dataset.editException,
            );
            if (exception) openExceptionForm(exception);
            return;
        }

        const statusButton = event.target.closest("[data-toggle-exception]");
        if (!statusButton) return;
        statusButton.disabled = true;
        exceptionError.hidden = true;
        exceptionFeedback.hidden = true;
        const isActive = statusButton.dataset.nextActive === "true";
        try {
            await submitExceptionStatus({
                url: `${exceptionsEndpoint}/${statusButton.dataset.toggleException}/status`,
                body: { isActive, confirmImpact: false },
            });
        } catch (error) {
            showExceptionError(error.message || "No pudimos actualizar el estado de la excepción.");
        } finally {
            statusButton.disabled = false;
        }
    });
    exceptionImpactConfirm?.addEventListener("click", async () => {
        exceptionImpactConfirm.disabled = true;
        try {
            if (pendingExceptionStatusRequest) {
                await submitExceptionStatus(pendingExceptionStatusRequest);
            } else if (!exceptionForm.hidden) {
                exceptionSubmit.dataset.confirmImpact = "true";
                exceptionImpact.hidden = true;
                exceptionForm.requestSubmit();
            }
        } catch (error) {
            showExceptionError(error.message || "No pudimos aplicar el cambio.");
        } finally {
            exceptionImpactConfirm.disabled = false;
        }
    });
    exceptionDialog
        ?.querySelector("[data-exception-impact-cancel]")
        ?.addEventListener("click", () => {
            pendingExceptionStatusRequest = null;
            exceptionImpact.hidden = true;
            exceptionSubmit.dataset.confirmImpact = "false";
            exceptionSubmit.textContent =
                exceptionForm.dataset.mode === "edit" ? "Guardar cambios" : "Guardar excepción";
        });

    configureDialog?.querySelectorAll("[data-config-close]").forEach((button) => {
        button.addEventListener("click", () => configureDialog.close());
    });
    configureForm?.addEventListener("submit", submitConfiguration);
    configureDeleteButton?.addEventListener("click", async () => {
        if (!window.confirm("¿Quieres eliminar este intervalo de atención?")) return;
        configureForm.dataset.mode = "delete";
        configureSubmitButton.click();
    });
    configureForm?.querySelectorAll("[data-day-enabled]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            setEnabledDay(checkbox.closest("[data-config-day]"), checkbox.checked);
        });
    });
    configureForm?.querySelectorAll("[data-add-interval]").forEach((button) => {
        button.addEventListener("click", () => {
            const dayElement = button.closest("[data-config-day]");
            const intervalList = dayElement.querySelector("[data-config-intervals]");
            const newInterval = intervalList
                .querySelector("[data-config-interval]")
                .cloneNode(true);
            newInterval.querySelectorAll("input").forEach((input) => {
                input.value = "";
                input.disabled = false;
                input.required = true;
            });
            const removeButton = newInterval.querySelector("[data-remove-interval]");
            removeButton.hidden = false;
            removeButton.addEventListener("click", () => {
                newInterval.remove();
                updateIntervalRemoveButtons(dayElement);
            });
            intervalList.append(newInterval);
            updateIntervalRemoveButtons(dayElement);
            newInterval.querySelector("[data-interval-start]").focus();
        });
    });

    loadSchedules();
})();
