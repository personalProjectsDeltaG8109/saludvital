(() => {
    const page = document.querySelector("[data-start-consultation-url]");
    const results = document.querySelector("[data-appointments-results]");
    const dialog = document.querySelector("[data-start-consultation-dialog]");
    const patientLabel = document.querySelector("[data-start-consultation-patient]");
    const appointmentTimeLabel = document.querySelector("[data-start-consultation-time]");
    const feedback = document.querySelector("[data-start-consultation-feedback]");
    const confirmButton = document.querySelector("[data-confirm-start-consultation]");
    const closeButton = document.querySelector("[data-close-start-consultation]");

    if (
        !page ||
        !results ||
        !(dialog instanceof HTMLDialogElement) ||
        !patientLabel ||
        !appointmentTimeLabel ||
        !feedback ||
        !confirmButton
    ) {
        return;
    }

    let selectedAppointmentId = null;

    function closeDialog() {
        if (dialog.open) dialog.close();
        selectedAppointmentId = null;
    }

    function setFeedback(message, status = "error") {
        feedback.textContent = message;
        feedback.classList.toggle("text-red-600", status === "error");
        feedback.classList.toggle("text-green-700", status === "success");
    }

    results.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest("[data-start-consultation]");
        if (!button) return;

        selectedAppointmentId = button.dataset.appointmentId;
        patientLabel.textContent = button.dataset.patientName || "Paciente";
        appointmentTimeLabel.textContent = button.dataset.appointmentTime || "";
        confirmButton.disabled = false;
        confirmButton.textContent = "Iniciar consulta";
        setFeedback("");
        dialog.showModal();
        confirmButton.focus();
    });

    closeButton?.addEventListener("click", closeDialog);

    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog();
    });

    confirmButton.addEventListener("click", async () => {
        if (!selectedAppointmentId || confirmButton.disabled) return;

        confirmButton.disabled = true;
        confirmButton.textContent = "Iniciando...";
        setFeedback("");

        try {
            const response = await fetch(
                `${page.dataset.startConsultationUrl}/${encodeURIComponent(selectedAppointmentId)}/start`,
                {
                    method: "POST",
                    headers: { Accept: "application/json" },
                    credentials: "same-origin",
                },
            );
            const isJson = response.headers.get("content-type")?.includes("application/json");
            const data = isJson ? await response.json() : {};

            if (response.redirected) {
                window.location.assign(response.url);
                return;
            }
            if (!response.ok) {
                throw new Error(data.message || "No fue posible iniciar la consulta. Inténtalo de nuevo.");
            }

            confirmButton.textContent = "Consulta iniciada";
            setFeedback("La consulta comenzó correctamente.", "success");
            window.setTimeout(() => window.location.reload(), 900);
        } catch (error) {
            confirmButton.disabled = false;
            confirmButton.textContent = "Iniciar consulta";
            setFeedback(error.message || "Ocurrió un error al iniciar la consulta.");
        }
    });
})();
