const specialtyForm = document.querySelector("[data-specialty-create-form]");

if (specialtyForm) {
    const nameInput = specialtyForm.querySelector('[name="name"]');
    const descriptionInput = specialtyForm.querySelector('[name="description"]');
    const submitButton = specialtyForm.querySelector("[data-specialty-submit]");
    const feedback = specialtyForm.querySelector("[data-specialty-form-feedback]");
    const errorMessage = specialtyForm.querySelector("[data-specialty-form-error]");
    const isEditing = specialtyForm.dataset.mode === "edit";

    specialtyForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorMessage.hidden = true;
        nameInput.removeAttribute("aria-invalid");
        feedback.textContent = "Guardando la especialidad…";
        submitButton.disabled = true;

        try {
            const response = await fetch(specialtyForm.dataset.endpoint, {
                method: isEditing ? "PATCH" : "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    name: nameInput.value,
                    description: descriptionInput.value,
                }),
            });

            let data;
            try {
                data = await response.json();
            } catch {
                throw new Error("No pudimos guardar la especialidad. Inténtalo de nuevo.");
            }
            if (!response.ok) throw new Error(data.message || "Revisa la información ingresada.");

            const query = new URLSearchParams({
                [isEditing ? "updated" : "created"]: "1",
                search: data.specialty.name,
            });
            window.location.assign(`/admin/specialties?${query}`);
        } catch (error) {
            feedback.textContent = "No se guardaron los cambios.";
            errorMessage.textContent = error.message;
            errorMessage.hidden = false;
            if (responseConflict(error)) {
                nameInput.setAttribute("aria-invalid", "true");
                nameInput.focus();
            }
        } finally {
            submitButton.disabled = false;
        }
    });
}

function responseConflict(error) {
    return error.message === "Ya existe una especialidad con ese nombre.";
}
