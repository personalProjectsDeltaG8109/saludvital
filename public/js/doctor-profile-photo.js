(() => {
    const page = document.querySelector("[data-doctor-profile]");
    if (!page) return;

    const avatar = page.querySelector("[data-profile-avatar]");
    const openButton = page.querySelector("[data-profile-photo-open]");
    const fileInput = page.querySelector("[data-profile-photo-input]");
    const dialog = page.querySelector("[data-profile-photo-dialog]");
    const previewContainer = dialog.querySelector("[data-photo-preview-container]");
    const previewImage = dialog.querySelector("[data-photo-preview]");
    const statusMessage = dialog.querySelector("[data-photo-status]");
    const errorMessage = dialog.querySelector("[data-photo-error]");
    const uploadButton = dialog.querySelector("[data-photo-upload]");
    const cancelButton = dialog.querySelector("[data-photo-preview-cancel]");
    const saveButton = dialog.querySelector("[data-photo-save]");
    const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const maximumPhotoSize = 2 * 1024 * 1024;

    let selectedPhotoDataUrl = null;

    function showMessage(element, message) {
        element.textContent = message;
        element.hidden = !message;
    }

    function resetPreview() {
        selectedPhotoDataUrl = null;
        previewImage.removeAttribute("src");
        previewContainer.hidden = true;
        uploadButton.hidden = false;
        cancelButton.hidden = true;
        saveButton.hidden = true;
        saveButton.disabled = false;
        saveButton.textContent = "Guardar foto";
        fileInput.value = "";
    }

    function openDialog() {
        resetPreview();
        showMessage(errorMessage, "");
        showMessage(statusMessage, "Selecciona una imagen JPG, PNG o WebP de máximo 2 MB.");
        dialog.showModal();
    }

    function closeDialog() {
        dialog.close();
    }

    function ensureDialogIsOpen() {
        if (!dialog.open) dialog.showModal();
    }

    function readSelectedFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => resolve(reader.result));
            reader.addEventListener("error", () => reject(new Error("No se pudo leer la imagen.")));
            reader.readAsDataURL(file);
        });
    }

    function updateAvatar(photoUrl) {
        avatar.dataset.photoUrl = photoUrl;
        avatar.replaceChildren();
        const image = document.createElement("img");
        image.src = photoUrl;
        image.alt = `Fotografía de ${page.querySelector(".doctor-profile-identity h3").textContent}`;
        image.dataset.profilePhoto = "";
        image.addEventListener("error", () => {
            avatar.replaceChildren();
            const initials = document.createElement("span");
            initials.setAttribute("aria-hidden", "true");
            initials.textContent = avatar.dataset.initials || "M";
            avatar.append(initials);
        });
        avatar.append(image);

        const topbarAvatar = document.querySelector(".sv-user-chip .sv-avatar");
        if (topbarAvatar) {
            const topbarImage = document.createElement("img");
            topbarImage.src = photoUrl;
            topbarImage.alt = "";
            topbarImage.className = "profile-avatar-image";
            topbarAvatar.replaceChildren(topbarImage);
        }
    }

    openButton.addEventListener("click", openDialog);
    uploadButton.addEventListener("click", () => fileInput.click());
    dialog.querySelector("[data-photo-close]").addEventListener("click", closeDialog);
    dialog.addEventListener("close", () => {
        resetPreview();
        openButton.focus();
    });
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog();
    });

    cancelButton.addEventListener("click", () => {
        resetPreview();
        showMessage(errorMessage, "");
        showMessage(statusMessage, "Selecciona una imagen para continuar.");
        uploadButton.focus();
    });

    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        if (!allowedPhotoTypes.has(file.type)) {
            fileInput.value = "";
            showMessage(errorMessage, "Selecciona una foto JPG, PNG o WebP.");
            ensureDialogIsOpen();
            return;
        }
        if (file.size > maximumPhotoSize) {
            fileInput.value = "";
            showMessage(errorMessage, "La foto debe pesar como máximo 2 MB.");
            ensureDialogIsOpen();
            return;
        }

        try {
            const dataUrl = await readSelectedFile(file);
            if (typeof dataUrl !== "string") throw new Error("No se pudo leer la imagen.");
            selectedPhotoDataUrl = dataUrl;
            previewImage.src = dataUrl;
            previewContainer.hidden = false;
            uploadButton.hidden = true;
            cancelButton.hidden = false;
            saveButton.hidden = false;
            showMessage(statusMessage, "Revisa la vista previa antes de guardar.");
            showMessage(errorMessage, "");
            ensureDialogIsOpen();
            saveButton.focus();
        } catch (error) {
            showMessage(errorMessage, error.message);
            ensureDialogIsOpen();
        }
    });

    saveButton.addEventListener("click", async () => {
        if (!selectedPhotoDataUrl) return;
        saveButton.disabled = true;
        saveButton.textContent = "Guardando...";
        showMessage(errorMessage, "");
        showMessage(statusMessage, "Guardando la foto de perfil...");

        try {
            const response = await fetch("/api/doctor/profile/photo", {
                method: "POST",
                headers: { Accept: "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({ photo: selectedPhotoDataUrl }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "No pudimos guardar tu foto.");
            if (
                typeof result.profilePhotoUrl !== "string" ||
                !result.profilePhotoUrl.startsWith("/uploads/profile-photos/")
            ) {
                throw new Error("No recibimos la ruta de la foto guardada.");
            }

            updateAvatar(result.profilePhotoUrl);
            showMessage(
                page.querySelector("[data-profile-feedback]"),
                result.message || "Tu foto de perfil se actualizó correctamente.",
            );
            closeDialog();
        } catch (error) {
            saveButton.disabled = false;
            saveButton.textContent = "Guardar foto";
            showMessage(errorMessage, error.message || "No pudimos guardar tu foto.");
            showMessage(statusMessage, "La foto actual se conserva. Puedes volver a intentarlo.");
        }
    });
})();
