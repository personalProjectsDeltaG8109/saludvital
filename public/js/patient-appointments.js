(() => {
    const doctorPhotoDialog = document.querySelector("[data-doctor-photo-viewer]");
    const doctorPhotoImage = doctorPhotoDialog?.querySelector("[data-doctor-photo-viewer-image]");

    // Show a selected doctor's portrait in the shared centered photo viewer.
    document.querySelectorAll("[data-open-doctor-photo]").forEach((button) => {
        button.addEventListener("click", () => {
            if (!(doctorPhotoDialog instanceof HTMLDialogElement) || !doctorPhotoImage) return;

            doctorPhotoImage.src = button.dataset.openDoctorPhoto;
            doctorPhotoImage.alt = `Foto de ${button.dataset.doctorName || "médico"}`;
            doctorPhotoDialog.showModal();
        });
    });

    doctorPhotoDialog?.querySelectorAll("[data-close-doctor-photo-viewer]").forEach((button) => {
        button.addEventListener("click", () => doctorPhotoDialog.close());
    });
    doctorPhotoDialog?.addEventListener("click", (event) => {
        if (event.target === doctorPhotoDialog) doctorPhotoDialog.close();
    });

    // Open appointment details on both the dashboard and appointments page.
    document.querySelectorAll("[data-open-appointment-details]").forEach((button) => {
        button.addEventListener("click", () => {
            const dialog = document.getElementById(
                `appointment-details-${button.dataset.openAppointmentDetails}`,
            );
            if (dialog instanceof HTMLDialogElement) dialog.showModal();
        });
    });

    // Explain why the next appointment cannot be rescheduled without navigating away.
    document.querySelectorAll("[data-open-reschedule-unavailable]").forEach((button) => {
        button.addEventListener("click", () => {
            const dialog = document.getElementById(
                `reschedule-unavailable-${button.dataset.openRescheduleUnavailable}`,
            );
            if (dialog instanceof HTMLDialogElement) dialog.showModal();
        });
    });

    // Close detail dialogs from their controls or by clicking the backdrop.
    document.querySelectorAll(".appointment-details-dialog").forEach((dialog) => {
        dialog.querySelectorAll("[data-close-appointment-details]").forEach((button) => {
            button.addEventListener("click", () => dialog.close());
        });
        dialog.addEventListener("click", (event) => {
            if (event.target === dialog) dialog.close();
        });
    });

    // Open the cancellation confirmation dialog for the selected appointment.
    document.querySelectorAll("[data-open-cancel-dialog]").forEach((button) => {
        button.addEventListener("click", () => {
            const dialog = document.getElementById(
                `appointment-cancel-${button.dataset.openCancelDialog}`,
            );
            if (dialog instanceof HTMLDialogElement) dialog.showModal();
        });
    });

    // Close cancellation confirmation and feedback dialogs from their controls or backdrop.
    document
        .querySelectorAll(".appointment-cancel-dialog, .appointment-feedback-dialog")
        .forEach((dialog) => {
            dialog
                .querySelectorAll("[data-close-cancel-dialog], [data-close-feedback]")
                .forEach((button) => {
                    button.addEventListener("click", () => dialog.close());
                });
            dialog.addEventListener("click", (event) => {
                if (event.target === dialog) dialog.close();
            });
            dialog.addEventListener("close", () => {
                if (dialog.dataset.reloadOnClose === "true") window.location.reload();
            });
        });

    // Submit cancellation requests and reflect the saved status without leaving the page.
    document.querySelectorAll("[data-cancel-appointment]").forEach((button) => {
        button.addEventListener("click", async () => {
            const appointmentId = button.dataset.cancelAppointment;
            const confirmation = document.getElementById(`appointment-cancel-${appointmentId}`);
            const feedback = document.getElementById("appointment-feedback");
            const feedbackTitle = document.getElementById("appointment-feedback-title");
            const feedbackMessage = document.querySelector("[data-appointment-feedback-message]");
            button.disabled = true;

            try {
                const response = await fetch(`/api/patient/appointments/${appointmentId}/cancel`, {
                    method: "POST",
                    headers: { Accept: "application/json" },
                    credentials: "same-origin",
                });
                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.message || "No fue posible cancelar la cita.");
                }

                const row = document.getElementById(`appointment-${appointmentId}`);
                if (row) {
                    row.dataset.status = "Cancelled";
                    const statusBadge = row.querySelector(
                        "td[data-label='Estado'] .appointment-status",
                    );
                    if (statusBadge) {
                        statusBadge.className = "appointment-status status-cancelled";
                        statusBadge.textContent = "Cancelada";
                    }
                    row.querySelector(".appointment-row-actions")
                        ?.querySelectorAll(
                            ".appointment-reschedule-link, .appointment-cancel-button",
                        )
                        .forEach((action) => action.remove());
                    const detailStatus = row.querySelector(
                        ".appointment-details-dialog .appointment-dialog-status .appointment-status",
                    );
                    if (detailStatus) {
                        detailStatus.className = "appointment-status status-cancelled";
                        detailStatus.textContent = "Cancelada";
                    }
                    const historyList = row.querySelector(".appointment-history");
                    if (historyList) {
                        const historyEntry = document.createElement("li");
                        historyEntry.textContent =
                            "Cita cancelada; el registro y su historial se conservaron.";
                        historyList.append(historyEntry);
                    }
                }

                if (confirmation instanceof HTMLDialogElement) confirmation.close();
                if (feedbackTitle) feedbackTitle.textContent = "Cita cancelada";
                if (feedbackMessage) feedbackMessage.textContent = result.message;
                if (feedback instanceof HTMLDialogElement) {
                    feedback.dataset.reloadOnClose = "true";
                }
            } catch (error) {
                if (feedbackTitle) feedbackTitle.textContent = "No se pudo cancelar";
                if (feedbackMessage) feedbackMessage.textContent = error.message;
            } finally {
                button.disabled = false;
                if (feedback instanceof HTMLDialogElement) feedback.showModal();
            }
        });
    });

    const filterForm = document.getElementById("appointment-filters");
    if (!(filterForm instanceof HTMLFormElement)) return;

    const tabs = [...document.querySelectorAll("[data-filter]")];
    const search = document.querySelector("[data-search]");
    tabs.forEach((tab) =>
        tab.addEventListener("click", () => {
            filterForm.querySelector("[data-active-filter]").value = tab.dataset.filter;
            filterForm.requestSubmit();
        }),
    );
    filterForm
        .querySelectorAll("select")
        .forEach((control) => control.addEventListener("change", () => filterForm.requestSubmit()));

    let searchTimeout;
    search?.addEventListener("input", () => {
        window.clearTimeout(searchTimeout);
        searchTimeout = window.setTimeout(() => filterForm.requestSubmit(), 300);
    });
})();
