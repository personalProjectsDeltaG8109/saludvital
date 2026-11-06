const bookingPage = document.querySelector("[data-admin-appointment-create]");

if (bookingPage) {
    const find = (selector) => bookingPage.querySelector(selector);
    const form = find("[data-appointment-create-form]");
    const patient = find("[data-booking-patient]");
    const next = find("[data-booking-next]");
    const back = find("[data-booking-back]");
    const submit = find("[data-create-submit]");
    const error = find("[data-create-error]");
    const feedback = find("[data-create-feedback]");
    const today = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
    const state = {
        step: 1,
        specialties: [],
        doctors: [],
        specialty: null,
        doctor: null,
        date: "",
        time: "",
        times: [],
        month: today.slice(0, 7),
        doctorsLoading: false,
        timesLoading: false,
        saving: false,
        created: false,
    };
    let doctorRequest = 0;
    let timeRequest = 0;

    function setError(message = "") {
        error.textContent = message;
        error.hidden = !message;
    }

    async function requestJson(url, options = {}) {
        const response = await fetch(url, { credentials: "same-origin", ...options });
        const contentType = response.headers?.get("content-type") || "application/json";
        const result = contentType.includes("application/json") ? await response.json() : {};
        if (!response.ok || response.redirected || !contentType.includes("application/json")) {
            const failure = new Error(result.message || "No fue posible completar la solicitud.");
            failure.status = response.status;
            throw failure;
        }
        return result;
    }

    function normalize(value) {
        return value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("es");
    }

    function canContinue() {
        if (state.step === 1) return Boolean(patient.value && state.specialty);
        if (state.step === 2) return Boolean(state.doctor && !state.doctorsLoading);
        return Boolean(state.date && state.time && !state.timesLoading);
    }

    function updateActions() {
        next.disabled = !canContinue() || state.saving || state.created;
        submit.disabled = !canContinue() || state.saving || state.created;
        back.disabled = state.saving || state.created;
        next.hidden = state.step === 4;
        submit.hidden = state.step !== 4;
        back.hidden = state.step === 1;
    }

    function summary() {
        const container = find("[data-booking-summary]");
        container.replaceChildren();
        for (const [label, value] of [
            ["Paciente", patient.selectedOptions[0]?.textContent],
            ["Especialidad", state.specialty?.name],
            ["Médico", state.doctor?.name],
            ["Fecha", state.date ? formatDate(state.date) : ""],
            ["Hora", formatTime(state.time)],
        ]) {
            const row = document.createElement("div");
            const term = document.createElement("dt");
            const detail = document.createElement("dd");
            term.textContent = label;
            detail.textContent = value || "Sin seleccionar";
            row.append(term, detail);
            container.append(row);
        }
    }

    function showStep(step, focus = true) {
        state.step = step;
        bookingPage.querySelectorAll("[data-booking-step]").forEach((panel) => {
            panel.hidden = Number(panel.dataset.bookingStep) !== step;
        });
        bookingPage.querySelectorAll("[data-step-indicator]").forEach((item) => {
            const number = Number(item.dataset.stepIndicator);
            item.classList.toggle("is-current", number === step);
            item.classList.toggle("is-complete", number < step);
            if (number === step) item.setAttribute("aria-current", "step");
            else item.removeAttribute("aria-current");
        });
        if (step === 4) summary();
        updateActions();
        if (focus) find(`[data-booking-step="${step}"] h2`).focus();
    }

    function renderCards(container, items, selected, onSelect, isDoctor = false) {
        container.replaceChildren();
        for (const item of items) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "admin-booking-card";
            button.classList.toggle("is-selected", selected?.id === item.id);
            button.setAttribute("aria-pressed", String(selected?.id === item.id));
            const hasPhoto =
                isDoctor &&
                typeof item.photoUrl === "string" &&
                item.photoUrl.startsWith("/") &&
                !item.photoUrl.startsWith("//");
            const icon = document.createElement(hasPhoto ? "img" : "span");
            icon.className = "admin-booking-card-icon";
            icon.setAttribute("aria-hidden", "true");
            if (hasPhoto) {
                icon.src = item.photoUrl;
                icon.alt = "";
                icon.loading = "lazy";
                icon.addEventListener(
                    "error",
                    () => {
                        const fallback = document.createElement("span");
                        fallback.className = "admin-booking-card-icon";
                        fallback.setAttribute("aria-hidden", "true");
                        fallback.textContent = item.name
                            .split(" ")
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("");
                        icon.replaceWith(fallback);
                    },
                    { once: true },
                );
            }
            if (!hasPhoto)
                icon.textContent = isDoctor
                    ? item.name
                          .split(" ")
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")
                    : "+";
            const copy = document.createElement("span");
            const title = document.createElement("strong");
            title.textContent = item.name;
            const detail = document.createElement("small");
            detail.textContent = isDoctor ? state.specialty.name : "Atención médica especializada";
            copy.append(title, detail);
            button.append(icon, copy);
            button.addEventListener("click", () => {
                onSelect(item);
                container.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
            });
            container.append(button);
        }
    }

    function renderSpecialties() {
        const filter = normalize(find("[data-specialty-search]").value);
        const items = state.specialties.filter((item) => normalize(item.name).includes(filter));
        renderCards(find("[data-specialty-list]"), items, state.specialty, selectSpecialty);
        find("[data-specialty-message]").textContent = items.length
            ? ""
            : "No encontramos especialidades disponibles con esa búsqueda.";
    }

    function clearTimes() {
        timeRequest += 1;
        state.time = "";
        state.times = [];
        state.timesLoading = false;
        renderTimes();
        updateActions();
    }

    async function selectSpecialty(item) {
        if (state.specialty?.id === item.id) return;
        state.specialty = item;
        state.doctor = null;
        state.doctors = [];
        state.date = "";
        clearTimes();
        setError();
        renderSpecialties();
        find("[data-doctor-list]").replaceChildren();
        const version = ++doctorRequest;
        state.doctorsLoading = true;
        find("[data-doctor-message]").textContent = "Cargando médicos...";
        updateActions();
        try {
            const url = new URL(bookingPage.dataset.doctorsEndpoint, location.origin);
            url.searchParams.set("specialtyId", item.id);
            const result = await requestJson(url);
            if (version !== doctorRequest) return;
            state.doctors = result.doctors;
            renderDoctors();
            find("[data-doctor-message]").textContent = state.doctors.length
                ? ""
                : "No hay médicos disponibles para esta especialidad.";
        } catch (failure) {
            if (version !== doctorRequest) return;
            find("[data-doctor-message]").textContent = "No se pudieron cargar los médicos.";
            setError(failure.message);
            // Allow selecting this specialty again to retry a failed lookup.
            state.specialty = null;
            renderSpecialties();
        } finally {
            if (version === doctorRequest) {
                state.doctorsLoading = false;
                updateActions();
            }
        }
    }

    function renderDoctors() {
        renderCards(
            find("[data-doctor-list]"),
            state.doctors,
            state.doctor,
            (item) => {
                if (state.doctor?.id === item.id) return;
                state.doctor = item;
                state.date = "";
                clearTimes();
                setError();
                renderDoctors();
                renderCalendar();
            },
            true,
        );
    }

    function formatDate(date) {
        return new Intl.DateTimeFormat("es-CO", {
            dateStyle: "full",
            timeZone: "America/Bogota",
        }).format(new Date(`${date}T12:00:00-05:00`));
    }

    function formatTime(time) {
        if (!time) return "";
        return new Intl.DateTimeFormat("es-CO", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/Bogota",
        }).format(new Date(`2000-01-01T${time}:00-05:00`));
    }

    function renderCalendar() {
        const [year, month] = state.month.split("-").map(Number);
        find("[data-calendar-month]").textContent = new Intl.DateTimeFormat("es-CO", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        }).format(new Date(Date.UTC(year, month - 1, 1)));
        const days = find("[data-calendar-days]");
        days.replaceChildren();
        const start = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
        const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
        for (let index = 0; index < start; index += 1) days.append(document.createElement("span"));
        for (let day = 1; day <= count; day += 1) {
            const key = `${state.month}-${String(day).padStart(2, "0")}`;
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = day;
            button.dataset.date = key;
            button.disabled = key < today;
            button.setAttribute("aria-label", formatDate(key));
            button.setAttribute("aria-pressed", String(state.date === key));
            button.classList.toggle("is-selected", state.date === key);
            button.addEventListener("click", () => {
                state.date = key;
                renderCalendar();
                loadTimes();
            });
            days.append(button);
        }
        find('[data-month-shift="-1"]').disabled = state.month <= today.slice(0, 7);
    }

    function renderTimes() {
        const container = find("[data-time-list]");
        container.replaceChildren();
        find("[data-selected-date]").textContent = state.date
            ? formatDate(state.date)
            : "Selecciona un día.";
        find("[data-time-message]").textContent = state.timesLoading
            ? "Consultando horarios..."
            : !state.date
              ? "Selecciona un día para consultar horarios."
              : state.times.length
                ? ""
                : "No hay horarios disponibles. Selecciona otro día.";
        for (const time of state.times) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = formatTime(time);
            button.dataset.time = time;
            button.setAttribute("aria-pressed", String(state.time === time));
            button.classList.toggle("is-selected", state.time === time);
            button.addEventListener("click", () => {
                state.time = time;
                renderTimes();
                updateActions();
            });
            container.append(button);
        }
    }

    async function loadTimes() {
        clearTimes();
        if (!patient.value || !state.specialty || !state.doctor || !state.date) return;
        const version = ++timeRequest;
        state.timesLoading = true;
        setError();
        renderTimes();
        updateActions();
        const url = new URL(bookingPage.dataset.availabilityEndpoint, location.origin);
        for (const [key, value] of Object.entries({
            patientId: patient.value,
            specialtyId: state.specialty.id,
            doctorId: state.doctor.id,
            date: state.date,
        }))
            url.searchParams.set(key, value);
        try {
            const result = await requestJson(url);
            if (version !== timeRequest) return;
            state.times = result.times;
        } catch (failure) {
            if (version !== timeRequest) return;
            setError(failure.message);
        } finally {
            if (version === timeRequest) {
                state.timesLoading = false;
                renderTimes();
                updateActions();
            }
        }
    }

    patient.addEventListener("change", () => {
        state.date = "";
        clearTimes();
        renderCalendar();
        setError();
    });
    find("[data-specialty-search]").addEventListener("input", renderSpecialties);
    next.addEventListener("click", () => {
        if (canContinue()) {
            setError();
            showStep(state.step + 1);
        }
    });
    back.addEventListener("click", () => {
        setError();
        showStep(state.step - 1);
    });
    bookingPage.querySelectorAll("[data-month-shift]").forEach((button) =>
        button.addEventListener("click", () => {
            const [year, month] = state.month.split("-").map(Number);
            const target = new Date(
                Date.UTC(year, month - 1 + Number(button.dataset.monthShift), 1),
            );
            state.month = target.toISOString().slice(0, 7);
            renderCalendar();
        }),
    );

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (state.step !== 4 || !canContinue() || state.saving || state.created) return;
        if (!form.reportValidity()) return;
        state.saving = true;
        setError();
        updateActions();
        submit.textContent = "Creando cita...";
        try {
            const result = await requestJson(bookingPage.dataset.createEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patientId: patient.value,
                    specialtyId: state.specialty.id,
                    doctorId: state.doctor.id,
                    date: state.date,
                    time: state.time,
                    reason: form.elements.reason.value,
                }),
            });
            state.created = true;
            find("[data-success-message]").textContent =
                `${result.message} Número de cita: ${result.appointmentId}.`;
            find("[data-create-success]").showModal();
        } catch (failure) {
            if (failure.status === 409) {
                showStep(3);
                await loadTimes();
            }
            setError(failure.message);
        } finally {
            state.saving = false;
            submit.textContent = "Confirmar cita";
            updateActions();
        }
    });

    async function loadOptions() {
        try {
            const result = await requestJson(bookingPage.dataset.optionsEndpoint);
            for (const item of result.patients)
                patient.add(
                    new Option(
                        `${item.name}${item.document ? ` · ${item.document}` : ""}`,
                        item.id,
                    ),
                );
            patient.disabled = !result.patients.length;
            state.specialties = result.specialties;
            renderSpecialties();
            feedback.textContent =
                result.patients.length && result.specialties.length
                    ? "Completa los cuatro pasos para crear la cita."
                    : "No hay pacientes o especialidades disponibles para crear la cita.";
            updateActions();
        } catch (failure) {
            feedback.textContent =
                "No se pudieron cargar los datos. Recarga la página para intentarlo de nuevo.";
            setError(failure.message);
        }
    }

    showStep(1, false);
    renderCalendar();
    renderTimes();
    loadOptions();
}
