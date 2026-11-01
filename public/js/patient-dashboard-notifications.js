(() => {
    const panel = document.querySelector("[data-dashboard-notifications]");
    if (!panel) return;

    const toggles = [...panel.querySelectorAll("[data-dashboard-channel-toggle]")];
    const feedback = panel.querySelector("[data-dashboard-notification-feedback]");

    function showFeedback(message, isError = false) {
        feedback.textContent = message;
        feedback.classList.toggle("is-error", isError);
    }

    function setControlsDisabled(isDisabled) {
        toggles.forEach((toggle) => {
            toggle.disabled = isDisabled;
        });
    }

    async function saveChannel(toggle, previousValue) {
        setControlsDisabled(true);
        showFeedback("Guardando preferencia…");

        try {
            const response = await fetch("/api/patient/notifications/channel", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    channel: toggle.dataset.dashboardChannelToggle,
                    isEnabled: toggle.checked,
                }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || "No se pudo guardar la preferencia.");
            }

            toggles.forEach((item) => {
                const channel = item.dataset.dashboardChannelToggle;
                item.checked = result.data.channelStates[channel];
                item.nextElementSibling.classList.toggle("is-active", item.checked);
            });
            showFeedback(result.message);
        } catch (error) {
            toggle.checked = previousValue;
            toggle.nextElementSibling.classList.toggle("is-active", previousValue);
            showFeedback(error.message || "No se pudo guardar la preferencia.", true);
        } finally {
            setControlsDisabled(false);
        }
    }

    toggles.forEach((toggle) => {
        toggle.addEventListener("change", () => {
            saveChannel(toggle, !toggle.checked);
        });
    });
})();
