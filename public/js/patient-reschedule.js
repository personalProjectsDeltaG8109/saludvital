(() => {
    const form = document.querySelector("#reschedule-form");
    if (!form) return;

    const rows = [...document.querySelectorAll("[data-reschedule-appointment]")];
    const calendarDays = document.querySelector("[data-calendar-days]");
    const calendarMonth = document.querySelector("[data-calendar-month]");
    const timeList = document.querySelector("[data-time-list]");
    const timeMessage = document.querySelector("[data-time-message]");
    const dateLabel = document.querySelector("[data-selected-date-label]");
    const submitButton = document.querySelector(".reschedule-submit");
    const confirmDialog = document.querySelector("[data-confirm-reschedule-dialog]");
    const confirmDoctor = document.querySelector("[data-confirm-doctor]");
    const confirmCurrentDateTime = document.querySelector("[data-confirm-current-datetime]");
    const confirmNewDateTime = document.querySelector("[data-confirm-new-datetime]");
    const confirmAction = document.querySelector("[data-confirm-reschedule]");
    const feedbackDialog = document.querySelector("[data-feedback-dialog]");
    const feedbackTitle = document.querySelector("[data-feedback-title]");
    const feedbackMessage = document.querySelector("[data-feedback-message]");
    const feedbackIcon = document.querySelector("[data-feedback-icon]");
    const feedbackClose = document.querySelector("[data-close-feedback]");
    const viewAppointments = document.querySelector("[data-view-appointments]");
    const summaryDoctor = document.querySelector("[data-summary-doctor]");
    const summarySpecialty = document.querySelector("[data-summary-specialty]");
    const summaryDate = document.querySelector("[data-summary-date]");
    const summaryTime = document.querySelector("[data-summary-time]");
    const summarySite = document.querySelector("[data-summary-site]");
    const rescheduleLimitNote = document.querySelector("[data-reschedule-limit-note]");
    const stepItems = [...document.querySelectorAll("[data-reschedule-step]")];
    const maxReschedules = 3;
    let selectedRow = rows.find((row) => row.querySelector("input").checked) || rows[0];
    let selectedDate = "";
    let selectedTime = "";
    let monthCursor = new Date();
    monthCursor.setDate(1);

    const pad = (value) => String(value).padStart(2, "0");
    const dateKey = (date) =>
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const dateAtTime = (date, time) => new Date(`${date}T${time}:00-05:00`);
    const formatDate = (date) =>
        new Intl.DateTimeFormat("es-CO", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "America/Bogota",
        }).format(dateAtTime(date, "12:00"));
    const formatTime = (time) =>
        new Intl.DateTimeFormat("es-CO", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/Bogota",
        }).format(dateAtTime("2000-01-01", time));
    const formatDateTime = (date) =>
        new Intl.DateTimeFormat("es-CO", {
            dateStyle: "long",
            timeStyle: "short",
            timeZone: "America/Bogota",
        }).format(date);

    function showFeedback({ title, message, isSuccess }) {
        feedbackTitle.textContent = title;
        feedbackMessage.textContent = message;
        feedbackIcon.textContent = isSuccess ? "✓" : "!";
        feedbackDialog.classList.toggle("is-success", isSuccess);
        feedbackDialog.classList.toggle("is-error", !isSuccess);
        feedbackClose.textContent = isSuccess ? "Cerrar" : "Intentar de nuevo";
        viewAppointments.hidden = !isSuccess;
        feedbackDialog.showModal();
    }

    function setCurrentStep(step) {
        stepItems.forEach((item) => {
            const itemStep = Number(item.dataset.rescheduleStep);
            const isComplete = itemStep <= step;

            // Keep completed steps filled while highlighting the current step for assistive technology.
            item.classList.toggle("is-complete", isComplete);
            item.classList.toggle("is-current", itemStep === step);
            if (itemStep === step) item.setAttribute("aria-current", "step");
            else item.removeAttribute("aria-current");
        });
    }

    function updateSummary() {
        if (!selectedRow) {
            summaryDoctor.textContent = "Selecciona una cita";
            summarySpecialty.textContent = "Especialidad";
            summarySite.textContent = "Sede";
            summaryDate.textContent = "Selecciona una fecha";
            summaryTime.textContent = "Selecciona un horario";
            rescheduleLimitNote.textContent = "";
            submitButton.disabled = true;
            setCurrentStep(1);
            return;
        }

        summaryDoctor.textContent = selectedRow.dataset.doctorName;
        summarySpecialty.textContent = selectedRow.dataset.specialty;
        summarySite.textContent = selectedRow.dataset.site;
        summaryDate.textContent = selectedDate ? formatDate(selectedDate) : "Selecciona una fecha";
        summaryTime.textContent = selectedTime ? formatTime(selectedTime) : "Selecciona un horario";
        const remainingReschedules =
            maxReschedules - Number(selectedRow.dataset.reschedulesUsed || 0);
        rescheduleLimitNote.textContent =
            remainingReschedules === 1
                ? "Te queda 1 reprogramación para esta cita."
                : `Puedes reprogramar esta cita ${remainingReschedules} veces más.`;
        submitButton.disabled = !(selectedDate && selectedTime);
        // A date alone is not enough; step 2 starts once a time is selected as well.
        setCurrentStep(selectedTime ? 2 : 1);
    }

    function clearFormAfterSuccess() {
        // Clear the selected appointment and new date after a successful reschedule.
        selectedRow = null;
        selectedDate = "";
        selectedTime = "";
        rows.forEach((row) => {
            row.classList.remove("is-selected");
            row.querySelector("input").checked = false;
        });
        calendarDays.replaceChildren();
        timeList.replaceChildren();
        dateLabel.textContent = "Selecciona una fecha disponible.";
        setMessage("Selecciona una cita para consultar horarios.");
        summaryDoctor.textContent = "Selecciona una cita";
        summarySpecialty.textContent = "Especialidad";
        summarySite.textContent = "Sede";
        summaryDate.textContent = "Selecciona una fecha";
        summaryTime.textContent = "Selecciona un horario";
        rescheduleLimitNote.textContent = "";
        submitButton.disabled = true;
    }

    function setMessage(message, isError = false) {
        timeMessage.textContent = message;
        timeMessage.classList.toggle("is-error", isError);
    }

    async function loadTimes(date) {
        selectedDate = date;
        selectedTime = "";
        dateLabel.textContent = formatDate(date);
        timeList.replaceChildren();
        updateSummary();
        setMessage("Buscando horarios disponibles…");

        try {
            const response = await fetch(
                `/api/patient/doctors/${selectedRow.dataset.doctorId}/availability?date=${encodeURIComponent(date)}`,
                { headers: { Accept: "application/json" }, credentials: "same-origin" },
            );
            const payload = await response.json();
            if (!response.ok || !payload.success)
                throw new Error(payload.message || "No se pudieron consultar los horarios.");

            // The availability endpoint enforces the thirty-minute minimum notice.
            const availableTimes = payload.data;
            if (!availableTimes.length) {
                setMessage(
                    "No hay horarios disponibles con la anticipación mínima requerida para esta fecha.",
                );
                return;
            }

            setMessage("Elige uno de los horarios disponibles.");
            availableTimes.forEach((time) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "reschedule-time-option";
                button.textContent = formatTime(time);
                button.addEventListener("click", () => {
                    selectedTime = time;
                    timeList
                        .querySelectorAll("button")
                        .forEach((option) =>
                            option.classList.toggle("is-selected", option === button),
                        );
                    updateSummary();
                });
                timeList.append(button);
            });
        } catch (error) {
            setMessage(error.message || "Ocurrió un error al consultar los horarios.", true);
        }
    }

    function renderCalendar() {
        const year = monthCursor.getFullYear();
        const month = monthCursor.getMonth();
        calendarMonth.textContent = new Intl.DateTimeFormat("es-CO", {
            month: "long",
            year: "numeric",
        }).format(monthCursor);
        calendarDays.replaceChildren();
        const firstWeekday = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let index = 0; index < firstWeekday; index += 1) {
            const blank = document.createElement("span");
            blank.className = "reschedule-calendar-blank";
            calendarDays.append(blank);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            const date = new Date(year, month, day);
            const key = dateKey(date);
            const button = document.createElement("button");
            button.type = "button";
            button.className = "reschedule-calendar-day";
            button.textContent = String(day);
            button.disabled = dateAtTime(key, "23:30").getTime() < Date.now();
            button.classList.toggle("is-selected", key === selectedDate);
            button.addEventListener("click", () => {
                calendarDays
                    .querySelectorAll("button")
                    .forEach((item) => item.classList.toggle("is-selected", item === button));
                loadTimes(key);
            });
            calendarDays.append(button);
        }
    }

    rows.forEach((row) =>
        row.querySelector("input").addEventListener("change", () => {
            selectedRow = row;
            rows.forEach((item) => item.classList.toggle("is-selected", item === row));
            const existingDate = new Date(row.dataset.startAt);
            monthCursor = new Date(existingDate.getFullYear(), existingDate.getMonth(), 1);
            selectedTime = "";
            updateSummary();
            renderCalendar();
            loadTimes(dateKey(existingDate));
        }),
    );

    document.querySelectorAll("[data-month-shift]").forEach((button) =>
        button.addEventListener("click", () => {
            monthCursor.setMonth(monthCursor.getMonth() + Number(button.dataset.monthShift));
            renderCalendar();
        }),
    );

    async function saveRescheduledAppointment() {
        submitButton.disabled = true;
        submitButton.textContent = "Guardando cambio…";
        confirmAction.disabled = true;

        try {
            const response = await fetch(
                `/api/patient/appointments/${selectedRow.dataset.id}/reschedule`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ date: selectedDate, time: selectedTime }),
                },
            );
            const payload = await response.json();
            if (!response.ok || !payload.success)
                throw new Error(payload.message || "No se pudo reprogramar la cita.");
            submitButton.textContent = "Cita reprogramada";
            confirmDialog.close();
            clearFormAfterSuccess();
            setCurrentStep(4);
            showFeedback({
                title: "¡Cita reprogramada!",
                message:
                    "Tu cita fue reprogramada correctamente. Puedes consultar el nuevo horario en Mis citas.",
                isSuccess: true,
            });
        } catch (error) {
            submitButton.disabled = false;
            submitButton.textContent = "Confirmar reprogramación";
            confirmDialog.close();
            setCurrentStep(4);
            showFeedback({
                title: "No se pudo reprogramar la cita",
                message: error.message || "Ocurrió un error al reprogramar la cita.",
                isSuccess: false,
            });
        } finally {
            confirmAction.disabled = false;
        }
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!selectedDate || !selectedTime) return;

        confirmDoctor.textContent = selectedRow.dataset.doctorName;
        confirmCurrentDateTime.textContent = formatDateTime(new Date(selectedRow.dataset.startAt));
        confirmNewDateTime.textContent = formatDateTime(dateAtTime(selectedDate, selectedTime));
        confirmDialog.showModal();
    });

    document.querySelector("[data-cancel-reschedule]").addEventListener("click", () => {
        confirmDialog.close();
    });
    confirmAction.addEventListener("click", () => {
        // Advance to confirmation only after the patient accepts the confirmation dialog.
        setCurrentStep(3);
        saveRescheduledAppointment();
    });
    feedbackClose.addEventListener("click", () => feedbackDialog.close());

    [confirmDialog, feedbackDialog].forEach((dialog) =>
        dialog.addEventListener("click", (event) => {
            if (event.target === dialog) dialog.close();
        }),
    );

    const initialDate = new Date(selectedRow.dataset.startAt);
    monthCursor = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
    renderCalendar();
    loadTimes(dateKey(initialDate));
    updateSummary();
})();
