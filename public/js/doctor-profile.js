document.querySelectorAll("[data-profile-photo]").forEach((photo) => {
    photo.addEventListener("error", () => {
        photo.classList.add("is-broken");
        const fallback = document.createElement("span");
        fallback.setAttribute("aria-hidden", "true");
        fallback.textContent = photo.closest("[data-profile-avatar]")?.dataset.initials || "M";
        photo.parentElement?.append(fallback);
    });
});

(() => {
    const form = document.querySelector("[data-profile-form]");
    if (!form) return;

    const page = document.querySelector("[data-doctor-profile]");
    const editButton = page.querySelector("[data-profile-edit]");
    const saveButton = form.querySelector("[data-profile-save]");
    const cancelButton = form.querySelector("[data-profile-cancel]");
    const feedback = page.querySelector("[data-profile-feedback]");
    const inputs = [...form.querySelectorAll("[data-profile-input]")];
    const departmentSelect = form.querySelector('[data-profile-location="department"]');
    const citySelect = form.querySelector('[data-profile-location="city"]');

    function showFeedback(message, isError = false) {
        feedback.textContent = message;
        feedback.hidden = !message;
        feedback.classList.toggle("is-error", isError);
        feedback.setAttribute("role", isError ? "alert" : "status");
    }

    function fillSelect(select, options, selectedValue, placeholder) {
        select.replaceChildren(new Option(placeholder, ""));
        for (const option of options) select.add(new Option(option.name, option.code));
        select.value = selectedValue || "";
    }

    async function loadDepartments(selectedCode) {
        const response = await fetch("/api/locations/departments");
        if (!response.ok) throw new Error("No pudimos cargar los departamentos.");
        const result = await response.json();
        fillSelect(departmentSelect, result.data, selectedCode, "Selecciona un departamento");
    }

    async function loadCities(departmentCode, selectedCode = "") {
        citySelect.disabled = !departmentCode;
        const cities = departmentCode
            ? await fetch(
                  `/api/locations/departments/${encodeURIComponent(departmentCode)}/municipalities`,
              )
            : null;
        if (cities && !cities.ok) throw new Error("No pudimos cargar los municipios.");
        const result = cities ? await cities.json() : { data: [] };
        fillSelect(citySelect, result.data, selectedCode, "Selecciona un municipio");
    }

    function setEditing(isEditing) {
        for (const input of inputs) {
            const display = page.querySelector(`[data-profile-value="${input.name}"]`);
            input.hidden = !isEditing;
            input.disabled = !isEditing || (input === citySelect && !departmentSelect.value);
            if (display) display.hidden = isEditing;
        }
        editButton.hidden = isEditing;
        editButton.setAttribute("aria-expanded", String(isEditing));
        saveButton.hidden = !isEditing;
        cancelButton.hidden = !isEditing;
    }

    function resetInputs() {
        for (const input of inputs) {
            if (input === departmentSelect || input === citySelect) {
                input.value = input.dataset.selectedCode || "";
            } else {
                input.value = input.dataset.originalValue || "";
            }
        }
    }

    function updateDisplayedProfile(profile) {
        for (const field of [
            ...profile.personalInformation,
            ...profile.address,
            ...profile.contact,
        ]) {
            if (!field.fieldName) continue;
            page.querySelectorAll(`[data-profile-value="${field.fieldName}"]`).forEach(
                (display) => {
                    display.textContent = field.value;
                },
            );
        }
        page.querySelector("[data-profile-summary-phone]").textContent =
            profile.editableFields.phone || "No registrado";

        for (const input of inputs) {
            const value = profile.editableFields[input.name] || "";
            if (input === departmentSelect || input === citySelect) {
                input.dataset.selectedCode = value;
            } else {
                input.dataset.originalValue = value;
                input.value = value;
            }
        }
    }

    inputs.forEach((input) => {
        if (input !== departmentSelect && input !== citySelect) {
            input.dataset.originalValue = input.value;
        }
    });
    departmentSelect.dataset.selectedCode = departmentSelect.dataset.selectedCode || "";
    citySelect.dataset.selectedCode = citySelect.dataset.selectedCode || "";

    editButton.addEventListener("click", async () => {
        showFeedback("");
        try {
            await loadDepartments(departmentSelect.dataset.selectedCode);
            await loadCities(departmentSelect.value, citySelect.dataset.selectedCode);
            resetInputs();
            setEditing(true);
            inputs.find((input) => input.name === "phone")?.focus();
        } catch (error) {
            showFeedback(error.message, true);
        }
    });

    departmentSelect.addEventListener("change", async () => {
        try {
            await loadCities(departmentSelect.value);
        } catch (error) {
            showFeedback(error.message, true);
        }
    });

    cancelButton.addEventListener("click", () => {
        resetInputs();
        setEditing(false);
        showFeedback("");
        editButton.focus();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        saveButton.disabled = true;
        saveButton.textContent = "Guardando...";
        showFeedback("");

        try {
            const payload = Object.fromEntries(new FormData(form).entries());
            const response = await fetch("/api/doctor/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "No pudimos guardar los cambios.");

            updateDisplayedProfile(result.profile);
            setEditing(false);
            showFeedback(result.message);
            editButton.focus();
        } catch (error) {
            showFeedback(error.message || "Ocurrió un error al guardar los cambios.", true);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = "Guardar cambios";
        }
    });
})();
