(() => {
    const rows = [...document.querySelectorAll("[data-appointment]")];
    const homeProfilePhotoDialog = document.querySelector("[data-home-profile-photo]");

    // Open the patient's profile photo from the dashboard profile card.
    document.querySelectorAll("[data-open-home-profile-photo]").forEach((button) => {
        button.addEventListener("click", () => {
            if (homeProfilePhotoDialog instanceof HTMLDialogElement) {
                homeProfilePhotoDialog.showModal();
            }
        });
    });

    homeProfilePhotoDialog?.querySelectorAll("[data-close-home-profile-photo]").forEach((button) => {
        button.addEventListener("click", () => homeProfilePhotoDialog.close());
    });
    homeProfilePhotoDialog?.addEventListener("click", (event) => {
        if (event.target === homeProfilePhotoDialog) homeProfilePhotoDialog.close();
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
                update();
            } catch (error) {
                if (feedbackTitle) feedbackTitle.textContent = "No se pudo cancelar";
                if (feedbackMessage) feedbackMessage.textContent = error.message;
            } finally {
                button.disabled = false;
                if (feedback instanceof HTMLDialogElement) feedback.showModal();
            }
        });
    });

    if (!rows.length) return;
    const tabs = [...document.querySelectorAll("[data-filter]")];
    const search = document.querySelector("[data-search]");
    const specialty = document.querySelector("[data-specialty]");
    const status = document.querySelector("[data-status]");
    const empty = document.querySelector("[data-empty]");
    const summary = document.querySelector("[data-summary]");
    let filter = "all";
    const bogotaDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    const today = bogotaDate.format(new Date());

    function update() {
        let visible = 0;
        rows.forEach((row) => {
            const rowStatus = row.dataset.status;
            const future =
                bogotaDate.format(new Date(row.dataset.date)) >= today &&
                !["Cancelled", "Attended"].includes(rowStatus);
            const tabMatches =
                filter === "all" ||
                (filter === "upcoming" && future) ||
                (filter === "attended" && rowStatus === "Attended") ||
                (filter === "cancelled" && rowStatus === "Cancelled");
            const statusMatches = !status?.value || status.value === rowStatus;
            const specialtyMatches = !specialty?.value || specialty.value === row.dataset.specialty;
            const queryMatches =
                !search?.value ||
                row.dataset.searchText
                    .toLocaleLowerCase()
                    .includes(search.value.trim().toLocaleLowerCase());
            const show = tabMatches && statusMatches && specialtyMatches && queryMatches;
            row.hidden = !show;
            if (show) visible += 1;
        });
        if (empty) empty.hidden = visible !== 0;
        if (summary) summary.textContent = `Mostrando ${visible} de ${rows.length} citas`;
    }
    tabs.forEach((tab) =>
        tab.addEventListener("click", () => {
            filter = tab.dataset.filter;
            tabs.forEach((item) => {
                const active = item === tab;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-pressed", String(active));
            });
            update();
        }),
    );
    [search, specialty, status]
        .filter(Boolean)
        .forEach((control) => control.addEventListener("input", update));
    [specialty, status]
        .filter(Boolean)
        .forEach((control) => control.addEventListener("change", update));
})();
