const editPage = document.querySelector("[data-admin-appointment-edit]");

if (editPage) {
    const form = editPage.querySelector("[data-appointment-edit-form]");
    if (form) {
        const specialtySelect = editPage.querySelector("[data-edit-specialty]");
        const doctorSelect = editPage.querySelector("[data-edit-doctor]");
        const dateInput = editPage.querySelector("[data-edit-date]");
        const timeSelect = editPage.querySelector("[data-edit-time]");
        const feedback = editPage.querySelector("[data-edit-feedback]");
        const error = editPage.querySelector("[data-edit-error]");
        const submitButton = editPage.querySelector("[data-edit-submit]");
        const successDialog = editPage.querySelector("[data-edit-success]");
        const currentSpecialtyId = editPage.dataset.currentSpecialtyId;
        const currentDoctorId = editPage.dataset.currentDoctorId;
        const patientId = editPage.dataset.patientId;

        function setError(message) {
            error.textContent = message || "";
            error.hidden = !message;
        }

        async function requestJson(url, options) {
            const response = await fetch(url, options);
            const contentType = response.headers?.get("content-type") || "application/json";
            const result = contentType.includes("application/json") ? await response.json() : {};
            if (!response.ok || response.redirected || !contentType.includes("application/json")) {
                throw new Error(result.message || "No fue posible completar la solicitud.");
            }
            return result;
        }

        function resetSelect(select, placeholder) {
            select.replaceChildren(new Option(placeholder, ""));
            select.disabled = true;
        }

        function appendOptions(select, items) {
            items.forEach((item) => {
                const option = document.createElement("option");
                option.value = item.id;
                option.textContent = item.name;
                select.append(option);
            });
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
            resetSelect(timeSelect, "Selecciona un horario disponible");
            submitButton.disabled = true;
            if (!specialtySelect.value) {
                resetSelect(doctorSelect, "Selecciona una especialidad primero");
                return;
            }

            try {
                const url = new URL(editPage.dataset.doctorsEndpoint, window.location.origin);
                url.searchParams.set("specialtyId", specialtySelect.value);
                const { doctors } = await requestJson(url);
                resetSelect(
                    doctorSelect,
                    doctors.length ? "Selecciona un médico" : "No hay médicos disponibles",
                );
                appendOptions(doctorSelect, doctors);
                doctorSelect.disabled = doctors.length === 0;
                const selectedDoctor = doctors.some(
                    (doctor) => String(doctor.id) === String(currentDoctorId),
                )
                    ? currentDoctorId
                    : "";
                if (
                    String(specialtySelect.value) === String(currentSpecialtyId) &&
                    selectedDoctor
                ) {
                    doctorSelect.value = selectedDoctor;
                }
                if (
                    !selectedDoctor &&
                    String(specialtySelect.value) === String(currentSpecialtyId)
                ) {
                    doctorSelect.value = "";
                }
            } catch (requestError) {
                resetSelect(doctorSelect, "No se pudieron cargar los médicos");
                setError(requestError.message);
            }
        }

        async function loadAvailability() {
            resetSelect(timeSelect, "Selecciona un horario disponible");
            submitButton.disabled = true;
            if (!specialtySelect.value || !doctorSelect.value || !dateInput.value) return;

            timeSelect.replaceChildren(new Option("Consultando horarios...", ""));
            setError("");
            const url = new URL(editPage.dataset.availabilityEndpoint, window.location.origin);
            url.searchParams.set("patientId", patientId);
            url.searchParams.set("specialtyId", specialtySelect.value);
            url.searchParams.set("doctorId", doctorSelect.value);
            url.searchParams.set("date", dateInput.value);

            try {
                const { times } = await requestJson(url);
                resetSelect(
                    timeSelect,
                    times.length ? "Selecciona un nuevo horario" : "No hay horarios disponibles",
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
                feedback.textContent = times.length
                    ? "Elige la nueva asignación y un horario disponible."
                    : "No hay horarios disponibles para esta selección.";
            } catch (requestError) {
                resetSelect(timeSelect, "No se pudieron consultar los horarios");
                setError(requestError.message);
            }
        }

        async function loadSpecialties() {
            try {
                const { specialties } = await requestJson(editPage.dataset.specialtiesEndpoint);
                resetSelect(specialtySelect, "Selecciona una especialidad");
                appendOptions(specialtySelect, specialties);
                specialtySelect.disabled = specialties.length === 0;
                if (specialties.some((item) => String(item.id) === String(currentSpecialtyId))) {
                    specialtySelect.value = currentSpecialtyId;
                }
                feedback.textContent = "Revisa los datos actuales y selecciona el nuevo horario.";
                await loadDoctors();
                await loadAvailability();
            } catch (requestError) {
                feedback.textContent = "No se pudieron cargar las opciones de edición.";
                setError(requestError.message);
            }
        }

        specialtySelect.addEventListener("change", async () => {
            setError("");
            await loadDoctors();
            await loadAvailability();
        });
        doctorSelect.addEventListener("change", loadAvailability);
        dateInput.addEventListener("change", loadAvailability);
        timeSelect.addEventListener("change", () => {
            submitButton.disabled = !timeSelect.value;
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            setError("");
            if (!form.reportValidity()) return;

            submitButton.disabled = true;
            submitButton.textContent = "Guardando cambios...";
            try {
                const result = await requestJson(editPage.dataset.updateEndpoint, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        specialtyId: specialtySelect.value,
                        doctorId: doctorSelect.value,
                        date: dateInput.value,
                        time: timeSelect.value,
                        reason: form.elements.reason.value,
                    }),
                });
                editPage.querySelector("[data-edit-success-message]").textContent =
                    `${result.message} Número de cita: ${result.appointmentId}.`;
                successDialog.showModal();
            } catch (requestError) {
                setError(requestError.message);
                submitButton.disabled = !timeSelect.value;
            } finally {
                submitButton.textContent = "Guardar cambios";
            }
        });

        dateInput.min = getBogotaDateKey();
        loadSpecialties();
    }
}
