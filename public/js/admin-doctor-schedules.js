(() => {
    const page = document.querySelector("[data-doctor-schedules]");
    if (!page) return;

    const endpoint = page.dataset.endpoint;
    const filterForm = page.querySelector("[data-schedule-filters]");
    const searchInput = page.querySelector("[data-schedule-search]");
    const doctorSelect = page.querySelector("[data-schedule-doctor]");
    const specialtySelect = page.querySelector("[data-schedule-specialty]");
    const statusSelect = page.querySelector("[data-schedule-status]");
    const weekInput = page.querySelector("[data-schedule-week]");
    const feedback = page.querySelector("[data-schedule-feedback]");
    const errorMessage = page.querySelector("[data-schedule-error]");
    const doctorList = page.querySelector("[data-schedule-doctor-list]");
    const emptyMessage = page.querySelector("[data-schedule-empty]");
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
                                  `<p>${formatTime(block.startTime)} – ${formatTime(block.endTime)}</p>`,
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
        </article>`;
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
            renderSelectOptions(
                doctorSelect,
                data.doctorOptions,
                "Todos los médicos",
                (doctor) => doctor.name,
            );
            renderSelectOptions(
                specialtySelect,
                data.specialtyOptions,
                "Todas las especialidades",
                (specialty) => specialty.name,
            );

            doctorList.innerHTML = data.doctors.map(renderDoctor).join("");
            exceptionsList.innerHTML = data.exceptions.map(renderException).join("");
            exceptionsEmpty.hidden = data.exceptions.length > 0;
            feedback.hidden = true;
            emptyMessage.hidden = data.doctors.length > 0;
        } catch (error) {
            feedback.hidden = true;
            errorMessage.textContent = error.message || "Ocurrió un error al cargar los horarios.";
            errorMessage.hidden = false;
            exceptionsList.replaceChildren();
            exceptionsEmpty.hidden = false;
        }
    }

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

    loadSchedules();
})();
