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
    const historyToggle = document.querySelector("[data-history-toggle]");
    const historyTable = document.querySelector(".notifications-history-table");
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

    async function markRowsAsRead(rows) {
        const unreadRows = rows.filter((row) => row.classList.contains("is-unread"));
        const ids = unreadRows.map((row) => Number(row.dataset.notificationId));
        if (!ids.length) return;

        try {
            const response = await fetch("/api/patient/notifications/read", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ ids }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.message || "No se pudieron actualizar las notificaciones.");
            }
            unreadRows.forEach((row) => row.classList.remove("is-unread"));
            updateNotificationBell(payload.data.unreadCount);
            if (readStatus) readStatus.textContent = "Notificaciones marcadas como leídas.";
        } catch {
            if (readStatus) {
                readStatus.textContent =
                    "No se pudo actualizar el estado de lectura. Inténtalo de nuevo.";
            }
        }
    }

    function updateNotificationBell(unreadCount) {
        const bell = document.querySelector(".sv-bell");
        const count = bell?.querySelector("span");
        if (!bell) return;
        bell.setAttribute(
            "aria-label",
            unreadCount ? `Notificaciones, ${unreadCount} sin leer` : "Notificaciones",
        );
        if (count) {
            count.textContent = unreadCount ? String(unreadCount) : "";
            count.hidden = unreadCount === 0;
        }
    }

    historyToggle?.addEventListener("click", async () => {
        if (!historyTable) return;
        const isExpanded = historyTable.classList.toggle("is-expanded");
        historyToggle.setAttribute("aria-expanded", String(isExpanded));
        historyToggle.textContent = isExpanded ? "Ver menos" : "Ver todas";
        if (isExpanded) {
            await markRowsAsRead([...historyTable.querySelectorAll("tr[data-notification-id]")]);
        }
    });

    render();
})();
