const doctorFormPage = document.querySelector("[data-doctor-form]");

if (doctorFormPage) {
    const form = doctorFormPage.querySelector("[data-form]");
    const feedback = doctorFormPage.querySelector("[data-form-feedback]");
    const successPanel = doctorFormPage.querySelector("[data-form-success]");
    const successMessage = doctorFormPage.querySelector("[data-form-success-message]");
    const submitButton = form.querySelector('button[type="submit"]');
    const photoInput = doctorFormPage.querySelector("[data-photo-input]");
    const photoPreview = doctorFormPage.querySelector("[data-photo-preview]");
    const removePhotoButton = doctorFormPage.querySelector("[data-photo-remove]");
    let photoDataUrl = null;
    let photoReadPromise = Promise.resolve();

    photoInput.addEventListener("change", () => {
        const [file] = photoInput.files;
        if (!file) return;
        if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) {
            removePhotoButton.click();
            feedback.textContent = "Elige una foto JPG, PNG o WebP de máximo 2 MB.";
            return;
        }

        photoDataUrl = null;
        photoReadPromise = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => {
                photoDataUrl = reader.result;
                photoPreview.replaceChildren();
                const image = document.createElement("img");
                image.src = photoDataUrl;
                image.alt = "Vista previa de la foto del médico";
                photoPreview.append(image);
                removePhotoButton.hidden = false;
                feedback.textContent = "";
                resolve();
            });
            reader.addEventListener("error", () =>
                reject(new Error("No se pudo leer la foto seleccionada.")),
            );
            reader.readAsDataURL(file);
        });
    });

    removePhotoButton.addEventListener("click", () => {
        photoInput.value = "";
        photoDataUrl = null;
        photoReadPromise = Promise.resolve();
        photoPreview.replaceChildren();
        const placeholder = document.createElement("span");
        placeholder.setAttribute("aria-hidden", "true");
        placeholder.textContent = "＋";
        photoPreview.append(placeholder);
        removePhotoButton.hidden = true;
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        try {
            await photoReadPromise;
        } catch (error) {
            feedback.textContent = error.message;
            return;
        }

        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        delete payload.photo;
        if (photoDataUrl) payload.photo = photoDataUrl;
        payload.specialtyId = Number(payload.specialtyId);
        submitButton.disabled = true;
        feedback.textContent = "Guardando…";

        try {
            const response = await fetch(doctorFormPage.dataset.action, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const result = await response.json().catch(() => ({
                message: "No se pudo completar el registro. Inténtalo de nuevo.",
            }));

            if (!response.ok) throw new Error(result.message || "No se pudo crear el médico.");

            successMessage.textContent = result.message;
            form.reset();
            removePhotoButton.click();
            form.hidden = true;
            successPanel.hidden = false;
        } catch (error) {
            feedback.textContent = error.message;
            submitButton.disabled = false;
        }
    });
}
