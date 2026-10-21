(() => {
    const page = document.querySelector(".profile-page");
    if (!page) return;

    const sections = [...page.querySelectorAll("[data-profile-section]")];
    const dependentSections = [...page.querySelectorAll("[data-edit-dependent]")];
    const feedback = page.querySelector("[data-profile-feedback]");
    const mobile = window.matchMedia("(max-width: 760px)");

    const updateDependentSections = () => {
        const personalForm = page.querySelector('[data-profile-form="personal"]');
        dependentSections.forEach((section) => {
            section.hidden = !mobile.matches && personalForm.hidden;
            if (!section.hidden) section.open = mobile.matches ? false : true;
        });
    };

    const setMobileSections = () => {
        if (mobile.matches) sections.forEach((section) => (section.open = false));
        else sections.forEach((section) => (section.open = true));
        updateDependentSections();
    };
    setMobileSections();
    mobile.addEventListener("change", setMobileSections);

    page.addEventListener("click", (event) => {
        const editButton = event.target.closest("[data-edit-section]");
        const cancelButton = event.target.closest("[data-cancel-section]");
        const sectionName = editButton?.dataset.editSection || cancelButton?.dataset.cancelSection;
        if (!sectionName) return;

        const section = page.querySelector(`[data-profile-section][data-section="${sectionName}"]`);
        if (!section) return;
        const editing = Boolean(editButton);
        section.querySelector(`[data-readonly-section="${sectionName}"]`).hidden = editing;
        section.querySelector(`[data-profile-form="${sectionName}"]`).hidden = !editing;
        if (editing) section.open = true;
        if (sectionName === "personal") updateDependentSections();
        if (feedback) feedback.textContent = "";
    });

    const department = page.querySelector("[data-profile-department]");
    const municipality = page.querySelector("[data-profile-municipality]");
    department?.addEventListener("change", async () => {
        municipality.disabled = true;
        municipality.replaceChildren(new Option("Cargando municipios…", ""));
        try {
            const response = await fetch(
                `/api/locations/departments/${encodeURIComponent(department.value)}/municipalities`,
                { headers: { Accept: "application/json" } },
            );
            if (!response.ok) throw new Error("No fue posible cargar los municipios.");
            const result = await response.json();
            municipality.replaceChildren(new Option("Selecciona un municipio", ""));
            result.data.forEach((item) => {
                municipality.add(new Option(item.name, item.code));
            });
        } catch (error) {
            municipality.replaceChildren(new Option("Error al cargar municipios", ""));
            if (feedback) feedback.textContent = error.message;
        } finally {
            municipality.disabled = false;
        }
    });

    const formValues = (form) => Object.fromEntries(new FormData(form).entries());
    page.querySelectorAll("[data-profile-form]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!form.reportValidity()) return;

            const button = form.querySelector('[type="submit"]');
            button.disabled = true;
            if (feedback) feedback.textContent = "Guardando tus cambios…";
            const payload = {
                personal: formValues(page.querySelector('[data-profile-form="personal"]')),
                medical: formValues(page.querySelector('[data-profile-form="medical"]')),
                emergency: formValues(page.querySelector('[data-profile-form="emergency"]')),
            };

            try {
                const response = await fetch("/api/patient/profile", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify(payload),
                });
                const result = await response.json();
                if (!response.ok)
                    throw new Error(result.message || "No se pudo actualizar el perfil.");
                if (feedback) feedback.textContent = result.message;
                window.setTimeout(() => window.location.reload(), 1000);
            } catch (error) {
                if (feedback) feedback.textContent = error.message;
                button.disabled = false;
            }
        });
    });

    const photoInput = page.querySelector("[data-profile-photo]");
    const deleteDialog = page.querySelector("[data-delete-dialog]");
    const photoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

    page.querySelectorAll(".profile-avatar-image, .profile-photo-preview[src]").forEach((image) => {
        const showImageFallback = () => {
            if (image.classList.contains("profile-avatar-image")) {
                image.parentElement.textContent = image.parentElement.dataset.profileInitials;
                return;
            }
            const fallback = document.createElement("span");
            fallback.className = "profile-photo-preview profile-photo-placeholder";
            fallback.setAttribute("aria-hidden", "true");
            fallback.textContent =
                page.querySelector(".profile-avatar")?.dataset.profileInitials?.[0] || "P";
            image.replaceWith(fallback);
        };
        image.addEventListener("error", showImageFallback, { once: true });
        if (image.complete && image.naturalWidth === 0) showImageFallback();
    });

    page.querySelector("[data-trigger-photo]")?.addEventListener("click", () =>
        photoInput?.click(),
    );

    photoInput?.addEventListener("change", async () => {
        const file = photoInput.files?.[0];
        if (!file) return;
        if (!photoTypes.has(file.type)) {
            if (feedback) feedback.textContent = "Selecciona una foto JPG, PNG o WEBP.";
            photoInput.value = "";
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            if (feedback) feedback.textContent = "La foto debe pesar como máximo 2 MB.";
            photoInput.value = "";
            return;
        }

        try {
            const photo = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.addEventListener("load", () => resolve(reader.result));
                reader.addEventListener("error", () =>
                    reject(new Error("No se pudo leer la foto.")),
                );
                reader.readAsDataURL(file);
            });
            if (feedback) feedback.textContent = "Guardando foto de perfil…";
            const response = await fetch("/api/patient/profile/photo", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ photo }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "No se pudo guardar la foto.");
            if (feedback) feedback.textContent = "Foto de perfil actualizada.";
            window.setTimeout(() => window.location.reload(), 600);
        } catch (error) {
            if (feedback) feedback.textContent = error.message;
        } finally {
            photoInput.value = "";
        }
    });

    page.querySelector("[data-open-delete]")?.addEventListener("click", () =>
        deleteDialog?.showModal(),
    );
    page.querySelectorAll("[data-close-delete]").forEach((button) => {
        button.addEventListener("click", () => deleteDialog?.close());
    });
    deleteDialog?.addEventListener("click", (event) => {
        if (event.target === deleteDialog) deleteDialog.close();
    });

    const deleteForm = page.querySelector("[data-delete-form]");
    const deleteConfirmation = page.querySelector("[data-delete-confirmation]");
    const deleteButton = page.querySelector(".profile-delete-confirm");
    const deleteFeedback = page.querySelector("[data-delete-feedback]");

    deleteConfirmation?.addEventListener("input", () => {
        deleteButton.disabled = deleteConfirmation.value.trim().toUpperCase() !== "ELIMINAR";
    });

    deleteForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!deleteForm.reportValidity() || deleteButton.disabled) return;

        deleteButton.disabled = true;
        deleteFeedback.textContent = "Cerrando tu cuenta…";
        try {
            const response = await fetch("/api/patient/profile", {
                method: "DELETE",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ password: new FormData(deleteForm).get("password") }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "No se pudo desactivar la cuenta.");
            deleteFeedback.textContent = result.message;
            window.setTimeout(() => window.location.assign("/login"), 900);
        } catch (error) {
            deleteFeedback.textContent = error.message;
            deleteButton.disabled = deleteConfirmation.value.trim().toUpperCase() !== "ELIMINAR";
        }
    });
})();
