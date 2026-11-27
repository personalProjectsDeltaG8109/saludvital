(() => {
    const page = document.querySelector("[data-doctor-schedules]");
    if (!page) return;

    const adminApp = document.querySelector(".admin-app");
    const adminSidebar = document.querySelector("[data-admin-sidebar]");
    const adminMenuButton = document.querySelector("[data-admin-open]");

    function closeAdminSidebar() {
        adminApp?.classList.remove("is-sidebar-open");
        adminMenuButton?.setAttribute("aria-expanded", "false");
    }

    adminMenuButton?.addEventListener("click", () => {
        adminApp?.classList.add("is-sidebar-open");
        adminMenuButton.setAttribute("aria-expanded", "true");
        adminSidebar?.querySelector('a[href="/admin/doctor-schedules"]')?.focus();
    });
    document.querySelectorAll("[data-admin-close]").forEach((button) => {
        button.addEventListener("click", closeAdminSidebar);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeAdminSidebar();
    });

    const endpoint = page.dataset.endpoint;
    const exceptionsEndpoint = page.dataset.exceptionsEndpoint;
    const filterForm = page.querySelector("[data-schedule-filters]");
    const searchInput = page.querySelector("[data-schedule-search]");
    const doctorSelect = page.querySelector("[data-schedule-doctor]");
    const specialtySelect = page.querySelector("[data-schedule-specialty]");
    const statusSelect = page.querySelector("[data-schedule-status]");
    const weekInput = page.querySelector("[data-schedule-week]");
    const periodButtons = [...page.querySelectorAll("[data-calendar-period]")];
    const configureOpenButton = page.querySelector("[data-configure-open]");
    const configureDialog = document.querySelector("[data-schedule-config-dialog]");
    const configureForm = document.querySelector("[data-schedule-config-form]");
    const quickShiftButtons = configureForm
        ? [...configureForm.querySelectorAll("[data-config-shift]")]
        : [];
    const configureDoctorSelect = document.querySelector("[data-config-doctor]");
    const configureError = document.querySelector("[data-config-error]");
    const configureSuccess = document.querySelector("[data-config-success]");
    const configureImpact = document.querySelector("[data-config-impact]");
    const configureImpactList = document.querySelector("[data-config-impact-list]");
    const configureSubmitButton = document.querySelector("[data-config-submit]");
    const configureDeleteButton = document.querySelector("[data-config-delete]");
    const exceptionDialog = document.querySelector("[data-exception-manager-dialog]");
    // The dialog is a sibling of the page so the browser can center it in the viewport.
    const appointmentDialog = document.querySelector("[data-appointment-details-dialog]");
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
    const exceptionImpactMessage = exceptionImpact?.querySelector("p");
    const exceptionManager = document.querySelector("[data-exception-manager]");
    const exceptionToolbar = document.querySelector(".schedule-exception-toolbar");
    let lastAppointmentTrigger = null;
    let managedExceptions = [];
    let exceptionDoctors = [];
    let pendingExceptionStatusRequest = null;
    let scheduleRequestId = 0;
    let weeklyRequestId = 0;
    let selectedDoctorId = null;
    let isDoctorScheduleDismissed = false;
    let periodMode = "week";
    let selectedQuickShift = null;
    let searchDebounceTimer = null;
    const configPageFeedback = page.querySelector("[data-config-page-feedback]");
    const feedback = page.querySelector("[data-schedule-feedback]");
    const errorMessage = page.querySelector("[data-schedule-error]");
    const doctorList = page.querySelector("[data-schedule-doctor-list]");
    const weeklyGrid = page.querySelector("[data-weekly-grid]");
    const emptyMessage = page.querySelector("[data-schedule-empty]");
    const weeklyView = page.querySelector("[data-weekly-view]");
    const weeklyContent = page.querySelector("[data-weekly-content]");
    const weeklyFeedback = page.querySelector("[data-weekly-feedback]");
    const weeklyError = page.querySelector("[data-weekly-error]");
    const exceptionsList = page.querySelector("[data-schedule-exceptions]");
    const exceptionsEmpty = page.querySelector("[data-schedule-exceptions-empty]");
    const weekdayShortNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const quickShiftPresets = {
        morning: {
            label: "Mañana",
            intervals: [{ startTime: "07:00", endTime: "12:00" }],
        },
        afternoon: {
            label: "Tarde",
            intervals: [{ startTime: "13:00", endTime: "17:00" }],
        },
        fullDay: {
            label: "Jornada completa",
            intervals: [
                { startTime: "07:00", endTime: "12:00" },
                { startTime: "13:00", endTime: "17:00" },
            ],
        },
    };

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

    function getMondayForDate(dateValue) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue || "")) return "";
        const date = new Date(`${dateValue}T00:00:00Z`);
        const weekday = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() - weekday + 1);
        return date.toISOString().slice(0, 10);
    }

    function getSelectedWeekStart() {
        return getMondayForDate(weekInput.value);
    }

    function getDateForWeekday(dayIndex) {
        const monday = new Date(`${getSelectedWeekStart()}T00:00:00Z`);
        monday.setUTCDate(monday.getUTCDate() + dayIndex);
        return monday.toISOString().slice(0, 10);
    }

    function getCalendarWeekStartsForMonth(dateValue) {
        const [year, month] = dateValue.split("-").map(Number);
        const firstDay = new Date(Date.UTC(year, month - 1, 1));
        const lastDay = new Date(Date.UTC(year, month, 0));
        const firstMonday = new Date(
            `${getMondayForDate(firstDay.toISOString().slice(0, 10))}T00:00:00Z`,
        );
        const weeks = [];
        while (firstMonday <= lastDay) {
            weeks.push(firstMonday.toISOString().slice(0, 10));
            firstMonday.setUTCDate(firstMonday.getUTCDate() + 7);
        }
        return weeks;
    }

    function getMonthTitle(dateValue) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue || "")) return "Mes seleccionado";
        const title = new Intl.DateTimeFormat("es-CO", {
            month: "long",
            year: "numeric",
            timeZone: "America/Bogota",
        }).format(new Date(`${dateValue}T12:00:00-05:00`));
        return title.charAt(0).toLocaleUpperCase("es-CO") + title.slice(1);
    }

    function getDateLabel(dateValue, options = { dateStyle: "full" }) {
        return new Intl.DateTimeFormat("es-CO", {
            ...options,
            timeZone: "America/Bogota",
        }).format(new Date(`${dateValue}T12:00:00-05:00`));
    }

    function normalizeDateForPeriod(dateValue) {
        if (periodMode === "day") return dateValue;
        if (periodMode === "month") return `${dateValue.slice(0, 7)}-01`;
        return getMondayForDate(dateValue);
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
        selectedQuickShift = null;
        updateQuickShiftSelection(null);
        updateQuickShiftHint("Selecciona una jornada y luego marca los días que quieras.");
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
            delete dayElement.dataset.quickShift;
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

        updateAvailableWeekdays();

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
                    doctorId: selectedDoctorId || doctorSelect.value,
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

    function updateQuickShiftSelection(shiftName) {
        quickShiftButtons.forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.configShift === shiftName));
        });
    }

    function updateQuickShiftHint(message) {
        const hint = configureForm?.querySelector("[data-config-shift-hint]");
        if (hint) hint.textContent = message;
    }

    function hasEnteredIntervals(dayElement) {
        return [...dayElement.querySelectorAll("[data-config-interval]")].some((interval) => {
            return Boolean(
                interval.querySelector("[data-interval-start]").value ||
                interval.querySelector("[data-interval-end]").value,
            );
        });
    }

    function createIntervalRow(dayElement) {
        const intervalList = dayElement.querySelector("[data-config-intervals]");
        const intervalTemplate = intervalList.querySelector("[data-config-interval]");
        const newInterval = intervalTemplate.cloneNode(true);
        newInterval.querySelectorAll("input").forEach((input) => {
            input.value = "";
            input.disabled = false;
            input.required = true;
        });
        newInterval.querySelector("[data-remove-interval]").hidden = false;
        intervalList.append(newInterval);
        return newInterval;
    }

    function fillDayWithQuickShift(dayElement, shiftName) {
        const preset = quickShiftPresets[shiftName];
        if (!preset) return;

        const intervalList = dayElement.querySelector("[data-config-intervals]");
        const rows = [...intervalList.querySelectorAll("[data-config-interval]")];
        rows.slice(1).forEach((row) => row.remove());

        const intervals = [
            rows[0],
            ...preset.intervals.slice(1).map(() => createIntervalRow(dayElement)),
        ];
        intervals.forEach((row, index) => {
            row.querySelector("[data-interval-start]").value = preset.intervals[index].startTime;
            row.querySelector("[data-interval-end]").value = preset.intervals[index].endTime;
        });
        dayElement.dataset.quickShift = shiftName;
        updateIntervalRemoveButtons(dayElement);
    }

    function applyQuickShiftToDays(shiftName, dayElements) {
        const preset = quickShiftPresets[shiftName];
        if (!preset) return false;

        const daysWithManualHours = dayElements.filter((dayElement) => {
            return hasEnteredIntervals(dayElement) && !dayElement.dataset.quickShift;
        });
        if (
            daysWithManualHours.length > 0 &&
            !window.confirm(
                "La jornada reemplazará las horas que ya escribiste en los días seleccionados. ¿Deseas continuar?",
            )
        ) {
            return false;
        }

        selectedQuickShift = shiftName;
        updateQuickShiftSelection(shiftName);
        dayElements.forEach((dayElement) => fillDayWithQuickShift(dayElement, shiftName));

        if (dayElements.length === 0) {
            updateQuickShiftHint(
                `Jornada ${preset.label} seleccionada. Al marcar un día disponible, se cargarán sus horarios.`,
            );
            return true;
        }

        const dayNames = dayElements.map((dayElement) => {
            return dayElement
                .querySelector("[data-day-enabled]")
                .nextElementSibling.textContent.trim();
        });
        updateQuickShiftHint(
            `Jornada ${preset.label} aplicada a ${dayNames.join(", ")}. Puedes ajustar las horas antes de guardar.`,
        );
        return true;
    }

    function getAvailableWeekdays(validFrom, validUntil) {
        if (!validFrom) return new Set();

        const startDate = new Date(`${validFrom}T00:00:00.000Z`);
        const endDate = validUntil ? new Date(`${validUntil}T00:00:00.000Z`) : null;
        if (Number.isNaN(startDate.getTime()) || (endDate && Number.isNaN(endDate.getTime()))) {
            return new Set();
        }
        if (!endDate) return new Set([1, 2, 3, 4, 5, 6, 7]);
        if (endDate < startDate) return new Set();

        const availableWeekdays = new Set();
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            availableWeekdays.add(currentDate.getUTCDay() || 7);
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }
        return availableWeekdays;
    }

    function updateAvailableWeekdays() {
        const validFromInput = configureForm.querySelector("[data-config-valid-from]");
        const validUntilInput = configureForm.querySelector("[data-config-valid-until]");
        const validFrom = validFromInput.value;
        const validUntil = validUntilInput.value;
        const availableWeekdays = getAvailableWeekdays(validFrom, validUntil);
        const hint = configureForm.querySelector("[data-config-weekday-hint]");

        validUntilInput.min = validFrom || "";
        configureForm.querySelectorAll("[data-config-day]").forEach((dayElement) => {
            const dayCheckbox = dayElement.querySelector("[data-day-enabled]");
            const isAvailable = availableWeekdays.has(Number(dayElement.dataset.configDay));
            dayCheckbox.disabled = !isAvailable;
            if (!isAvailable) dayCheckbox.checked = false;
            dayElement.classList.toggle("is-outside-validity", !isAvailable);
            setEnabledDay(dayElement, isAvailable && dayCheckbox.checked);
        });

        if (!hint) return;

        if (!validFrom) {
            hint.textContent = "Selecciona la fecha de inicio para habilitar los días.";
        } else if (validUntil && validUntil < validFrom) {
            hint.textContent = "La fecha final debe ser igual o posterior a la fecha inicial.";
        } else if (validUntil) {
            const availableNames = [...configureForm.querySelectorAll("[data-config-day]")]
                .filter((dayElement) => availableWeekdays.has(Number(dayElement.dataset.configDay)))
                .map((dayElement) =>
                    dayElement
                        .querySelector("[data-day-enabled]")
                        .nextElementSibling.textContent.trim(),
                );
            hint.textContent = `Días disponibles para este periodo: ${availableNames.join(", ")}.`;
        } else {
            hint.textContent = "Sin fecha final, puedes seleccionar cualquier día de la semana.";
        }
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
        const specialty = doctor.specialty?.name || "Sin especialidad asignada";
        const stateLabel = doctor.isActive ? "Activo" : "Cuenta inactiva";
        const stateClass = doctor.isActive ? "" : " is-inactive";
        const isSelected = String(doctor.id) === String(selectedDoctorId);
        const selectedClass = isSelected ? " is-selected" : "";
        const expanded = isSelected ? "true" : "false";

        return `<article class="schedule-doctor-card${selectedClass}" data-doctor-card="${doctor.id}">
            <header class="schedule-doctor-heading">
                <button class="schedule-doctor-select" type="button" data-view-week="${doctor.id}" data-doctor-name="${escapeAttribute(doctor.name)}" aria-expanded="${expanded}" aria-label="${isSelected ? "Ocultar" : "Ver"} horario de ${escapeAttribute(doctor.name)}">
                    <span class="schedule-doctor-avatar">${avatar}</span>
                    <span class="schedule-doctor-identity"><strong>${escapeAttribute(doctor.name)}</strong><span>${escapeAttribute(specialty)}</span></span>
                </button>
                <span class="schedule-doctor-state${stateClass}">${stateLabel}</span>
            </header>
        </article>`;
    }

    function updateDoctorCardSelection() {
        doctorList.querySelectorAll("[data-doctor-card]").forEach((card) => {
            const isSelected = card.dataset.doctorCard === String(selectedDoctorId);
            card.classList.toggle("is-selected", isSelected);
            const button = card.querySelector("[data-view-week]");
            button?.setAttribute("aria-expanded", String(isSelected));
            button?.setAttribute(
                "aria-label",
                `${isSelected ? "Ocultar" : "Ver"} horario de ${button.dataset.doctorName}`,
            );
        });
    }

    function hideSelectedDoctorSchedule() {
        selectedDoctorId = null;
        isDoctorScheduleDismissed = true;
        weeklyRequestId += 1;
        weeklyView.hidden = true;
        weeklyContent.hidden = true;
        weeklyFeedback.hidden = true;
        weeklyError.hidden = true;
        updateDoctorCardSelection();
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

    function getPatientInitials(patientName) {
        return String(patientName || "Paciente")
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0))
            .join("")
            .toLocaleUpperCase("es-CO");
    }

    function getAppointmentAttributes(event, date, doctor, timeLabel) {
        const patientName = event.patientName || "Paciente";
        return ` type="button" data-appointment-open data-patient-name="${escapeAttribute(patientName)}" data-patient-initials="${escapeAttribute(getPatientInitials(patientName))}" data-appointment-date="${escapeAttribute(date)}" data-appointment-start="${escapeAttribute(event.startTime)}" data-appointment-end="${escapeAttribute(event.endTime)}" data-appointment-specialty="${escapeAttribute(doctor.specialty || "Sin especialidad asignada")}" data-appointment-doctor="${escapeAttribute(doctor.name)}" data-appointment-status="${escapeAttribute(event.statusLabel || "Sin estado")}" aria-label="Ver detalles de la cita de ${escapeAttribute(patientName)}, ${escapeAttribute(timeLabel)}"`;
    }

    function renderTimelineEvent(event, date, doctor, rangeStart, pixelsPerMinute) {
        const isAppointment = event.type === "appointment";
        const top = Math.max(0, (minuteOfDay(event.startTime) - rangeStart) * pixelsPerMinute);
        const duration = Math.max(
            isAppointment ? 28 : 20,
            (minuteOfDay(event.endTime) - minuteOfDay(event.startTime)) * pixelsPerMinute,
        );
        const label = isAppointment
            ? event.patientName || "Cita agendada"
            : event.type === "blocked"
              ? `${event.label}${event.reason ? ` · ${event.reason}` : ""}`
              : event.label;
        const timeLabel =
            event.startTime === "00:00" && event.endTime === "24:00"
                ? "Todo el día"
                : `${formatTime(event.startTime)}–${formatTime(event.endTime)}`;
        const className = `weekly-event is-${event.type}`;
        const lane = Math.min(event.lane, 2);
        const isWideEvent = [
            "available",
            "additionalAvailability",
            "blocked",
            "appointment",
        ].includes(event.type);
        const laneStyle = isWideEvent
            ? "left: 3%; width: 94%;"
            : `left: ${3 + lane * 31}%; width: 29%;`;
        const isEditable = event.type === "available" && event.scheduleId;
        const attributes = isAppointment
            ? getAppointmentAttributes(event, date, doctor, timeLabel)
            : isEditable
              ? ` role="button" tabindex="0" data-edit-schedule="${event.scheduleId}" data-doctor-id="${event.doctorId}" data-day-of-week="${event.dayOfWeek}" data-start-time="${escapeAttribute(event.startTime)}" data-end-time="${escapeAttribute(event.endTime)}" data-valid-from="${escapeAttribute(event.validFrom)}" data-valid-until="${escapeAttribute(event.validUntil || "")}" aria-label="Editar horario disponible de ${escapeAttribute(formatTime(event.startTime))} a ${escapeAttribute(formatTime(event.endTime))}" title="Editar horario"`
              : ` aria-label="${escapeAttribute(label)}, ${formatTime(event.startTime)} a ${formatTime(event.endTime)}"`;
        const tagName = isAppointment ? "button" : "div";
        const contents = isAppointment
            ? `<strong>${escapeAttribute(event.patientDisplayName || event.patientName || "Paciente")}</strong><small class="weekly-event-time">${escapeAttribute(timeLabel)}</small>`
            : `<strong>${escapeAttribute(event.label)}</strong><span>${escapeAttribute(event.reason || `${formatTime(event.startTime)}–${formatTime(event.endTime)}`)}</span><small class="weekly-event-time">${escapeAttribute(timeLabel)}</small>`;
        return `<${tagName} class="${className}${isEditable ? " is-editable" : ""}" style="top:${top}px;height:${duration}px;${laneStyle}"${attributes}>${contents}</${tagName}>`;
    }

    function getVisibleScheduleDays(data, mode, dateValue) {
        return mode === "day" ? data.days.filter((day) => day.date === dateValue) : data.days;
    }

    function renderWeeklyGrid(data, days = data.days) {
        if (!days.length)
            return '<p class="weekly-mobile-empty">No hay datos disponibles para esta fecha.</p>';
        const allTimes = days.flatMap((day) =>
            day.events.flatMap((event) => [
                minuteOfDay(event.startTime),
                minuteOfDay(event.endTime),
            ]),
        );
        const rangeStart = Math.min(420, ...allTimes.map((time) => Math.floor(time / 60) * 60));
        const rangeEnd = Math.max(1140, ...allTimes.map((time) => Math.ceil(time / 60) * 60));
        const pixelsPerMinute = 0.9;
        const timelineHeight = (rangeEnd - rangeStart) * pixelsPerMinute;
        const hourLabels = [];
        for (let minute = rangeStart; minute <= rangeEnd; minute += 60) {
            const top = (minute - rangeStart) * pixelsPerMinute;
            hourLabels.push(
                `<span class="weekly-time-label" style="top:${top}px">${timeLabel(minute)}</span>`,
            );
        }

        const dayCountStyle = ` style="--schedule-day-count:${days.length}"`;
        const header = `<div class="weekly-grid-header"${dayCountStyle}><span>Hora</span>${days.map((day) => `<span><strong>${day.dayLabel.slice(0, 3)}</strong><small>${formatDayDate(day.date)}</small></span>`).join("")}</div>`;
        const axis = `<div class="weekly-time-axis" style="height:${timelineHeight}px">${hourLabels.join("")}</div>`;
        const columns = days
            .map((day) => {
                const availability = day.events
                    .filter((event) => ["available", "additionalAvailability"].includes(event.type))
                    .map((event) => ({ ...event, doctorId: data.doctor.id }));
                const timedEvents = assignEventLanes(
                    day.events.filter((event) => event.type !== "available"),
                );
                const items = [
                    ...availability.map((event) =>
                        renderTimelineEvent(
                            event,
                            day.date,
                            data.doctor,
                            rangeStart,
                            pixelsPerMinute,
                        ),
                    ),
                    ...timedEvents.map((event) =>
                        renderTimelineEvent(
                            event,
                            day.date,
                            data.doctor,
                            rangeStart,
                            pixelsPerMinute,
                        ),
                    ),
                ].join("");
                return `<section class="weekly-day-column"><h5>${day.dayLabel} · ${formatDayDate(day.date)}</h5><div class="weekly-day-timeline" style="height:${timelineHeight}px">${items}</div></section>`;
            })
            .join("");

        const mobileDays = days
            .map((day) => {
                const events = day.events
                    .map((event) => {
                        const isAppointment = event.type === "appointment";
                        const title = isAppointment
                            ? event.patientDisplayName || event.patientName || "Paciente"
                            : event.label;
                        const description = event.reason || title;
                        const timeRange =
                            event.startTime === "00:00" && event.endTime === "24:00"
                                ? "Todo el día"
                                : `${formatTime(event.startTime)}–${formatTime(event.endTime)}`;
                        if (isAppointment) {
                            const buttonAttributes = getAppointmentAttributes(
                                event,
                                day.date,
                                data.doctor,
                                timeRange,
                            );
                            return `<li class="weekly-mobile-event is-appointment"><button class="weekly-mobile-appointment"${buttonAttributes}><strong>${escapeAttribute(title)}</strong><small>${escapeAttribute(timeRange)}</small></button></li>`;
                        }
                        return `<li class="weekly-mobile-event is-${escapeAttribute(event.type)}"><strong>${escapeAttribute(title)}</strong><span>${escapeAttribute(description)}</span><small>${escapeAttribute(timeRange)}</small></li>`;
                    })
                    .join("");
                const content = events
                    ? `<ul class="weekly-mobile-events">${events}</ul>`
                    : '<p class="weekly-mobile-empty">Sin bloques, citas ni excepciones registradas.</p>';
                return `<section class="weekly-mobile-day"><h5>${escapeAttribute(day.dayLabel)} · ${formatDayDate(day.date)}</h5>${content}</section>`;
            })
            .join("");

        return `${header}<div class="weekly-grid-body"${dayCountStyle}>${axis}<div class="weekly-day-columns">${columns}</div></div><div class="weekly-mobile-grid">${mobileDays}</div>`;
    }

    function getCalendarDays(dateValue) {
        const [year, month] = dateValue.split("-").map(Number);
        const firstDay = new Date(Date.UTC(year, month - 1, 1));
        const lastDay = new Date(Date.UTC(year, month, 0));
        const firstMonday = new Date(
            `${getMondayForDate(firstDay.toISOString().slice(0, 10))}T00:00:00Z`,
        );
        const days = [];
        for (
            const date = new Date(firstMonday);
            date <= lastDay;
            date.setUTCDate(date.getUTCDate() + 1)
        ) {
            days.push(date.toISOString().slice(0, 10));
        }
        while (days.length % 7 !== 0) {
            const nextDate = new Date(`${days.at(-1)}T00:00:00Z`);
            nextDate.setUTCDate(nextDate.getUTCDate() + 1);
            days.push(nextDate.toISOString().slice(0, 10));
        }
        return days;
    }

    function renderMonthlyGrid(weekData, dateValue) {
        const eventsByDate = new Map();
        for (const week of weekData) {
            for (const day of week.days || []) eventsByDate.set(day.date, day.events || []);
        }
        const selectedMonth = dateValue.slice(0, 7);
        const weekdays = weekdayShortNames.map((day) => `<span>${day}</span>`).join("");
        const monthDays = getCalendarDays(dateValue)
            .map((date) => {
                const inMonth = date.startsWith(selectedMonth);
                const events = eventsByDate.get(date) || [];
                const appointmentCount = events.filter(
                    (event) => event.type === "appointment",
                ).length;
                const availableCount = events.filter((event) =>
                    ["available", "additionalAvailability"].includes(event.type),
                ).length;
                const blockedCount = events.filter((event) => event.type === "blocked").length;
                const summary = [
                    appointmentCount ? `${appointmentCount} citas` : "",
                    availableCount ? `${availableCount} horarios disponibles` : "",
                    blockedCount ? `${blockedCount} bloqueos` : "",
                ]
                    .filter(Boolean)
                    .join(", ");
                const dateDescription = `${getDateLabel(date)}${summary ? `: ${summary}` : ": sin actividad registrada"}`;
                const stateClass = date === dateValue ? " is-selected" : "";
                const outsideClass = inMonth ? "" : " is-outside-month";
                const indicators = [
                    availableCount
                        ? '<span class="schedule-month-indicator" aria-hidden="true"></span>'
                        : "",
                    appointmentCount
                        ? '<span class="schedule-month-indicator is-appointment" aria-hidden="true"></span>'
                        : "",
                    blockedCount
                        ? '<span class="schedule-month-indicator is-blocked" aria-hidden="true"></span>'
                        : "",
                ].join("");
                return `<button class="schedule-month-day${stateClass}${outsideClass}" type="button" data-month-day="${date}" aria-label="${escapeAttribute(dateDescription)}"${inMonth ? "" : " disabled"}><span class="schedule-month-day-number">${Number(date.slice(-2))}</span><span class="schedule-month-indicators">${indicators}</span><span class="schedule-month-day-count">${escapeAttribute(summary || "Sin actividad")}</span></button>`;
            })
            .join("");
        return `<div class="schedule-month-calendar" role="group" aria-label="Calendario de ${escapeAttribute(getMonthTitle(dateValue))}"><div class="schedule-month-weekdays" aria-hidden="true">${weekdays}</div><div class="schedule-month-days">${monthDays}</div></div>`;
    }

    function renderWorkingInformation(data, options = {}) {
        const { mode = "week", dateValue = data.week.start, monthData = [] } = options;
        const visibleDays = getVisibleScheduleDays(data, mode, dateValue);
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
                    `${day.dayLabel}: ${formatTime(interval.startTime)}-${formatTime(interval.endTime)}`,
            ),
        );
        setText(
            "[data-weekly-working-hours]",
            hours.length ? hours.join(" · ") : "Sin horario configurado",
        );
        let dateRangeLabel;
        if (mode === "day") {
            dateRangeLabel = getDateLabel(dateValue);
        } else if (mode === "month") {
            dateRangeLabel = getMonthTitle(dateValue);
        } else {
            const start = new Date(`${data.week.start}T12:00:00-05:00`);
            const end = new Date(`${data.week.end}T12:00:00-05:00`);
            dateRangeLabel = `${formatDate(start)} – ${formatDate(end, { day: "numeric", month: "short", year: "numeric" })}`;
        }
        setText("[data-weekly-date-range]", dateRangeLabel);
        page.querySelector("[data-weekly-grid]").innerHTML =
            mode === "month"
                ? renderMonthlyGrid(monthData, dateValue)
                : renderWeeklyGrid(data, visibleDays);
        const selectedWeekday = new Date(`${dateValue}T00:00:00Z`).getUTCDay() || 7;
        const editableBlocks =
            mode === "day"
                ? (data.availabilityBlocks || []).filter(
                      (block) => block.dayOfWeek === selectedWeekday,
                  )
                : data.availabilityBlocks || [];
        renderEditableScheduleBlocks(editableBlocks);
        const hasVisibleEvents =
            mode === "month"
                ? monthData.some((week) =>
                      week.days.some(
                          (day) =>
                              day.date.startsWith(dateValue.slice(0, 7)) && day.events.length > 0,
                      ),
                  )
                : visibleDays.some((day) => day.events.length > 0);
        const emptyMessage = page.querySelector("[data-weekly-empty]");
        emptyMessage.hidden = hasVisibleEvents;
        emptyMessage.textContent =
            mode === "day"
                ? "Este médico no tiene horarios ni actividad registrada para este día."
                : mode === "month"
                  ? "Este médico no tiene horarios ni actividad registrada para este mes."
                  : "Este médico no tiene horario configurado para la semana seleccionada.";
        page.querySelector(".weekly-view-layout")?.classList.toggle(
            "is-month-view",
            mode === "month",
        );
        const calendarCard = page.querySelector(".weekly-calendar-card");
        if (calendarCard) {
            calendarCard.setAttribute(
                "aria-label",
                mode === "day"
                    ? "Agenda del día del médico"
                    : mode === "month"
                      ? "Calendario mensual del médico"
                      : "Agenda semanal del médico",
            );
        }
    }

    async function fetchWeeklySchedule(doctorId, weekStart) {
        const params = new URLSearchParams({ weekStart });
        const response = await fetch(`${page.dataset.weeklyEndpoint}/${doctorId}/week?${params}`, {
            headers: { Accept: "application/json" },
        });
        const data = await response.json();
        if (!response.ok)
            throw new Error(data.message || "No pudimos cargar el horario del médico.");
        return data;
    }

    async function loadWeeklySchedule(doctorId) {
        const requestId = ++weeklyRequestId;
        weeklyView.hidden = false;
        weeklyContent.hidden = true;
        page.querySelector("[data-weekly-empty]").hidden = true;
        weeklyError.hidden = true;
        weeklyFeedback.hidden = false;
        weeklyFeedback.textContent =
            periodMode === "month"
                ? "Cargando el calendario del mes…"
                : periodMode === "day"
                  ? "Cargando disponibilidad del día…"
                  : "Cargando disponibilidad de la semana…";
        try {
            const weekStarts =
                periodMode === "month"
                    ? getCalendarWeekStartsForMonth(weekInput.value)
                    : [getSelectedWeekStart()];
            const weekData = await Promise.all(
                weekStarts.map((weekStart) => fetchWeeklySchedule(doctorId, weekStart)),
            );
            if (requestId !== weeklyRequestId) return;
            const selectedWeekStart = getSelectedWeekStart();
            const data =
                weekData.find((week) => week.week.start === selectedWeekStart) || weekData[0];
            renderWorkingInformation(data, {
                mode: periodMode,
                dateValue: weekInput.value,
                monthData: weekData,
            });
            weeklyContent.hidden = false;
            weeklyFeedback.hidden = true;
        } catch (error) {
            if (requestId !== weeklyRequestId) return;
            weeklyFeedback.hidden = true;
            weeklyError.textContent =
                error.message || "Ocurrió un error al cargar el horario del médico.";
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

    function formatExceptionFeedback(data) {
        const messages = [data.message, data.cancellationDetails];
        if (data.affectedAppointmentsReviewed) {
            messages.push(
                `${data.affectedAppointmentsReviewed} citas confirmadas quedaron sin cambios y requieren revisión.`,
            );
        }
        return messages.filter(Boolean).join(" ");
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

    function renderExceptionImpacts(appointments, willCancelAppointments = false) {
        exceptionImpactList.replaceChildren();
        for (const appointment of appointments) {
            const item = document.createElement("li");
            item.textContent = `Cita #${appointment.id} · ${formatExceptionRange(appointment.startAtLocal, appointment.endAtLocal)}`;
            exceptionImpactList.append(item);
        }
        if (exceptionImpactMessage) {
            exceptionImpactMessage.textContent = willCancelAppointments
                ? "Si confirmas, estas citas se cancelarán y sus notificaciones se pondrán en cola."
                : "Estas citas coinciden con el periodo. Confirmar solo guardará la excepción; las citas no se modificarán.";
        }
        exceptionImpactConfirm.textContent = willCancelAppointments
            ? "Confirmar cancelación y notificar"
            : "Confirmar y continuar";
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
            exceptionFeedback.textContent = formatExceptionFeedback(data);
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
                body: {
                    ...request.body,
                    confirmImpact: true,
                    confirmedAppointmentIds: (data.affectedAppointments || []).map(
                        (appointment) => appointment.id,
                    ),
                },
                willCancelAppointments: data.willCancelAppointments === true,
            };
            renderExceptionImpacts(
                data.affectedAppointments || [],
                data.willCancelAppointments === true,
            );
            return;
        }
        if (!response.ok) throw new Error(data.message || "No pudimos actualizar el estado.");
        pendingExceptionStatusRequest = null;
        exceptionImpact.hidden = true;
        await loadExceptionManager();
        await loadSchedules();
        exceptionFeedback.textContent = formatExceptionFeedback(data);
        exceptionFeedback.hidden = false;
    }

    function renderWeekLabel(week) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(weekInput.value || "")) weekInput.value = week.start;
        const selectedDate = weekInput.value;
        const title =
            periodMode === "day"
                ? "Horario del día"
                : periodMode === "month"
                  ? "Horario mensual"
                  : "Horario semanal";
        setText("[data-schedule-view-title]", title);
        const periodLabel =
            periodMode === "day"
                ? getDateLabel(selectedDate)
                : periodMode === "month"
                  ? getMonthTitle(selectedDate)
                  : `${formatDate(new Date(`${week.start}T12:00:00-05:00`))} – ${formatDate(new Date(`${week.end}T12:00:00-05:00`), { day: "numeric", month: "short", year: "numeric" })}`;
        setText("[data-schedule-week-label]", periodLabel);
        periodButtons.forEach((button) => {
            button.setAttribute(
                "aria-pressed",
                String(button.dataset.calendarPeriod === periodMode),
            );
        });
    }

    async function loadSchedules() {
        const requestId = ++scheduleRequestId;
        weeklyRequestId += 1;
        feedback.hidden = false;
        feedback.textContent = "Cargando horarios…";
        errorMessage.hidden = true;
        emptyMessage.hidden = true;
        doctorList.replaceChildren();
        exceptionsList.replaceChildren();
        exceptionsEmpty.hidden = true;
        setText("[data-stat-active-doctors]", "—");
        setText("[data-stat-configured]", "—");
        setText("[data-stat-exceptions]", "—");
        weeklyView.hidden = true;
        weeklyContent.hidden = true;
        weeklyError.hidden = true;
        weeklyFeedback.hidden = true;

        const params = new URLSearchParams({
            search: searchInput.value.trim(),
            doctorId: doctorSelect.value,
            specialtyId: specialtySelect.value,
            status: statusSelect.value,
            weekStart: getSelectedWeekStart(),
        });

        try {
            const response = await fetch(`${endpoint}?${params.toString()}`, {
                headers: { Accept: "application/json" },
            });
            const data = await response.json();
            if (requestId !== scheduleRequestId) return;
            if (!response.ok) throw new Error(data.message || "No pudimos cargar los horarios.");

            setText("[data-stat-active-doctors]", data.summary.activeDoctors);
            setText("[data-stat-configured]", data.summary.configuredSchedules);
            setText("[data-stat-exceptions]", data.summary.upcomingExceptions);
            renderWeekLabel(data.week);
            updateConfigurationOptions(data.doctorOptions);
            renderSelectOptions(
                specialtySelect,
                data.specialtyOptions,
                "Todas las especialidades",
                (specialty) => specialty.name,
            );

            const visibleDoctorIds = new Set(data.doctors.map((doctor) => String(doctor.id)));
            if (isDoctorScheduleDismissed) {
                selectedDoctorId = null;
            } else if (doctorSelect.value) {
                selectedDoctorId = visibleDoctorIds.has(doctorSelect.value)
                    ? doctorSelect.value
                    : null;
            } else if (!visibleDoctorIds.has(String(selectedDoctorId))) {
                selectedDoctorId = null;
            }
            doctorList.innerHTML = data.doctors.map(renderDoctor).join("");
            doctorList.hidden = false;
            weeklyView.hidden = !selectedDoctorId;
            exceptionsList.innerHTML = data.exceptions.map(renderException).join("");
            exceptionsEmpty.hidden = data.exceptions.length > 0;
            feedback.hidden = true;
            emptyMessage.hidden = data.doctors.length > 0;
            doctorList.querySelectorAll("[data-view-week]").forEach((button) => {
                button.addEventListener("click", () => {
                    if (selectedDoctorId === button.dataset.viewWeek) {
                        hideSelectedDoctorSchedule();
                        return;
                    }
                    selectedDoctorId = button.dataset.viewWeek;
                    isDoctorScheduleDismissed = false;
                    updateDoctorCardSelection();
                    loadWeeklySchedule(selectedDoctorId);
                });
            });
            updateDoctorCardSelection();
            if (selectedDoctorId) await loadWeeklySchedule(selectedDoctorId);
        } catch (error) {
            if (requestId !== scheduleRequestId) return;
            feedback.hidden = true;
            errorMessage.textContent = error.message || "Ocurrió un error al cargar los horarios.";
            errorMessage.hidden = false;
            exceptionsList.replaceChildren();
            exceptionsEmpty.hidden = false;
            weeklyView.hidden = !selectedDoctorId;
            if (selectedDoctorId) {
                weeklyFeedback.hidden = true;
                weeklyError.textContent = "No pudimos actualizar el horario seleccionado.";
                weeklyError.hidden = false;
            }
        }
    }
    function formatAppointmentDate(dateValue) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue || "")) return "Fecha no disponible";
        return new Intl.DateTimeFormat("es-CO", {
            dateStyle: "full",
            timeZone: "America/Bogota",
        }).format(new Date(`${dateValue}T12:00:00.000Z`));
    }

    function openAppointmentDetails(button) {
        if (!appointmentDialog?.showModal || appointmentDialog.open) return;
        lastAppointmentTrigger = button;
        const patientName = button.dataset.patientName || "Paciente";
        const startTime = button.dataset.appointmentStart;
        const endTime = button.dataset.appointmentEnd;
        appointmentDialog.querySelector("[data-appointment-patient]").textContent = patientName;
        appointmentDialog.querySelector("[data-appointment-initials]").textContent =
            button.dataset.patientInitials || getPatientInitials(patientName);
        appointmentDialog.querySelector("[data-appointment-date]").textContent =
            formatAppointmentDate(button.dataset.appointmentDate);
        appointmentDialog.querySelector("[data-appointment-time]").textContent =
            `${formatTime(startTime)}–${formatTime(endTime)}`;
        appointmentDialog.querySelector("[data-appointment-specialty]").textContent =
            button.dataset.appointmentSpecialty || "Sin especialidad asignada";
        appointmentDialog.querySelector("[data-appointment-doctor]").textContent =
            button.dataset.appointmentDoctor || "Médico no disponible";
        appointmentDialog.querySelector("[data-appointment-status]").textContent =
            button.dataset.appointmentStatus || "Estado no disponible";
        appointmentDialog.showModal();
    }

    appointmentDialog?.querySelectorAll("[data-appointment-close]").forEach((button) => {
        button.addEventListener("click", () => appointmentDialog.close());
    });
    appointmentDialog?.addEventListener("close", () => {
        lastAppointmentTrigger?.focus();
        lastAppointmentTrigger = null;
    });
    appointmentDialog?.addEventListener("click", (event) => {
        if (event.target === appointmentDialog) appointmentDialog.close();
    });

    weeklyGrid.addEventListener("click", (event) => {
        const appointmentButton = event.target.closest("[data-appointment-open]");
        if (appointmentButton && weeklyGrid.contains(appointmentButton)) {
            openAppointmentDetails(appointmentButton);
        }
    });

    page.addEventListener("click", (event) => {
        const monthDayButton = event.target.closest("[data-month-day]");
        if (monthDayButton && page.contains(monthDayButton) && !monthDayButton.disabled) {
            periodMode = "day";
            weekInput.value = monthDayButton.dataset.monthDay;
            renderWeekLabel({ start: getSelectedWeekStart(), end: getDateForWeekday(6) });
            loadSchedules();
            return;
        }
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

    function moveSelectedPeriod(direction) {
        if (!weekInput.value) return;
        const date = new Date(`${weekInput.value}T00:00:00Z`);
        if (periodMode === "month") {
            date.setUTCDate(1);
            date.setUTCMonth(date.getUTCMonth() + direction);
        } else {
            date.setUTCDate(date.getUTCDate() + direction * (periodMode === "week" ? 7 : 1));
        }
        weekInput.value = date.toISOString().slice(0, 10);
        loadSchedules();
    }

    function selectPeriod(mode) {
        if (!["day", "week", "month"].includes(mode) || mode === periodMode) return;
        periodMode = mode;
        weekInput.value = normalizeDateForPeriod(weekInput.value);
        renderWeekLabel({ start: getSelectedWeekStart(), end: getDateForWeekday(6) });
        loadSchedules();
    }

    filterForm.addEventListener("submit", (event) => {
        event.preventDefault();
        loadSchedules();
    });
    page.querySelector("[data-week-previous]").addEventListener("click", () =>
        moveSelectedPeriod(-1),
    );
    page.querySelector("[data-week-next]").addEventListener("click", () => moveSelectedPeriod(1));
    periodButtons.forEach((button) => {
        button.addEventListener("click", () => selectPeriod(button.dataset.calendarPeriod));
    });
    searchInput.addEventListener("input", () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(loadSchedules, 250);
    });
    doctorSelect.addEventListener("change", () => {
        isDoctorScheduleDismissed = false;
        loadSchedules();
    });
    specialtySelect.addEventListener("change", () => loadSchedules());
    statusSelect.addEventListener("change", () => loadSchedules());
    page.querySelector("[data-weekly-clear]").addEventListener("click", () => {
        hideSelectedDoctorSchedule();
    });
    weekInput.addEventListener("change", () => {
        if (!weekInput.value) return;
        weekInput.value = normalizeDateForPeriod(weekInput.value);
        loadSchedules();
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
    configureForm
        ?.querySelector("[data-config-valid-from]")
        ?.addEventListener("change", updateAvailableWeekdays);
    configureForm
        ?.querySelector("[data-config-valid-until]")
        ?.addEventListener("change", updateAvailableWeekdays);
    configureDeleteButton?.addEventListener("click", async () => {
        if (!window.confirm("¿Quieres eliminar este intervalo de atención?")) return;
        configureForm.dataset.mode = "delete";
        configureSubmitButton.click();
    });
    configureForm?.querySelectorAll("[data-day-enabled]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const dayElement = checkbox.closest("[data-config-day]");
            setEnabledDay(dayElement, checkbox.checked);
            if (checkbox.checked && selectedQuickShift) {
                const wasApplied = applyQuickShiftToDays(selectedQuickShift, [dayElement]);
                if (!wasApplied) {
                    checkbox.checked = false;
                    setEnabledDay(dayElement, false);
                }
            }
        });
    });
    configureForm?.addEventListener("input", (event) => {
        if (!event.target.matches("[data-interval-start], [data-interval-end]")) return;
        delete event.target.closest("[data-config-day]").dataset.quickShift;
    });
    quickShiftButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const selectedDays = [
                ...configureForm.querySelectorAll("[data-day-enabled]:checked"),
            ].map((checkbox) => checkbox.closest("[data-config-day]"));
            applyQuickShiftToDays(button.dataset.configShift, selectedDays);
        });
    });
    configureForm?.addEventListener("click", (event) => {
        const removeButton = event.target.closest("[data-remove-interval]");
        if (!removeButton || removeButton.hidden) return;
        const dayElement = removeButton.closest("[data-config-day]");
        const interval = removeButton.closest("[data-config-interval]");
        if (dayElement.querySelectorAll("[data-config-interval]").length < 2) return;
        interval.remove();
        delete dayElement.dataset.quickShift;
        updateIntervalRemoveButtons(dayElement);
    });
    configureForm?.querySelectorAll("[data-add-interval]").forEach((button) => {
        button.addEventListener("click", () => {
            const dayElement = button.closest("[data-config-day]");
            const newInterval = createIntervalRow(dayElement);
            delete dayElement.dataset.quickShift;
            updateIntervalRemoveButtons(dayElement);
            newInterval.querySelector("[data-interval-start]").focus();
        });
    });

    loadSchedules();
})();
