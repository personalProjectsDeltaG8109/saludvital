const form = document.querySelector("#appointment-booking-form");

if (form) {
    const state = {
        step: 1,
        specialties: [],
        specialty: null,
        doctors: [],
        doctor: null,
        date: "",
        time: "",
        month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    };

    const specialtyList = document.querySelector("#specialty-list");
    const doctorList = document.querySelector("#doctor-list");
    const calendarDays = document.querySelector("#calendar-days");
    const timeList = document.querySelector("#time-list");
    const result = document.querySelector("#booking-result");
    const spanishDate = new Intl.DateTimeFormat("es-CO", {
        dateStyle: "full",
        timeZone: "America/Bogota",
    });
    const specialtyIcons = [
        '<path d="M8 4v5a4 4 0 0 0 8 0V4M6 4h4m4 0h4M12 13v3a4 4 0 0 0 8 0v-2"/><circle cx="20" cy="12" r="1"/>',
        '<path d="M12 3c-3 3-5 5.5-5 9a5 5 0 0 0 10 0c0-3.5-2-6-5-9Z"/><path d="M10 13h4m-3 3h2"/>',
        '<circle cx="12" cy="11" r="7"/><path d="M5 10c2 0 3-2 4-4 2 3 4 4 10 4M9 13h.01M15 13h.01M9 16c2 2 4 2 6 0"/>',
        '<circle cx="12" cy="12" r="8"/><path d="M12 4v16m-8-8h16"/>',
        '<path d="M12 3 3 7v5c0 5 4 8 9 9 5-1 9-4 9-9V7l-9-4Z"/><path d="m7 12 3 3 7-7"/>',
        '<path d="M3 12h4l2-4 4 8 2-4h6"/><path d="M12 21S4 16 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 7-8 12-8 12Z"/>',
        '<path d="M3 12h4m10 0h4M7 12a5 5 0 1 1 10 0 5 5 0 1 1-10 0Z"/><circle cx="12" cy="12" r="2"/>',
        '<path d="M8 4v4a4 4 0 0 0 8 0V4M12 12v8m-4 0h8"/><circle cx="12" cy="5" r="2"/>',
        '<path d="M12 3v4m0 0a5 5 0 0 0-5 5v2a5 5 0 0 0 10 0v-2a5 5 0 0 0-5-5Zm-5 8H5a2 2 0 0 0 0 4h2m10-4h2a2 2 0 0 1 0 4h-2"/>',
    ];

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            };
            return entities[character];
        });
    }

    async function getJson(url, options) {
        const response = await fetch(url, { credentials: "same-origin", ...options });
        const payload = await response.json();
        if (!response.ok || !payload.success) {
            throw new Error(payload.message || "No fue posible completar la solicitud.");
        }
        return payload.data;
    }

    function setMessage(selector, message, isError = false) {
        const element = document.querySelector(selector);
        element.textContent = message;
        element.classList.toggle("is-error", isError);
        element.hidden = !message;
    }

    function iconForSpecialty(name, index) {
        const normalized = String(name).toLocaleLowerCase("es");
        const iconIndex = normalized.includes("general") ? 0
            : normalized.includes("dermat") ? 1
              : normalized.includes("pediatr") ? 2
                : normalized.includes("ginec") ? 3
                  : normalized.includes("cardio") ? 5
                    : normalized.includes("oftal") ? 6
                      : normalized.includes("ortop") ? 7
                        : normalized.includes("otorr") ? 8
                          : (index % specialtyIcons.length);
        return specialtyIcons[iconIndex];
    }

    function renderSpecialties(filter = "") {
        const normalizedFilter = filter.trim().toLocaleLowerCase("es");
        const visibleSpecialties = state.specialties.filter((specialty) =>
            `${specialty.name} ${specialty.description || ""}`.toLocaleLowerCase("es").includes(normalizedFilter),
        );

        specialtyList.innerHTML = visibleSpecialties.map((specialty, index) => `
            <button class="booking-specialty-card${state.specialty?.id === specialty.id ? " is-selected" : ""}"
                type="button" data-specialty-id="${escapeHtml(specialty.id)}">
                <span class="booking-specialty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">${iconForSpecialty(specialty.name, index)}</svg>
                </span>
                <span class="booking-card-copy">
                    <strong>${escapeHtml(specialty.name)}</strong>
                    <small>${escapeHtml(specialty.description || "Atención médica especializada.")}</small>
                </span>
                <span class="booking-card-indicator" aria-hidden="true">${state.specialty?.id === specialty.id ? "✓" : "›"}</span>
            </button>
        `).join("");

        setMessage(
            "#specialty-message",
            visibleSpecialties.length ? "" : "No encontramos especialidades con esa búsqueda.",
        );
    }

    function renderDoctors() {
        doctorList.innerHTML = state.doctors.map((doctor, index) => `
            <button class="booking-doctor-card${state.doctor?.id === doctor.id ? " is-selected" : ""}"
                type="button" data-doctor-id="${escapeHtml(doctor.id)}">
                <span class="booking-doctor-avatar" aria-hidden="true">${index % 2 ? "DR" : "SV"}</span>
                <span class="booking-card-copy">
                    <strong>Médico #${escapeHtml(doctor.id)}</strong>
                    <small>${escapeHtml(state.specialty?.name || "Profesional de SaludVital")}</small>
                    <small class="booking-doctor-note">${escapeHtml(doctor.professional_information || "Selecciona para consultar horarios")}</small>
                </span>
                <span class="booking-card-indicator" aria-hidden="true">${state.doctor?.id === doctor.id ? "✓" : "›"}</span>
            </button>
        `).join("");

        setMessage(
            "#doctor-message",
            state.doctors.length ? "" : "No hay médicos activos disponibles para esta especialidad.",
        );
    }

    function getDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function renderCalendar() {
        const year = state.month.getFullYear();
        const month = state.month.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        document.querySelector("#calendar-month").textContent = new Intl.DateTimeFormat("es-CO", {
            month: "long",
            year: "numeric",
        }).format(state.month);

        const cells = [];
        for (let blank = 0; blank < firstDay; blank += 1) {
            cells.push('<span class="booking-day is-empty" aria-hidden="true"></span>');
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            const date = new Date(year, month, day);
            const dateKey = getDateKey(date);
            const isPast = date < today;
            const classes = ["booking-day"];
            if (dateKey === state.date) classes.push("is-selected");
            if (isPast) classes.push("is-disabled");
            cells.push(`<button type="button" class="${classes.join(" ")}" data-date="${dateKey}" ${isPast ? "disabled" : ""}>${day}</button>`);
        }

        calendarDays.innerHTML = cells.join("");
    }

    function formatTime(time) {
        const [hours, minutes] = time.split(":").map(Number);
        const date = new Date(Date.UTC(2000, 0, 1, hours, minutes));
        return new Intl.DateTimeFormat("es-CO", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "UTC",
        }).format(date);
    }

    async function loadTimeSlots() {
        state.time = "";
        timeList.replaceChildren();
        if (!state.doctor || !state.date) {
            setMessage("#time-message", "Selecciona un médico y un día para consultar horarios.");
            return;
        }

        setMessage("#time-message", "Consultando horarios disponibles...");
        document.querySelector("#selected-date-label").textContent = spanishDate.format(
            new Date(`${state.date}T12:00:00`),
        );

        try {
            const times = await getJson(
                `/api/patient/doctors/${encodeURIComponent(state.doctor.id)}/availability?date=${encodeURIComponent(state.date)}`,
            );
            setMessage(
                "#time-message",
                times.length ? "" : "No hay horarios disponibles para este día. Prueba con otra fecha.",
            );
            timeList.innerHTML = times.map((time) => `
                <button class="booking-time-option" type="button" data-time="${escapeHtml(time)}">${escapeHtml(formatTime(time))}</button>
            `).join("");
        } catch (error) {
            setMessage("#time-message", error.message, true);
        }
    }

    function renderSummary() {
        document.querySelector("#booking-summary").innerHTML = `
            <div><span>Especialidad</span><strong>${escapeHtml(state.specialty?.name || "—")}</strong></div>
            <div><span>Médico</span><strong>${state.doctor ? `Médico #${escapeHtml(state.doctor.id)}` : "—"}</strong></div>
            <div><span>Fecha</span><strong>${state.date ? escapeHtml(spanishDate.format(new Date(`${state.date}T12:00:00`))) : "—"}</strong></div>
            <div><span>Hora</span><strong>${state.time ? escapeHtml(formatTime(state.time)) : "—"}</strong></div>
        `;
    }

    function updateStep() {
        form.classList.toggle("is-confirming", state.step === 4);
        document.querySelectorAll("[data-booking-step]").forEach((panel) => {
            panel.classList.toggle("is-active", Number(panel.dataset.bookingStep) === state.step);
        });
        document.querySelectorAll("[data-step-indicator]").forEach((indicator) => {
            const step = Number(indicator.dataset.stepIndicator);
            indicator.classList.toggle("is-current", step === state.step);
            indicator.classList.toggle("is-complete", step < state.step);
        });
        document.querySelector("[data-booking-back]").hidden = state.step === 1;
        document.querySelector("[data-booking-next]").hidden = state.step === 4;
        document.querySelector(".booking-submit").hidden = state.step !== 4;
        result.textContent = "";
        if (state.step === 4) renderSummary();
        if (window.matchMedia("(max-width: 760px)").matches) {
            document.querySelector(".booking-content").scrollTo({ top: 0, behavior: "smooth" });
        }
    }

    async function loadSpecialties() {
        try {
            state.specialties = await getJson("/api/patient/specialties");
            renderSpecialties();
            setMessage("#specialty-message", state.specialties.length ? "" : "Por ahora no hay especialidades disponibles.");
        } catch (error) {
            setMessage("#specialty-message", error.message, true);
        }
    }

    async function loadDoctors(specialtyId) {
        state.doctors = [];
        state.doctor = null;
        timeList.replaceChildren();
        setMessage("#doctor-message", "Cargando médicos disponibles...");
        try {
            state.doctors = await getJson(
                `/api/patient/specialties/${encodeURIComponent(specialtyId)}/doctors`,
            );
            renderDoctors();
        } catch (error) {
            setMessage("#doctor-message", error.message, true);
        }
    }

    specialtyList.addEventListener("click", async (event) => {
        const card = event.target.closest("[data-specialty-id]");
        if (!card) return;
        state.specialty = state.specialties.find((item) => String(item.id) === card.dataset.specialtyId);
        state.date = "";
        state.time = "";
        if (!window.matchMedia("(max-width: 760px)").matches) state.step = 2;
        renderSpecialties(document.querySelector("#specialty-search").value);
        updateStep();
        await loadDoctors(state.specialty.id);
    });

    doctorList.addEventListener("click", (event) => {
        const card = event.target.closest("[data-doctor-id]");
        if (!card) return;
        state.doctor = state.doctors.find((item) => String(item.id) === card.dataset.doctorId);
        state.time = "";
        if (!window.matchMedia("(max-width: 760px)").matches) state.step = 3;
        renderDoctors();
        renderCalendar();
        updateStep();
    });

    document.querySelector("#specialty-search").addEventListener("input", (event) => {
        renderSpecialties(event.target.value);
    });

    document.querySelector("#doctor-sort").addEventListener("change", () => {
        state.doctors.reverse();
        renderDoctors();
    });

    calendarDays.addEventListener("click", async (event) => {
        const day = event.target.closest("[data-date]");
        if (!day || day.disabled) return;
        state.date = day.dataset.date;
        state.time = "";
        if (!window.matchMedia("(max-width: 760px)").matches) state.step = 3;
        renderCalendar();
        updateStep();
        await loadTimeSlots();
    });

    timeList.addEventListener("click", (event) => {
        const option = event.target.closest("[data-time]");
        if (!option) return;
        state.time = option.dataset.time;
        timeList.querySelectorAll(".booking-time-option").forEach((button) => {
            button.classList.toggle("is-selected", button === option);
        });
        if (!window.matchMedia("(max-width: 760px)").matches && state.date) {
            state.step = 4;
            updateStep();
        }
    });

    document.querySelectorAll("[data-month-shift]").forEach((button) => {
        button.addEventListener("click", () => {
            state.month.setMonth(state.month.getMonth() + Number(button.dataset.monthShift));
            renderCalendar();
        });
    });

    document.querySelector("[data-booking-next]").addEventListener("click", () => {
        const valid = state.step === 1 ? Boolean(state.specialty)
            : state.step === 2 ? Boolean(state.doctor)
              : state.step === 3 ? Boolean(state.date && state.time)
                : false;

        if (!valid) {
            result.textContent = state.step === 1 ? "Selecciona una especialidad para continuar."
                : state.step === 2 ? "Selecciona un médico para continuar."
                  : "Selecciona una fecha y un horario disponible para continuar.";
            result.classList.add("is-error");
            return;
        }

        state.step = Math.min(4, state.step + 1);
        updateStep();
        if (state.step === 3) {
            if (!state.date) {
                const today = new Date();
                state.date = getDateKey(today);
            }
            renderCalendar();
            loadTimeSlots();
        }
    });

    document.querySelector("[data-booking-back]").addEventListener("click", () => {
        state.step = Math.max(1, state.step - 1);
        updateStep();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!state.specialty || !state.doctor || !state.date || !state.time) return;

        const submitButton = document.querySelector(".booking-submit");
        submitButton.disabled = true;
        submitButton.textContent = "Enviando solicitud...";
        setMessage("#booking-result", "");

        try {
            await getJson("/api/patient/appointments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    specialtyId: state.specialty.id,
                    doctorId: state.doctor.id,
                    date: state.date,
                    time: state.time,
                    reason: document.querySelector("#appointment-reason").value,
                }),
            });
            setMessage("#booking-result", "¡Tu cita quedó solicitada! Puedes consultar su estado en Mis citas.");
            submitButton.textContent = "Solicitud enviada";
        } catch (error) {
            setMessage("#booking-result", error.message, true);
            submitButton.disabled = false;
            submitButton.textContent = "Confirmar cita";
        }
    });

    const sidebar = document.querySelector("#patient-sidebar");
    const menuButton = document.querySelector("[data-toggle-sidebar]");
    const backdrop = document.querySelector("[data-close-sidebar]");

    function toggleSidebar(isOpen) {
        sidebar.classList.toggle("is-open", isOpen);
        backdrop.classList.toggle("is-visible", isOpen);
        menuButton.setAttribute("aria-expanded", String(isOpen));
        document.body.classList.toggle("booking-menu-open", isOpen);
    }

    menuButton.addEventListener("click", () => {
        toggleSidebar(!sidebar.classList.contains("is-open"));
    });
    backdrop.addEventListener("click", () => toggleSidebar(false));
    sidebar.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => toggleSidebar(false));
    });

    renderCalendar();
    loadSpecialties();
}
