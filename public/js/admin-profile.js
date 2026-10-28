(() => {
    const page = document.querySelector("[data-admin-profile]");
    if (!page) return;

    const profileTabs = [...page.querySelectorAll("[data-profile-tab]")];
    const profilePanels = [...page.querySelectorAll("[data-profile-panel]")];

    function activateProfileTab(tab, moveFocus = false) {
        const selectedPanel = tab.dataset.profileTab;
        for (const currentTab of profileTabs) {
            const isSelected = currentTab === tab;
            currentTab.setAttribute("aria-selected", String(isSelected));
            currentTab.tabIndex = isSelected ? 0 : -1;
            currentTab.classList.toggle("is-active", isSelected);
        }
        for (const panel of profilePanels) {
            panel.hidden = panel.dataset.profilePanel !== selectedPanel;
        }
        if (moveFocus) tab.focus();
    }

    profileTabs.forEach((tab, index) => {
        tab.addEventListener("click", () => activateProfileTab(tab));
        tab.addEventListener("keydown", (event) => {
            let nextIndex = index;
            if (event.key === "ArrowRight") nextIndex = (index + 1) % profileTabs.length;
            else if (event.key === "ArrowLeft") {
                nextIndex = (index - 1 + profileTabs.length) % profileTabs.length;
            } else if (event.key === "Home") nextIndex = 0;
            else if (event.key === "End") nextIndex = profileTabs.length - 1;
            else return;

            event.preventDefault();
            activateProfileTab(profileTabs[nextIndex], true);
        });
    });
    if (profileTabs.length) activateProfileTab(profileTabs[0]);

    const endpoint = page.dataset.endpoint;
    const editButton = page.querySelector("[data-profile-edit]");
    const form = page.querySelector("[data-profile-form]");
    const cancelButton = page.querySelector("[data-profile-cancel]");
    const saveButton = page.querySelector("[data-profile-save]");
    const readOnlyFields = page.querySelector("[data-profile-readonly]");
    const successMessage = page.querySelector("[data-profile-success]");
    const errorMessage = page.querySelector("[data-profile-error]");
    const displayNameInput = page.querySelector("[data-profile-display-name]");
    const emailInput = page.querySelector("[data-profile-email]");
    const phoneInput = page.querySelector("[data-profile-phone]");

    function setMessage(element, message) {
        element.textContent = message;
        element.hidden = !message;
    }

    function openEditor() {
        form.hidden = false;
        readOnlyFields.hidden = true;
        editButton.hidden = true;
        editButton.setAttribute("aria-expanded", "true");
        setMessage(successMessage, "");
        setMessage(errorMessage, "");
        displayNameInput.focus();
    }

    function closeEditor() {
        form.reset();
        form.hidden = true;
        readOnlyFields.hidden = false;
        editButton.hidden = false;
        editButton.setAttribute("aria-expanded", "false");
        setMessage(errorMessage, "");
        editButton.focus();
    }

    function updateProfile(profile) {
        page.querySelector('[data-profile-value="displayName"]').textContent =
            profile.displayName || "Nombre no registrado";
        page.querySelector('[data-profile-value="email"]').textContent = profile.email;
        page.querySelector('[data-profile-value="phone"]').textContent =
            profile.phone || "Sin información registrada";
        page.querySelector("[data-profile-identity-name]").textContent =
            profile.displayName || "Nombre no registrado";
        page.querySelector("[data-profile-identity-email]").textContent = profile.email;
        page.querySelector("[data-profile-initials]").textContent = profile.initials;
        page.querySelector("[data-profile-avatar]").dataset.profileAvatarInitials =
            profile.initials;
        displayNameInput.value = profile.displayName || "";
        displayNameInput.defaultValue = displayNameInput.value;
        emailInput.value = profile.email;
        emailInput.defaultValue = emailInput.value;
        phoneInput.value = profile.phone || "";
        phoneInput.defaultValue = phoneInput.value;
    }

    editButton.addEventListener("click", openEditor);
    cancelButton.addEventListener("click", closeEditor);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage(successMessage, "");
        setMessage(errorMessage, "");
        saveButton.disabled = true;
        saveButton.textContent = "Guardando...";

        try {
            let response;
            try {
                response = await fetch(endpoint, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        displayName: displayNameInput.value,
                        email: emailInput.value,
                        phone: phoneInput.value,
                    }),
                });
            } catch {
                throw new Error("No pudimos conectar con SaludVital. Inténtalo de nuevo.");
            }

            let result;
            try {
                result = await response.json();
            } catch {
                throw new Error("No recibimos una respuesta válida al guardar tus datos.");
            }
            if (!response.ok) {
                throw new Error(result.message || "No pudimos guardar tus datos personales.");
            }

            updateProfile(result.profile);
            form.hidden = true;
            readOnlyFields.hidden = false;
            editButton.hidden = false;
            editButton.setAttribute("aria-expanded", "false");
            setMessage(successMessage, result.message);
            editButton.focus();
        } catch (error) {
            setMessage(errorMessage, error.message || "No pudimos guardar tus datos personales.");
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = "Guardar cambios";
        }
    });
})();
