(() => {
    const settings = document.querySelector("[data-notification-settings]");
    if (!settings) return;

    const channelToggles = [...settings.querySelectorAll("[data-notification-channel-toggle]")];
    const saveButton = settings.querySelector("[data-notification-save]");
    const cancelButton = settings.querySelector("[data-notification-cancel]");
    const saveStatus = settings.querySelector("[data-notification-save-status]");
    const historyToggle = document.querySelector("[data-history-toggle]");
    const historyTable = document.querySelector(".notifications-history-table");
    let preferences = JSON.parse(settings.dataset.preferences || "[]");
    let savedPreferences = structuredClone(preferences);
    let isSaving = false;

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
        return JSON.stringify(preferences) !== JSON.stringify(savedPreferences);
    }

    function render() {
        channelToggles.forEach((toggle) => {
            const channel = toggle.dataset.notificationChannelToggle;
            toggle.checked = preferences.some(
                (preference) => preference.channel === channel && preference.isEnabled,
            );
            toggle.disabled = isSaving;
        });

        saveButton.disabled = isSaving || !isDirty();
        cancelButton.disabled = isSaving || !isDirty();
    }

    channelToggles.forEach((toggle) => {
        toggle.addEventListener("change", () => {
            const channel = toggle.dataset.notificationChannelToggle;
            setChannelPreference(channel, toggle.checked);

            if (!hasActiveChannel(preferences)) {
                setChannelPreference(channel, true);
                saveStatus.textContent = "Mantén al menos un canal activo para recibir avisos sobre tus citas.";
                saveStatus.classList.add("is-error");
                render();
                return;
            }

            saveStatus.textContent = "Tienes cambios sin guardar.";
            saveStatus.classList.remove("is-error");
            render();
        });
    });

    cancelButton.addEventListener("click", () => {
        preferences = structuredClone(savedPreferences);
        saveStatus.textContent = "Se descartaron los cambios.";
        saveStatus.classList.remove("is-error");
        render();
    });

    saveButton.addEventListener("click", async () => {
        if (!isDirty() || isSaving) return;

        isSaving = true;
        saveStatus.textContent = "Guardando preferencias…";
        saveStatus.classList.remove("is-error");
        render();

        try {
            const response = await fetch("/api/patient/notifications/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ preferences }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.message || "No se pudieron guardar tus preferencias.");
            }

            savedPreferences = structuredClone(preferences);
            settings.dataset.preferences = JSON.stringify(savedPreferences);
            saveStatus.textContent = "Preferencias guardadas correctamente.";
            saveStatus.classList.remove("is-error");
        } catch (error) {
            saveStatus.textContent = error.message || "Ocurrió un error al guardar tus preferencias.";
            saveStatus.classList.add("is-error");
        } finally {
            isSaving = false;
            render();
        }
    });

    historyToggle?.addEventListener("click", () => {
        if (!historyTable) return;
        const isExpanded = historyTable.classList.toggle("is-expanded");
        historyToggle.setAttribute("aria-expanded", String(isExpanded));
        historyToggle.textContent = isExpanded ? "Ver menos" : "Ver todas";
    });

    render();
})();
