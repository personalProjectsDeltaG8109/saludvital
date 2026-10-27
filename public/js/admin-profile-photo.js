(() => {
    const page = document.querySelector("[data-admin-profile]");
    if (!page) return;

    const endpoint = `${page.dataset.endpoint}/photo`;
    const avatar = page.querySelector("[data-profile-avatar]");
    const openButton = page.querySelector("[data-profile-photo-open]");
    const dialog = page.querySelector("[data-profile-photo-dialog]");
    const actions = page.querySelector("[data-photo-actions]");
    const fileInput = page.querySelector("[data-profile-photo-input]");
    const removeButton = page.querySelector("[data-photo-remove]");
    const previewContainer = page.querySelector("[data-photo-preview-container]");
    const previewImage = page.querySelector("[data-photo-preview]");
    const saveButton = page.querySelector("[data-photo-save]");
    const statusMessage = page.querySelector("[data-photo-status]");
    const errorMessage = page.querySelector("[data-photo-error]");
    const pageFeedback = page.querySelector("[data-photo-page-feedback]");
    const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const maximumPhotoSize = 2 * 1024 * 1024;

    let selectedPhotoDataUrl = null;
    let previewUrl = null;
    let hasProfilePhoto = Boolean(avatar.querySelector("[data-profile-avatar-image]"));

    function setMessage(element, message) {
        element.textContent = message;
        element.hidden = !message;
    }

    function clearPreview() {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        selectedPhotoDataUrl = null;
        previewImage.removeAttribute("src");
        previewContainer.hidden = true;
        actions.hidden = false;
        fileInput.value = "";
        saveButton.disabled = false;
        saveButton.textContent = "Guardar foto";
    }

    function openPhotoDialog() {
        clearPreview();
        setMessage(statusMessage, "Puedes subir, cambiar o eliminar tu foto de perfil.");
        setMessage(errorMessage, "");
        if (removeButton) removeButton.hidden = !hasProfilePhoto;
        openButton.setAttribute("aria-expanded", "true");
        dialog.showModal();
    }

    function closePhotoDialog() {
        dialog.close();
    }

    function updateAvatar(photoUrl) {
        avatar.replaceChildren();
        if (photoUrl) {
            const image = document.createElement("img");
            image.src = photoUrl;
            image.alt = "";
            image.dataset.profileAvatarImage = "";
            avatar.append(image);
            hasProfilePhoto = true;
        } else {
            const initials = document.createElement("span");
            initials.textContent = avatar.dataset.profileAvatarInitials || "A";
            initials.dataset.profileInitials = "";
            avatar.append(initials);
            hasProfilePhoto = false;
        }
        if (removeButton) removeButton.hidden = !hasProfilePhoto;
    }

    async function readSelectedFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => resolve(reader.result));
            reader.addEventListener("error", () => reject(new Error("No se pudo leer la imagen.")));
            reader.readAsDataURL(file);
        });
    }

    async function requestPhotoChange(method, body) {
        let response;
        try {
            response = await fetch(endpoint, {
                method,
                headers: {
                    Accept: "application/json",
                    ...(body ? { "Content-Type": "application/json" } : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
        } catch {
            throw new Error("No pudimos conectar con SaludVital. Inténtalo de nuevo.");
        }

        let result;
        try {
            result = await response.json();
        } catch {
            throw new Error("No recibimos una respuesta válida al guardar la foto.");
        }
        if (!response.ok) {
            throw new Error(result.message || "No pudimos actualizar tu foto de perfil.");
        }
        return result;
    }

    openButton.addEventListener("click", openPhotoDialog);
    page.querySelector("[data-photo-close]").addEventListener("click", closePhotoDialog);
    page.querySelector("[data-photo-preview-cancel]").addEventListener("click", () => {
        clearPreview();
        setMessage(errorMessage, "");
        setMessage(statusMessage, "Selecciona una imagen para continuar.");
        page.querySelector("[data-photo-upload]").focus();
    });
    page.querySelector("[data-photo-upload]").addEventListener("click", () => fileInput.click());

    dialog.addEventListener("close", () => {
        openButton.setAttribute("aria-expanded", "false");
        clearPreview();
        openButton.focus();
    });

    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closePhotoDialog();
    });

    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (!allowedPhotoTypes.has(file.type)) {
            fileInput.value = "";
            setMessage(errorMessage, "Selecciona una foto JPG, PNG o WEBP.");
            return;
        }
        if (file.size > maximumPhotoSize) {
            fileInput.value = "";
            setMessage(errorMessage, "La foto debe pesar como máximo 2 MB.");
            return;
        }

        try {
            const dataUrl = await readSelectedFile(file);
            if (typeof dataUrl !== "string") throw new Error("No se pudo leer la imagen.");
            selectedPhotoDataUrl = dataUrl;
            previewUrl = URL.createObjectURL(file);
            previewImage.src = previewUrl;
            actions.hidden = true;
            previewContainer.hidden = false;
            setMessage(statusMessage, "Revisa la vista previa antes de guardar.");
            setMessage(errorMessage, "");
            saveButton.focus();
        } catch (error) {
            setMessage(errorMessage, error.message);
        }
    });

    saveButton.addEventListener("click", async () => {
        if (!selectedPhotoDataUrl) return;
        saveButton.disabled = true;
        saveButton.textContent = "Guardando...";
        setMessage(errorMessage, "");
        setMessage(statusMessage, "Guardando la foto de perfil...");

        try {
            const result = await requestPhotoChange("POST", { photo: selectedPhotoDataUrl });
            if (
                typeof result.profilePhotoUrl !== "string" ||
                !result.profilePhotoUrl.startsWith("/uploads/profile-photos/")
            ) {
                throw new Error("No recibimos la ruta de la foto guardada.");
            }
            updateAvatar(result.profilePhotoUrl);
            setMessage(
                pageFeedback,
                result.message || "Tu foto de perfil se actualizó correctamente.",
            );
            closePhotoDialog();
        } catch (error) {
            saveButton.disabled = false;
            saveButton.textContent = "Guardar foto";
            setMessage(errorMessage, error.message || "No pudimos guardar tu foto.");
            setMessage(statusMessage, "La foto actual se conserva. Puedes volver a intentarlo.");
        }
    });

    removeButton?.addEventListener("click", async () => {
        if (!window.confirm("¿Confirmas que deseas eliminar tu foto de perfil?")) return;

        removeButton.disabled = true;
        setMessage(errorMessage, "");
        setMessage(statusMessage, "Eliminando la foto de perfil...");
        try {
            const result = await requestPhotoChange("DELETE");
            updateAvatar(null);
            setMessage(
                pageFeedback,
                result.message || "Tu foto de perfil se eliminó correctamente.",
            );
            closePhotoDialog();
        } catch (error) {
            setMessage(errorMessage, error.message || "No pudimos eliminar tu foto de perfil.");
            setMessage(statusMessage, "La foto actual se conserva.");
        } finally {
            removeButton.disabled = false;
        }
    });
})();
