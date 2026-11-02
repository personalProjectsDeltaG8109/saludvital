(() => {
    const page = document.querySelector("[data-start-consultation-url]");
    const dialog = document.querySelector("[data-start-consultation-dialog]");
    const patientLabel = document.querySelector("[data-start-consultation-patient]");
    const appointmentTimeLabel = document.querySelector("[data-start-consultation-time]");
    const consultationReasonLabel = document.querySelector("[data-start-consultation-reason]");
    const feedback = document.querySelector("[data-start-consultation-feedback]");
    const confirmButton = document.querySelector("[data-confirm-start-consultation]");
    const closeButton = document.querySelector("[data-close-start-consultation]");
    const activeConsultationUrl = page?.dataset.activeConsultationUrl;
    const activeDialog = document.querySelector("[data-active-consultation-dialog]");
    const activeFeedback = activeDialog?.querySelector("[data-active-consultation-feedback]");
    const stayInAgendaButton = activeDialog?.querySelector("[data-stay-in-agenda]");
    const activeConsultationLink = activeDialog?.querySelector(
        "[data-open-active-consultation-link]",
    );

    if (
        !page ||
        !(dialog instanceof HTMLDialogElement) ||
        !patientLabel ||
        !appointmentTimeLabel ||
        !consultationReasonLabel ||
        !feedback ||
        !confirmButton ||
        !(activeDialog instanceof HTMLDialogElement) ||
        !activeFeedback ||
        !stayInAgendaButton ||
        !activeConsultationLink ||
        !activeConsultationUrl
    ) {
        return;
    }

    let selectedAppointmentId = null;

    function closeActiveDialog() {
        if (activeDialog.open) activeDialog.close();
    }

    async function openRelevantDialog() {
        activeFeedback.textContent = "";
        activeConsultationLink.hidden = true;

        try {
            const response = await fetch(activeConsultationUrl, {
                headers: { Accept: "application/json" },
                credentials: "same-origin",
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.message || "No pudimos verificar la consulta activa.");

            if (data.consultationId) {
                activeConsultationLink.href = `/doctor/consultations/${encodeURIComponent(data.consultationId)}`;
                activeConsultationLink.hidden = false;
                activeDialog.showModal();
                stayInAgendaButton.focus();
                return;
            }

            if (selectedAppointmentId) {
                confirmButton.disabled = false;
                confirmButton.textContent = "Iniciar consulta";
                setFeedback("");
                dialog.showModal();
                confirmButton.focus();
                return;
            }

            activeFeedback.textContent =
                "No hay una consulta abierta. Actualiza la agenda para ver su estado actual.";
            activeDialog.showModal();
            stayInAgendaButton.focus();
        } catch (error) {
            activeFeedback.textContent =
                error.message || "No pudimos verificar la consulta abierta. Inténtalo de nuevo.";
            activeDialog.showModal();
            stayInAgendaButton.focus();
        }
    }

    function closeDialog() {
        if (dialog.open) dialog.close();
        selectedAppointmentId = null;
    }

    function setFeedback(message, status = "error") {
        feedback.textContent = message;
        feedback.classList.toggle("text-red-600", status === "error");
        feedback.classList.toggle("text-green-700", status === "success");
    }

    document.addEventListener("click", async (event) => {
        if (!(event.target instanceof Element)) return;
        const activeConsultationButton = event.target.closest("[data-show-active-consultation]");
        if (activeConsultationButton) {
            selectedAppointmentId = null;
            await openRelevantDialog();
            return;
        }
        const button = event.target.closest("[data-start-consultation]");
        if (!button) return;

        selectedAppointmentId = button.dataset.appointmentId;
        patientLabel.textContent = button.dataset.patientName || "Paciente";
        appointmentTimeLabel.textContent = button.dataset.appointmentTime || "";
        consultationReasonLabel.textContent =
            button.dataset.consultationReason || "Consulta médica";
        await openRelevantDialog();
    });

    closeButton?.addEventListener("click", closeDialog);
    stayInAgendaButton.addEventListener("click", closeActiveDialog);

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
                throw new Error(
                    data.message || "No fue posible iniciar la consulta. Inténtalo de nuevo.",
                );
            }

            if (data.consultation?.id) {
                window.location.assign(
                    `/doctor/consultations/${encodeURIComponent(data.consultation.id)}`,
                );
                return;
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
