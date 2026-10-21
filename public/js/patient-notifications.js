(() => {
    const settings = document.querySelector("[data-notification-settings]");
    if (!settings) return;

    const channelToggles = [...settings.querySelectorAll("[data-notification-channel-toggle]")];
    const eventToggles = [...settings.querySelectorAll("[data-notification-event-toggle]")];
    const saveStatus = settings.querySelector("[data-notification-save-status]");
    const historyToggle = document.querySelector("[data-history-toggle]");
    const historyTable = document.querySelector(".notifications-history-table");
    let preferences = JSON.parse(settings.dataset.preferences || "[]");
    let savedPreferences = structuredClone(preferences);
    let saveTimeout;

    const findPreference = (channel, eventType) =>
        preferences.find((item) => item.channel === channel && item.eventType === eventType);

    function syncEventToggles() {
        eventToggles.forEach((toggle) => {
            const eventType = toggle.dataset.notificationEventToggle;
            const eventPreferences = preferences.filter((item) => item.eventType === eventType);
            toggle.checked = eventPreferences.some((item) => item.isEnabled);
        });
    }

    function syncChannelToggles() {
        channelToggles.forEach((toggle) => {
            const channel = toggle.dataset.notificationChannelToggle;
            toggle.checked = preferences.some((item) => item.channel === channel && item.isEnabled);
        });
    }

    function updatePreference(channel, eventType, isEnabled) {
        const preference = findPreference(channel, eventType);
        if (preference) preference.isEnabled = isEnabled;
    }

    function applyChannelToggle(toggle) {
        const channel = toggle.dataset.notificationChannelToggle;
        const eventTogglesState = new Map(
            eventToggles.map((eventToggle) => [
                eventToggle.dataset.notificationEventToggle,
                eventToggle.checked,
            ]),
        );
        preferences
            .filter((item) => item.channel === channel)
            .forEach((preference) => {
                const eventToggleState = eventTogglesState.get(preference.eventType);
                preference.isEnabled = toggle.checked
                    ? (eventToggleState ?? preference.isEnabled)
                    : false;
            });

        if (
            toggle.checked &&
            preferences.filter((item) => item.channel === channel).every((item) => !item.isEnabled)
        ) {
            preferences
                .filter((item) => item.channel === channel)
                .forEach((preference) => {
                    preference.isEnabled = preference.eventType !== "promotion";
                });
        }
    }

    function applyEventToggle(toggle) {
        const eventType = toggle.dataset.notificationEventToggle;
        const enabledChannels = new Set(
            channelToggles
                .filter((channelToggle) => channelToggle.checked)
                .map((channelToggle) => channelToggle.dataset.notificationChannelToggle),
        );
        const targetChannels = enabledChannels.size
            ? enabledChannels
            : new Set(
                  channelToggles.map(
                      (channelToggle) => channelToggle.dataset.notificationChannelToggle,
                  ),
              );

        targetChannels.forEach((channel) => updatePreference(channel, eventType, toggle.checked));
        syncChannelToggles();
    }

    async function savePreferences() {
        saveStatus.textContent = "Guardando preferencias…";
        saveStatus.classList.remove("is-error");

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
            saveStatus.textContent = "Preferencias guardadas.";
        } catch (error) {
            preferences = savedPreferences;
            settings.dataset.preferences = JSON.stringify(preferences);
            syncChannelToggles();
            syncEventToggles();
            saveStatus.textContent =
                error.message || "Ocurrió un error al guardar tus preferencias.";
            saveStatus.classList.add("is-error");
        }
    }

    function scheduleSave() {
        window.clearTimeout(saveTimeout);
        saveStatus.textContent = "";
        saveTimeout = window.setTimeout(savePreferences, 250);
    }

    channelToggles.forEach((toggle) => {
        toggle.addEventListener("change", () => {
            applyChannelToggle(toggle);
            syncEventToggles();
            scheduleSave();
        });
    });

    eventToggles.forEach((toggle) => {
        toggle.addEventListener("change", () => {
            applyEventToggle(toggle);
            syncEventToggles();
            scheduleSave();
        });
    });

    historyToggle?.addEventListener("click", () => {
        if (!historyTable) return;
        const isExpanded = historyTable.classList.toggle("is-expanded");
        historyToggle.setAttribute("aria-expanded", String(isExpanded));
        historyToggle.textContent = isExpanded ? "Ver menos" : "Ver todas";
    });
})();
