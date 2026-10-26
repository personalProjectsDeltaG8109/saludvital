const bookingPage = document.querySelector("[data-admin-appointment-create]");

if (bookingPage) {
    const form = bookingPage.querySelector("[data-appointment-create-form]");
    const patientSelect = bookingPage.querySelector("[data-booking-patient]");
    const specialtySelect = bookingPage.querySelector("[data-booking-specialty]");
    const doctorSelect = bookingPage.querySelector("[data-booking-doctor]");
    const dateInput = bookingPage.querySelector("[data-booking-date]");
    const timeSelect = bookingPage.querySelector("[data-booking-time]");
    const feedback = bookingPage.querySelector("[data-create-feedback]");
    const error = bookingPage.querySelector("[data-create-error]");
    const submitButton = bookingPage.querySelector("[data-create-submit]");
    const successDialog = bookingPage.querySelector("[data-create-success]");

    function setError(message) {
        error.textContent = message || "";
        error.hidden = !message;
    }

    async function requestJson(url, options) {
        const response = await fetch(url, options);
        const contentType = response.headers?.get("content-type") || "application/json";
        const result = contentType.includes("application/json") ? await response.json() : {};
        if (!response.ok || response.redirected || !contentType.includes("application/json"))
            throw new Error(result.message || "No fue posible completar la solicitud.");
        return result;
    }

    function addOptions(select, items, getLabel) {
        items.forEach((item) => {
            const option = document.createElement("option");
            option.value = item.id;
            option.textContent = getLabel(item);
            select.append(option);
        });
    }

    function resetSelect(select, placeholder) {
        select.replaceChildren(new Option(placeholder, ""));
        select.disabled = true;
    }

    function getBogotaDateKey(date = new Date()) {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Bogota",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(date);
        const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    async function loadDoctors() {
        resetSelect(doctorSelect, "Cargando médicos...");
        resetSelect(timeSelect, "Selecciona una fecha para consultar horarios");
        if (!specialtySelect.value) {
            resetSelect(doctorSelect, "Selecciona una especialidad primero");
            return;
        }

        try {
            const url = new URL(bookingPage.dataset.doctorsEndpoint, window.location.origin);
            url.searchParams.set("specialtyId", specialtySelect.value);
            const { doctors } = await requestJson(url);
            resetSelect(
                doctorSelect,
                doctors.length ? "Selecciona un médico" : "No hay médicos disponibles",
            );
            addOptions(doctorSelect, doctors, (doctor) => doctor.name);
            doctorSelect.disabled = doctors.length === 0;
        } catch (requestError) {
            resetSelect(doctorSelect, "No se pudieron cargar los médicos");
            setError(requestError.message);
        }
    }

    async function loadTimes() {
        dateInput.disabled = !patientSelect.value || !specialtySelect.value || !doctorSelect.value;
        resetSelect(timeSelect, "Selecciona paciente, médico y fecha");
        if (
            !patientSelect.value ||
            !specialtySelect.value ||
            !doctorSelect.value ||
            !dateInput.value
        ) {
            return;
        }

        timeSelect.replaceChildren(new Option("Consultando horarios...", ""));
        setError("");
        const url = new URL(bookingPage.dataset.availabilityEndpoint, window.location.origin);
        url.searchParams.set("patientId", patientSelect.value);
        url.searchParams.set("specialtyId", specialtySelect.value);
        url.searchParams.set("doctorId", doctorSelect.value);
        url.searchParams.set("date", dateInput.value);

        try {
            const { times } = await requestJson(url);
            resetSelect(
                timeSelect,
                times.length ? "Selecciona un horario" : "No hay horarios disponibles",
            );
            times.forEach((time) => {
                const option = document.createElement("option");
                option.value = time;
                option.textContent = new Intl.DateTimeFormat("es-CO", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                    timeZone: "America/Bogota",
                }).format(new Date(`2000-01-01T${time}:00-05:00`));
                timeSelect.append(option);
            });
            timeSelect.disabled = times.length === 0;
        } catch (requestError) {
            resetSelect(timeSelect, "No se pudieron consultar los horarios");
            setError(requestError.message);
        }
    }

    async function loadOptions() {
        try {
            const { patients, specialties } = await requestJson(
                bookingPage.dataset.optionsEndpoint,
            );
            addOptions(patientSelect, patients, (patient) =>
                patient.document ? `${patient.name} · ${patient.document}` : patient.name,
            );
            addOptions(specialtySelect, specialties, (specialty) => specialty.name);
            patientSelect.disabled = patients.length === 0;
            specialtySelect.disabled = specialties.length === 0;
            submitButton.disabled = patients.length === 0 || specialties.length === 0;
            feedback.textContent =
                patients.length && specialties.length
                    ? "Selecciona el paciente, la especialidad y el horario."
                    : "No hay pacientes o especialidades disponibles para crear la cita.";
        } catch (requestError) {
            feedback.textContent = "No se pudieron cargar los datos del formulario.";
            setError(requestError.message);
        }
    }

    patientSelect.addEventListener("change", loadTimes);
    specialtySelect.addEventListener("change", async () => {
        setError("");
        await loadDoctors();
        await loadTimes();
    });
    doctorSelect.addEventListener("change", loadTimes);
    dateInput.addEventListener("change", loadTimes);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        setError("");
        if (!form.reportValidity()) return;

        submitButton.disabled = true;
        submitButton.textContent = "Creando cita...";
        try {
            const result = await requestJson(bookingPage.dataset.createEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patientId: patientSelect.value,
                    specialtyId: specialtySelect.value,
                    doctorId: doctorSelect.value,
                    date: dateInput.value,
                    time: timeSelect.value,
                    reason: form.elements.reason.value,
                }),
            });
            bookingPage.querySelector("[data-success-message]").textContent =
                `${result.message} Número de cita: ${result.appointmentId}.`;
            successDialog.showModal();
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Crear cita";
        }
    });

    dateInput.min = getBogotaDateKey();
    loadOptions();
}
