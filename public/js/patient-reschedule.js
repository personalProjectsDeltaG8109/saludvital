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
    const nextAppointmentButton = document.querySelector('[data-next-step="2"]');
    const nextDateTimeButton = document.querySelector('[data-next-step="3"]');
    const feedbackDialog = document.querySelector("[data-feedback-dialog]");
    const feedbackTitle = document.querySelector("[data-feedback-title]");
    const feedbackMessage = document.querySelector("[data-feedback-message]");
    const feedbackIcon = document.querySelector("[data-feedback-icon]");
    const feedbackClose = document.querySelector("[data-close-feedback]");
    const summaryDoctor = document.querySelector("[data-summary-doctor]");
    const summarySpecialty = document.querySelector("[data-summary-specialty]");
    const summaryDate = document.querySelector("[data-summary-date]");
    const summaryTime = document.querySelector("[data-summary-time]");
    const rescheduleLimitNote = document.querySelector("[data-reschedule-limit-note]");
    const successCountdown = document.querySelector("[data-reschedule-countdown]");
    const stepItems = [...document.querySelectorAll("[data-reschedule-step]")];
    const stepPanels = [...document.querySelectorAll("[data-reschedule-panel]")];
    const maxReschedules = 3;
    let selectedRow = rows.find((row) => row.querySelector("input").checked) || null;
    let selectedDate = "";
    let selectedTime = "";
    let currentStep = 1;
    let highestStepReached = 1;
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
    function showFeedback({ title, message, isSuccess }) {
        feedbackTitle.textContent = title;
        feedbackMessage.textContent = message;
        feedbackIcon.textContent = isSuccess ? "✓" : "!";
        feedbackDialog.classList.toggle("is-success", isSuccess);
        feedbackDialog.classList.toggle("is-error", !isSuccess);
        feedbackClose.textContent = "Entendido";
        feedbackDialog.showModal();
    }

    function setCurrentStep(step) {
        currentStep = step;
        highestStepReached = Math.max(highestStepReached, step);

        stepItems.forEach((item) => {
            const itemStep = Number(item.dataset.rescheduleStep);
            const isComplete = itemStep <= step;

            item.classList.toggle("is-complete", isComplete);
            item.classList.toggle("is-current", itemStep === step);
            if (itemStep === step) item.setAttribute("aria-current", "step");
            else item.removeAttribute("aria-current");
        });

        stepPanels.forEach((panel) => {
            panel.hidden = Number(panel.dataset.reschedulePanel) !== step;
        });
    }

    function goToStep(step) {
        if (step > highestStepReached + 1) return;
        setCurrentStep(step);
        const panel = stepPanels.find((item) => Number(item.dataset.reschedulePanel) === step);
        panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function updateSummary() {
        if (!selectedRow) {
            summaryDoctor.textContent = "Selecciona una cita";
            summarySpecialty.textContent = "Especialidad";
            summaryDate.textContent = "Selecciona una fecha";
            summaryTime.textContent = "Selecciona un horario";
            rescheduleLimitNote.textContent = "";
            nextAppointmentButton.disabled = true;
            nextDateTimeButton.disabled = true;
            submitButton.disabled = true;
            return;
        }

        summaryDoctor.textContent = selectedRow.dataset.doctorName;
        summarySpecialty.textContent = selectedRow.dataset.specialty;
        summaryDate.textContent = selectedDate ? formatDate(selectedDate) : "Selecciona una fecha";
        summaryTime.textContent = selectedTime ? formatTime(selectedTime) : "Selecciona un horario";
        const remainingReschedules =
            maxReschedules - Number(selectedRow.dataset.reschedulesUsed || 0);
        rescheduleLimitNote.textContent =
            remainingReschedules === 1
                ? "Te queda 1 reprogramación para esta cita."
                : `Puedes reprogramar esta cita ${remainingReschedules} veces más.`;
        nextAppointmentButton.disabled = false;
        nextDateTimeButton.disabled = !(selectedDate && selectedTime);
        submitButton.disabled = !(selectedDate && selectedTime);
    }

    function setMessage(message, isError = false) {
        timeMessage.textContent = message;
        timeMessage.classList.toggle("is-error", isError);
    }

    async function loadTimes(date) {
        if (!selectedRow) {
            selectedDate = "";
            selectedTime = "";
            timeList.replaceChildren();
            setMessage("Selecciona una cita para consultar horarios.");
            updateSummary();
            return;
        }

        selectedDate = date;
        selectedTime = "";
        dateLabel.textContent = formatDate(date);
        timeList.replaceChildren();
        updateSummary();
        setMessage("Buscando horarios disponibles…");

        try {
            const response = await fetch(
                `/api/patient/doctors/${selectedRow.dataset.doctorId}/availability?date=${encodeURIComponent(date)}&purpose=reschedule`,
                { headers: { Accept: "application/json" }, credentials: "same-origin" },
            );
            const payload = await response.json();
            if (!response.ok || !payload.success)
                throw new Error(payload.message || "No se pudieron consultar los horarios.");

            // The availability endpoint enforces the five-hour reschedule notice.
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
            button.disabled = !selectedRow || dateAtTime(key, "23:30").getTime() < Date.now();
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
            selectedDate = "";
            selectedTime = "";
            nextDateTimeButton.disabled = true;
            submitButton.disabled = true;
            timeList.replaceChildren();
            dateLabel.textContent = "Selecciona una fecha disponible.";
            setMessage("Selecciona una cita para consultar horarios.");
            updateSummary();
        }),
    );

    nextAppointmentButton.addEventListener("click", () => {
        if (!selectedRow) return;
        const existingDate = new Date(selectedRow.dataset.startAt);
        const calendarDate = selectedDate ? dateAtTime(selectedDate, "12:00") : existingDate;
        monthCursor = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
        goToStep(2);
        renderCalendar();
        if (selectedDate) {
            dateLabel.textContent = formatDate(selectedDate);
        } else {
            loadTimes(dateKey(existingDate));
        }
    });

    document.querySelector('[data-back-step="1"]').addEventListener("click", () => {
        goToStep(1);
    });
    nextDateTimeButton.addEventListener("click", () => {
        if (selectedDate && selectedTime) goToStep(3);
    });
    document.querySelector('[data-back-step="2"]').addEventListener("click", () => {
        goToStep(2);
    });

    document.querySelectorAll("[data-month-shift]").forEach((button) =>
        button.addEventListener("click", () => {
            monthCursor.setMonth(monthCursor.getMonth() + Number(button.dataset.monthShift));
            renderCalendar();
        }),
    );

    async function saveRescheduledAppointment() {
        submitButton.disabled = true;
        submitButton.textContent = "Guardando cambio…";

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
            setCurrentStep(4);
            let secondsRemaining = 4;
            successCountdown.textContent = String(secondsRemaining);
            const countdownInterval = window.setInterval(() => {
                secondsRemaining -= 1;
                successCountdown.textContent = String(secondsRemaining);
                if (secondsRemaining <= 0) {
                    window.clearInterval(countdownInterval);
                    window.location.assign("/patient/appointments");
                }
            }, 1000);
        } catch (error) {
            submitButton.disabled = false;
            submitButton.textContent = "Confirmar reprogramación";
            setCurrentStep(3);
            showFeedback({
                title: "No se pudo reprogramar la cita",
                message: error.message || "Ocurrió un error al reprogramar la cita.",
                isSuccess: false,
            });
        }
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!selectedRow || !selectedDate || !selectedTime) return;
        saveRescheduledAppointment();
    });

    feedbackClose.addEventListener("click", () => {
        highestStepReached = 3;
        setCurrentStep(3);
        feedbackDialog.close();
    });

    feedbackDialog.addEventListener("click", (event) => {
        if (event.target === feedbackDialog) feedbackDialog.close();
    });

    renderCalendar();
    setMessage("Selecciona una cita para consultar horarios.");
    setCurrentStep(currentStep);
    updateSummary();
})();
