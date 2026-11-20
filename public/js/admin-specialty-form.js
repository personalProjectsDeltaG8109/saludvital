const specialtyForm = document.querySelector("[data-specialty-create-form]");

if (specialtyForm) {
    const nameInput = specialtyForm.querySelector('[name="name"]');
    const descriptionInput = specialtyForm.querySelector('[name="description"]');
    const logoInput = specialtyForm.querySelector("[data-specialty-logo-input]");
    const logoName = specialtyForm.querySelector("[data-specialty-logo-name]");
    const removeLogoButton = specialtyForm.querySelector("[data-specialty-logo-remove]");
    const submitButton = specialtyForm.querySelector("[data-specialty-submit]");
    const feedback = specialtyForm.querySelector("[data-specialty-form-feedback]");
    const errorMessage = specialtyForm.querySelector("[data-specialty-form-error]");
    const isEditing = specialtyForm.dataset.mode === "edit";
    const originalLogoUrl = specialtyForm.dataset.currentLogoUrl || "";
    const liveName = document.querySelector("[data-specialty-live-name]");
    const liveDescription = document.querySelector("[data-specialty-live-description]");
    let selectedLogo = null;
    let removeLogo = false;
    let previewObjectUrl = "";

    function createDefaultLogo() {
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("fill", "none");
        icon.setAttribute("stroke", "currentColor");
        icon.setAttribute("stroke-width", "1.8");
        icon.setAttribute("stroke-linecap", "round");
        icon.setAttribute("stroke-linejoin", "round");
        icon.setAttribute("aria-hidden", "true");

        for (const pathData of ["m12 3 9 5-9 5-9-5 9-5Z", "m3 12 9 5 9-5", "m3 16 9 5 9-5"]) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", pathData);
            icon.append(path);
        }

        return icon;
    }

    function renderLogoPreview(source) {
        const preview = specialtyForm.querySelector("[data-specialty-logo-preview]");
        const livePreview = document.querySelector("[data-specialty-live-logo]");

        for (const container of [preview, livePreview]) {
            if (!container) continue;
            container.replaceChildren();
            if (source) {
                const image = document.createElement("img");
                image.src = source;
                image.alt = "";
                image.addEventListener("error", () => renderLogoPreview(""), { once: true });
                container.append(image);
            } else {
                container.append(createDefaultLogo());
            }
        }
    }

    function clearSelectedPreview() {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
    }

    function showLogoError(message) {
        errorMessage.textContent = message;
        errorMessage.hidden = false;
        feedback.textContent = "No se pudo cargar el logo.";
    }

    function fileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => resolve(reader.result), { once: true });
            reader.addEventListener(
                "error",
                () => reject(new Error("No pudimos leer la imagen.")),
                {
                    once: true,
                },
            );
            reader.readAsDataURL(file);
        });
    }

    logoInput.addEventListener("change", () => {
        const file = logoInput.files?.[0];
        errorMessage.hidden = true;
        logoInput.removeAttribute("aria-invalid");
        if (!file) return;

        const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
        if (!allowedTypes.has(file.type) || file.size > 2 * 1024 * 1024) {
            logoInput.value = "";
            selectedLogo = null;
            removeLogo = false;
            logoInput.setAttribute("aria-invalid", "true");
            renderLogoPreview(originalLogoUrl);
            logoName.textContent = originalLogoUrl ? "Logo personalizado" : "Usa una imagen propia";
            removeLogoButton.hidden = !originalLogoUrl;
            showLogoError("El logo debe ser JPG, PNG o WebP y no superar 2 MB.");
            return;
        }

        selectedLogo = file;
        removeLogo = false;
        clearSelectedPreview();
        previewObjectUrl = URL.createObjectURL(file);
        renderLogoPreview(previewObjectUrl);
        logoName.textContent = file.name;
        removeLogoButton.hidden = false;
    });

    removeLogoButton.addEventListener("click", () => {
        selectedLogo = null;
        logoInput.value = "";
        removeLogo = Boolean(originalLogoUrl);
        clearSelectedPreview();
        renderLogoPreview("");
        logoName.textContent = "Se usará el logo predeterminado";
        removeLogoButton.hidden = true;
        errorMessage.hidden = true;
    });

    nameInput.addEventListener("input", () => {
        if (liveName) liveName.textContent = nameInput.value.trim() || "Nombre de especialidad";
    });
    descriptionInput.addEventListener("input", () => {
        if (liveDescription) {
            liveDescription.textContent =
                descriptionInput.value.trim() || "Descripción de la especialidad";
        }
    });

    specialtyForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorMessage.hidden = true;
        nameInput.removeAttribute("aria-invalid");
        feedback.textContent = "Guardando la especialidad…";
        submitButton.disabled = true;

        try {
            const payload = {
                name: nameInput.value,
                description: descriptionInput.value,
                removeLogo,
            };
            if (selectedLogo) payload.logoDataUrl = await fileAsDataUrl(selectedLogo);

            const response = await fetch(specialtyForm.dataset.endpoint, {
                method: isEditing ? "PATCH" : "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(payload),
            });

            let data;
            try {
                data = await response.json();
            } catch {
                throw new Error("No pudimos guardar la especialidad. Inténtalo de nuevo.");
            }
            if (!response.ok) throw new Error(data.message || "Revisa la información ingresada.");

            const query = new URLSearchParams({
                [isEditing ? "updated" : "created"]: "1",
                search: data.specialty.name,
            });
            window.location.assign(`/admin/specialties?${query}`);
        } catch (error) {
            feedback.textContent = "No se guardaron los cambios.";
            errorMessage.textContent = error.message;
            errorMessage.hidden = false;
            if (responseConflict(error)) {
                nameInput.setAttribute("aria-invalid", "true");
                nameInput.focus();
            }
        } finally {
            submitButton.disabled = false;
        }
    });
}

function responseConflict(error) {
    return error.message === "Ya existe una especialidad con ese nombre.";
}
