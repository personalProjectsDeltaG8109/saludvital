(() => {
    const settings = document.querySelector("[data-notification-settings]");
    if (!settings) return;

    const channelToggles = [...settings.querySelectorAll("[data-notification-channel-toggle]")];
    const contactInputs = [...settings.querySelectorAll("[data-notification-contact]")];
    const saveButton = settings.querySelector("[data-notification-save]");
    const cancelButton = settings.querySelector("[data-notification-cancel]");
    const saveStatus = settings.querySelector("[data-notification-save-status]");
    const confirmDialog = settings.querySelector("[data-notification-confirm-dialog]");
    const confirmSummary = settings.querySelector("[data-notification-confirm-summary]");
    const confirmSaveButton = settings.querySelector("[data-confirm-notification-save]");
    const cancelSaveButton = settings.querySelector("[data-cancel-notification-save]");
    const resultDialog = settings.querySelector("[data-notification-result-dialog]");
    const resultIcon = settings.querySelector("[data-notification-result-icon]");
    const resultTitle = settings.querySelector("[data-notification-result-title]");
    const resultMessage = settings.querySelector("[data-notification-result-message]");
    const closeResultButton = settings.querySelector("[data-close-notification-result]");
    const historyTable = document.querySelector(".notifications-history-table");
    const historyRows = [...(historyTable?.querySelectorAll("[data-history-row]") || [])];
    const historyCount = document.querySelector("[data-history-count]");
    const historyPagination = document.querySelector("[data-history-pagination]");
    const historyPageSummary = document.querySelector("[data-history-page-summary]");
    const historyPageNumber = document.querySelector("[data-history-page-number]");
    const historyPrevious = document.querySelector("[data-history-previous]");
    const historyNext = document.querySelector("[data-history-next]");
    const markAllReadButton = document.querySelector("[data-mark-all-read]");
    const appointmentDetailsDialog = document.querySelector("[data-appointment-details-dialog]");
    const historyPageSize = 10;
    let historyPage = 1;
    let preferences = JSON.parse(settings.dataset.preferences || "[]");
    let savedPreferences = structuredClone(preferences);
    let savedContacts = getContacts();
    let isSaving = false;

    function getContacts() {
        return Object.fromEntries(
            contactInputs.map((input) => [input.dataset.notificationContact, input.value.trim()]),
        );
    }

    function setChannelPreference(channel, isEnabled) {
        // Each channel controls every fixed appointment notice independently.
        preferences
            .filter((preference) => preference.channel === channel)
            .forEach((preference) => {
                preference.isEnabled = isEnabled;
            });
    }

    function hasActiveChannel(preferenceList) {
        return channelToggles.some((toggle) =>
            preferenceList.some(
                (preference) =>
                    preference.channel === toggle.dataset.notificationChannelToggle &&
                    preference.isEnabled,
            ),
        );
    }

    function isDirty() {
        return (
            JSON.stringify(preferences) !== JSON.stringify(savedPreferences) ||
            JSON.stringify(getContacts()) !== JSON.stringify(savedContacts)
        );
    }

    function render() {
        channelToggles.forEach((toggle) => {
            const channel = toggle.dataset.notificationChannelToggle;
            toggle.checked = preferences.some(
                (preference) => preference.channel === channel && preference.isEnabled,
            );
            toggle.disabled = isSaving;
        });
        contactInputs.forEach((input) => {
            input.disabled = isSaving;
        });

        saveButton.disabled = isSaving || !isDirty();
        cancelButton.disabled = isSaving || !isDirty();
        confirmSaveButton.disabled = isSaving;
    }

    function showResult(success, message) {
        resultIcon.textContent = success ? "✓" : "!";
        resultIcon.classList.toggle("is-error", !success);
        resultTitle.textContent = success
            ? "Cambios guardados"
            : "No se pudieron guardar los cambios";
        resultMessage.textContent = message;
        resultDialog.showModal();
    }

    function describePendingChanges() {
        const channelLabels = channelToggles
            .filter((toggle) => toggle.checked)
            .map(
                (toggle) =>
                    toggle.closest(".notifications-channel").querySelector("strong").textContent,
            );
        const contacts = getContacts();
        confirmSummary.textContent =
            "Canales activos: " +
            channelLabels.join(", ") +
            ". Número para SMS: " +
            contacts.smsPhone +
            ". Número para WhatsApp: " +
            contacts.whatsappPhone +
            ". Correo de notificaciones: " +
            contacts.email +
            ".";
    }

    async function savePreferences() {
        if (!hasActiveChannel(preferences)) {
            showResult(
                false,
                "Mantén al menos un canal activo para recibir avisos sobre tus citas.",
            );
            return;
        }

        isSaving = true;
        saveStatus.textContent = "Guardando preferencias…";
        saveStatus.classList.remove("is-error");
        render();

        try {
            const response = await fetch("/api/patient/notifications/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ preferences, contacts: getContacts() }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.message || "No se pudieron guardar tus preferencias.");
            }

            savedPreferences = structuredClone(preferences);
            savedContacts = getContacts();
            settings.dataset.preferences = JSON.stringify(savedPreferences);
            saveStatus.textContent = "Preferencias guardadas correctamente.";
            saveStatus.classList.remove("is-error");
            showResult(true, "Se guardaron tus canales y destinos de notificación.");
        } catch (error) {
            saveStatus.textContent =
                error.message || "Ocurrió un error al guardar tus preferencias.";
            saveStatus.classList.add("is-error");
            showResult(false, saveStatus.textContent);
        } finally {
            isSaving = false;
            render();
        }
    }

    channelToggles.forEach((toggle) => {
        toggle.addEventListener("change", () => {
            const channel = toggle.dataset.notificationChannelToggle;
            setChannelPreference(channel, toggle.checked);

            if (!hasActiveChannel(preferences)) {
                setChannelPreference(channel, true);
                saveStatus.textContent =
                    "Mantén al menos un canal activo para recibir avisos sobre tus citas.";
                saveStatus.classList.add("is-error");
                render();
                return;
            }

            saveStatus.textContent = "Tienes cambios sin guardar.";
            saveStatus.classList.remove("is-error");
            render();
        });
    });

    contactInputs.forEach((input) => {
        input.addEventListener("input", () => {
            saveStatus.textContent = "Tienes cambios sin guardar.";
            saveStatus.classList.remove("is-error");
            render();
        });
    });

    saveButton.addEventListener("click", () => {
        const invalidInput = contactInputs.find((input) => !input.checkValidity());
        if (invalidInput) {
            invalidInput.reportValidity();
            return;
        }

        describePendingChanges();
        confirmDialog.showModal();
    });

    confirmSaveButton.addEventListener("click", () => {
        confirmDialog.close();
        savePreferences();
    });

    cancelSaveButton.addEventListener("click", () => confirmDialog.close());
    closeResultButton.addEventListener("click", () => resultDialog.close());

    [confirmDialog, resultDialog].forEach((dialog) => {
        dialog.addEventListener("click", (event) => {
            if (event.target === dialog) dialog.close();
        });
    });

    cancelButton.addEventListener("click", () => {
        preferences = structuredClone(savedPreferences);
        contactInputs.forEach((input) => {
            input.value = savedContacts[input.dataset.notificationContact];
        });
        saveStatus.textContent = "Se descartaron los cambios.";
        saveStatus.classList.remove("is-error");
        render();
    });

    const readStatus = document.querySelector("[data-notification-read-status]");

    async function markRowsAsRead(rows, appointmentHistoryIds = []) {
        const unreadRows = rows.filter((row) => row.classList.contains("is-unread"));
        const ids = unreadRows
            .map((row) => Number(row.dataset.notificationId))
            .filter(Number.isSafeInteger);
        const unreadHistoryIds = unreadRows
            .map((row) => Number(row.dataset.appointmentHistoryId))
            .filter(Number.isSafeInteger);
        const historyIds = [...new Set([...appointmentHistoryIds, ...unreadHistoryIds])];
        if (!ids.length && !historyIds.length) return;

        try {
            const response = await fetch("/api/patient/notifications/read", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ notificationIds: ids, appointmentHistoryIds: historyIds }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.message || "No se pudieron actualizar las notificaciones.");
            }
            unreadRows.forEach((row) => {
                row.classList.remove("is-unread");
                row.querySelector(".notifications-unread-label")?.remove();
                row.querySelector("[data-mark-notification-read]")?.remove();
            });
            renderHistoryPage();
            updateNotificationBell(payload.data.unreadCount);
            if (readStatus) readStatus.textContent = "Notificaciones marcadas como leídas.";
        } catch {
            if (readStatus) {
                readStatus.textContent =
                    "No se pudo actualizar el estado de lectura. Inténtalo de nuevo.";
            }
        }
    }

    async function loadAppointmentDetails(row) {
        const historyId = Number(row.dataset.appointmentHistoryId);
        const status = appointmentDetailsDialog.querySelector("[data-appointment-details-status]");
        const title = appointmentDetailsDialog.querySelector("[data-appointment-details-title]");
        const doctorName = appointmentDetailsDialog.querySelector("[data-appointment-doctor-name]");
        const photo = appointmentDetailsDialog.querySelector("[data-appointment-doctor-photo]");
        const photoPlaceholder = appointmentDetailsDialog.querySelector(
            "[data-appointment-doctor-placeholder]",
        );
        const fields = {
            specialty: appointmentDetailsDialog.querySelector("[data-appointment-specialty]"),
            schedule: appointmentDetailsDialog.querySelector("[data-appointment-schedule]"),
            appointmentStatus: appointmentDetailsDialog.querySelector("[data-appointment-status]"),
            occurredAt: appointmentDetailsDialog.querySelector("[data-appointment-occurred-at]"),
            message: appointmentDetailsDialog.querySelector("[data-appointment-message]"),
        };
        const factRows = Object.fromEntries(
            [...appointmentDetailsDialog.querySelectorAll("[data-appointment-fact]")].map(
                (fact) => [fact.dataset.appointmentFact, fact],
            ),
        );
        const occurredAtLabel = appointmentDetailsDialog.querySelector(
            "[data-appointment-occurred-label]",
        );

        status.textContent = "Cargando el detalle de la cita…";
        title.textContent =
            row.querySelector(".notifications-history-kind")?.textContent.trim() ||
            "Detalle de la cita";
        doctorName.textContent = "";
        photo.hidden = true;
        photo.removeAttribute("src");
        photoPlaceholder.hidden = false;
        Object.values(fields).forEach((field) => (field.textContent = "—"));
        Object.values(factRows).forEach((fact) => (fact.hidden = false));
        occurredAtLabel.textContent = "Fecha del aviso";
        appointmentDetailsDialog.showModal();

        if (row.dataset.inAppActivity !== "true") {
            doctorName.textContent = "Actualización de SaludVital";
            photoPlaceholder.hidden = true;
            factRows.specialty.hidden = true;
            factRows.schedule.hidden = true;
            factRows.status.hidden = true;
            fields.occurredAt.textContent = formatDate(row.dataset.historyDate);
            fields.message.textContent = row.dataset.historyDetails || "—";
            status.textContent = "Detalle cargado.";
            if (row.classList.contains("is-unread")) await markRowsAsRead([row]);
            return;
        }

        doctorName.textContent = "Cargando información del médico…";
        fields.message.textContent = row.dataset.historyDetails || "—";
        occurredAtLabel.textContent = "Actividad registrada";
        try {
            const response = await fetch(
                `/api/patient/notifications/appointment-activity/${historyId}`,
                {
                    headers: { Accept: "application/json" },
                    credentials: "same-origin",
                },
            );
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.message || "No se pudo cargar el detalle de la cita.");
            }

            const details = payload.data;
            title.textContent = details.eventLabel;
            doctorName.textContent = details.doctor.name;
            fields.specialty.textContent = details.specialty;
            fields.schedule.textContent = formatDate(details.appointmentStartAt);
            fields.appointmentStatus.textContent = details.appointmentStatus;
            fields.occurredAt.textContent = formatDate(details.occurredAt);
            fields.message.textContent = row.dataset.historyDetails || details.eventLabel;
            if (details.doctor.photoUrl) {
                photo.src = details.doctor.photoUrl;
                photo.alt = `Foto de ${details.doctor.name}`;
                photo.hidden = false;
                photoPlaceholder.hidden = true;
            }
            status.textContent = "Detalle cargado.";
            if (row.classList.contains("is-unread")) await markRowsAsRead([row], [historyId]);
        } catch (error) {
            status.textContent = error.message || "No se pudo cargar el detalle de la cita.";
        }
    }

    function formatDate(value) {
        if (!value) return "Horario no disponible";
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? "Fecha no disponible"
            : date.toLocaleString("es-CO", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "America/Bogota",
              });
    }

    function updateNotificationBell(unreadCount) {
        const bell = document.querySelector(".sv-bell");
        let count = bell?.querySelector(".sv-notification-count");
        if (!bell) return;
        bell.setAttribute(
            "aria-label",
            unreadCount ? `Notificaciones, ${unreadCount} sin leer` : "Notificaciones",
        );
        if (unreadCount > 0 && !count) {
            count = document.createElement("span");
            count.className = "sv-notification-count";
            bell.append(count);
        }
        if (!unreadCount) count?.remove();
        else count.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    }

    function renderHistoryPage() {
        const pageCount = Math.max(1, Math.ceil(historyRows.length / historyPageSize));
        historyPage = Math.min(historyPage, pageCount);
        const start = (historyPage - 1) * historyPageSize;
        const visibleRows = historyRows.slice(start, start + historyPageSize);
        historyTable?.querySelectorAll("[data-history-day-heading]").forEach((heading) => {
            heading.remove();
        });
        historyRows.forEach((row, index) => {
            row.hidden = index < start || index >= start + historyPageSize;
        });
        let currentDay = "";
        visibleRows.forEach((row) => {
            const day = row.dataset.historyDay;
            if (day !== currentDay) {
                const heading = document.createElement("tr");
                heading.className = "notifications-history-day-heading";
                heading.dataset.historyDayHeading = "true";
                const label = document.createElement("th");
                label.colSpan = 3;
                label.scope = "colgroup";
                label.textContent = day;
                heading.append(label);
                row.before(heading);
                currentDay = day;
            }
        });
        if (historyCount) {
            historyCount.textContent = `${historyRows.length} ${historyRows.length === 1 ? "notificación" : "notificaciones"}`;
        }
        if (markAllReadButton) {
            markAllReadButton.disabled = !historyRows.some((row) =>
                row.classList.contains("is-unread"),
            );
        }
        if (!historyPagination || !historyRows.length) return;
        const end = Math.min(start + historyPageSize, historyRows.length);
        historyPagination.hidden = historyRows.length <= historyPageSize;
        historyPageSummary.textContent = `Mostrando ${start + 1}–${end} de ${historyRows.length}`;
        historyPageNumber.textContent = `Página ${historyPage} de ${pageCount}`;
        historyPrevious.disabled = historyPage === 1;
        historyNext.disabled = historyPage === pageCount;
    }

    historyPrevious?.addEventListener("click", () => {
        if (historyPage > 1) {
            historyPage -= 1;
            renderHistoryPage();
        }
    });
    historyNext?.addEventListener("click", () => {
        const pageCount = Math.ceil(historyRows.length / historyPageSize);
        if (historyPage < pageCount) {
            historyPage += 1;
            renderHistoryPage();
        }
    });

    markAllReadButton?.addEventListener("click", async () => {
        markAllReadButton.disabled = true;
        try {
            const response = await fetch("/api/patient/notifications/read-all", {
                method: "PATCH",
                headers: { Accept: "application/json" },
                credentials: "same-origin",
            });
            const payload = await response.json();
            if (!response.ok || !payload.success)
                throw new Error("No se pudieron marcar como leídas.");
            historyTable?.querySelectorAll("tr.is-unread").forEach((row) => {
                row.classList.remove("is-unread");
                row.querySelector(".notifications-unread-label")?.remove();
                row.querySelector("[data-mark-notification-read]")?.remove();
            });
            renderHistoryPage();
            updateNotificationBell(payload.data.unreadCount);
            if (readStatus)
                readStatus.textContent = "Todas las notificaciones están marcadas como leídas.";
        } catch (error) {
            if (readStatus) readStatus.textContent = error.message;
        } finally {
            renderHistoryPage();
        }
    });

    historyTable?.addEventListener("click", (event) => {
        const row = event.target.closest("[data-history-row]");
        if (!row) return;
        loadAppointmentDetails(row);
    });
    historyTable?.addEventListener("keydown", (event) => {
        const row = event.target.closest("[data-history-row]");
        if (!row || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        loadAppointmentDetails(row);
    });

    appointmentDetailsDialog
        ?.querySelectorAll("[data-close-appointment-details]")
        .forEach((button) => {
            button.addEventListener("click", () => appointmentDetailsDialog.close());
        });
    appointmentDetailsDialog?.addEventListener("click", (event) => {
        if (event.target === appointmentDetailsDialog) appointmentDetailsDialog.close();
    });

    render();
    renderHistoryPage();
})();
