const doctorInvitationPage = document.querySelector("[data-doctor-form]");

if (doctorInvitationPage) {
    const form = doctorInvitationPage.querySelector("[data-form]");
    const feedback = doctorInvitationPage.querySelector("[data-form-feedback]");
    const successPanel = doctorInvitationPage.querySelector("[data-form-success]");
    const successMessage = doctorInvitationPage.querySelector("[data-form-success-message]");
    const submitButton = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const formData = new FormData(form);
        const payload = {
            accountType: "doctor",
            email: String(formData.get("email") || "").trim(),
            specialtyId: Number(formData.get("specialtyId")),
        };

        submitButton.disabled = true;
        feedback.textContent = "Enviando invitación…";

        try {
            const response = await fetch(doctorInvitationPage.dataset.action, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(payload),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.message || "No pudimos enviar la invitación.");
            }

            successMessage.textContent = result.message;
            form.hidden = true;
            doctorInvitationPage.querySelector(".doctor-invitation-help").hidden = true;
            successPanel.hidden = false;
        } catch (error) {
            feedback.textContent = error.message;
            submitButton.disabled = false;
        }
    });
}
