(() => {
    const form = document.querySelector("[data-profile-preferences-form]");
    if (!form) return;

    const endpoint = form.dataset.endpoint;
    const notificationFeedInput = form.querySelector("[data-admin-notifications-enabled]");
    const saveButton = form.querySelector("[data-preferences-save]");
    const successMessage = form.querySelector("[data-preferences-success]");
    const errorMessage = form.querySelector("[data-preferences-error]");

    function setMessage(element, message) {
        element.textContent = message;
        element.hidden = !message;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        saveButton.disabled = true;
        saveButton.textContent = "Guardando…";
        setMessage(successMessage, "");
        setMessage(errorMessage, "");

        try {
            const response = await fetch(endpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ showNotificationFeed: notificationFeedInput.checked }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.message || "No se pudieron guardar tus preferencias.");
            }
            notificationFeedInput.checked = payload.showNotificationFeed;
            setMessage(successMessage, payload.message);
        } catch (error) {
            setMessage(
                errorMessage,
                error.message || "Ocurrió un error al guardar tus preferencias.",
            );
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = "Guardar preferencias";
        }
    });
})();
