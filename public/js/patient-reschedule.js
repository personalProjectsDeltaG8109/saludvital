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
    const result = document.querySelector("[data-reschedule-result]");
    const summaryDoctor = document.querySelector("[data-summary-doctor]");
    const summarySpecialty = document.querySelector("[data-summary-specialty]");
    const summaryDate = document.querySelector("[data-summary-date]");
    const summaryTime = document.querySelector("[data-summary-time]");
    const summarySite = document.querySelector("[data-summary-site]");
    const stepItems = [...document.querySelectorAll("[data-reschedule-step]")];
    const minRescheduleAt = Date.now() + 24 * 60 * 60 * 1000;
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

    function setCurrentStep(step) {
        stepItems.forEach((item) =>
            item.classList.toggle("is-current", Number(item.dataset.rescheduleStep) === step),
        );
    }

    function updateSummary() {
        summaryDoctor.textContent = selectedRow.dataset.doctorName;
        summarySpecialty.textContent = selectedRow.dataset.specialty;
        summarySite.textContent = selectedRow.dataset.site;
        summaryDate.textContent = selectedDate ? formatDate(selectedDate) : "Selecciona una fecha";
        summaryTime.textContent = selectedTime ? formatTime(selectedTime) : "Selecciona un horario";
        submitButton.disabled = !(selectedDate && selectedTime);
        setCurrentStep(selectedTime ? 3 : selectedDate ? 2 : 1);
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

            const availableTimes = payload.data.filter(
                (time) => dateAtTime(date, time).getTime() >= minRescheduleAt,
            );
            if (!availableTimes.length) {
                setMessage(
                    "No hay horarios disponibles con 24 horas de anticipación para esta fecha.",
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
            button.disabled = dateAtTime(key, "23:30").getTime() < minRescheduleAt;
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

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!selectedDate || !selectedTime) return;
        submitButton.disabled = true;
        submitButton.textContent = "Guardando cambio…";
        result.textContent = "";
        result.classList.remove("is-error", "is-success");

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
            result.textContent = "Tu cita fue reprogramada correctamente.";
            result.classList.add("is-success");
            setCurrentStep(4);
            submitButton.textContent = "Cita reprogramada";
        } catch (error) {
            result.textContent = error.message || "Ocurrió un error al reprogramar la cita.";
            result.classList.add("is-error");
            submitButton.disabled = false;
            submitButton.textContent = "Confirmar reprogramación";
        }
    });

    const initialDate = new Date(selectedRow.dataset.startAt);
    monthCursor = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
    renderCalendar();
    loadTimes(dateKey(initialDate));
    updateSummary();
})();
