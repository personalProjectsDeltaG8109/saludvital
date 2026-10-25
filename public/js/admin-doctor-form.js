const doctorFormPage = document.querySelector("[data-doctor-form]");

if (doctorFormPage) {
    const form = doctorFormPage.querySelector("[data-form]");
    const feedback = doctorFormPage.querySelector("[data-form-feedback]");
    const successPanel = doctorFormPage.querySelector("[data-form-success]");
    const successMessage = doctorFormPage.querySelector("[data-form-success-message]");
    const submitButton = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        payload.specialtyId = Number(payload.specialtyId);
        submitButton.disabled = true;
        feedback.textContent = "Guardando…";

        try {
            const response = await fetch(doctorFormPage.dataset.action, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const result = await response.json().catch(() => ({
                message: "No se pudo completar el registro. Inténtalo de nuevo.",
            }));

            if (!response.ok) throw new Error(result.message || "No se pudo crear el médico.");

            successMessage.textContent = result.message;
            form.reset();
            form.hidden = true;
            successPanel.hidden = false;
        } catch (error) {
            feedback.textContent = error.message;
            submitButton.disabled = false;
        }
    });
}
