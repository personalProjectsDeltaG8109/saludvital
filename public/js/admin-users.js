const page = document.querySelector("[data-admin-users]");

if (page) {
    const app = document.querySelector(".admin-app");
    const sidebar = document.querySelector("[data-admin-sidebar]");
    const searchInput = document.querySelector("[data-user-search]");
    const roleFilter = document.querySelector("[data-user-role]");
    const statusFilter = document.querySelector("[data-user-status]");
    const list = document.querySelector("[data-user-list]");
    const feedback = document.querySelector("[data-user-feedback]");
    const countLabel = document.querySelector("[data-user-count]");
    const pageLabel = document.querySelector("[data-user-page-label]");
    const previousButton = document.querySelector("[data-user-prev]");
    const nextButton = document.querySelector("[data-user-next]");
    const modal = document.querySelector("[data-user-modal]");
    const dialog = document.querySelector("[data-user-dialog]");
    const roleModal = document.querySelector("[data-role-modal]");
    const roleDialog = document.querySelector("[data-role-dialog]");
    const roleModalProfile = document.querySelector("[data-role-modal-profile]");
    const roleExplanation = document.querySelector("[data-role-explanation]");
    const roleImpact = document.querySelector("[data-role-impact]");
    const roleFeedback = document.querySelector("[data-role-feedback]");
    const roleForm = document.querySelector("[data-role-form]");
    const roleFields = document.querySelector("[data-role-fields]");
    const roleSaveButton = document.querySelector("[data-role-modal-save]");
    const modalProfile = document.querySelector("[data-user-modal-profile]");
    const modalFeedback = document.querySelector("[data-user-modal-feedback]");
    const editForm = document.querySelector("[data-user-edit-form]");
    const editFields = document.querySelector("[data-user-edit-fields]");
    const saveButton = document.querySelector("[data-user-modal-save]");
    const initialQuery = new URLSearchParams(window.location.search);
    const initialSearch = initialQuery.get("search") || "";
    const requestedEditId = initialQuery.get("edit") || "";
    let pendingEditUserId = /^\d+$/.test(requestedEditId) ? Number(requestedEditId) : null;
    const state = {
        page: 1,
        pageSize: 10,
        totalPages: 1,
        search: initialSearch,
        roleId: "",
        status: "",
        specialties: [],
    };
    let focusedBeforeModal;
    let editingUser;
    let changingRoleUser;
    let changingRoleTarget;
    let roleSelectToRestore;
    let focusedBeforeRoleModal;
    let roleSubmissionInProgress = false;
    let activeRequest;
    // Request versions prevent slower responses from replacing the latest editor state.
    let editRequestVersion = 0;
    let municipalityRequestVersion = 0;
    let doctorPhotoDataUrl = null;
    let doctorPhotoReadPromise = Promise.resolve();

    searchInput.value = initialSearch;

    function setFeedback(message, kind = "") {
        feedback.textContent = message;
        feedback.classList.toggle("is-error", kind === "error");
        feedback.classList.toggle("is-success", kind === "success");
    }

    function roleLabel(name) {
        return (
            {
                Patient: "Paciente",
                Doctor: "Médico",
                Administrator: "Administrador",
            }[name] || name
        );
    }

    function formatDate(value) {
        if (!value) return "Sin registro";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Sin registro";
        return new Intl.DateTimeFormat("es-CO", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "America/Bogota",
        }).format(date);
    }

    function createField(label, content, className = "") {
        const field = document.createElement("div");
        field.className = `admin-user-field ${className}`.trim();
        const title = document.createElement("span");
        title.textContent = label;
        field.append(title, content);
        return field;
    }

    function formField(label, name, value, options = {}) {
        const wrapper = document.createElement("label");
        wrapper.className = `admin-user-form-field${options.wide ? " is-wide" : ""}`;
        const labelText = document.createElement("span");
        labelText.textContent = label;
        wrapper.append(labelText);

        let control;
        if (options.type === "textarea") {
            control = document.createElement("textarea");
        } else if (options.options) {
            control = document.createElement("select");
            options.options.forEach(({ value: optionValue, label: optionLabel }) => {
                const option = document.createElement("option");
                option.value = optionValue;
                option.textContent = optionLabel;
                control.append(option);
            });
        } else {
            control = document.createElement("input");
            control.type = options.type || "text";
        }

        control.name = name;
        control.value = value ?? "";
        control.required = Boolean(options.required);
        if (options.maxLength) control.maxLength = options.maxLength;
        if (options.pattern) control.pattern = options.pattern;
        if (options.min) control.min = options.min;
        if (options.max) control.max = options.max;
        if (options.placeholder) control.placeholder = options.placeholder;
        wrapper.append(control);
        return wrapper;
    }

    function doctorPhotoField(doctor) {
        const field = document.createElement("div");
        field.className = "admin-user-form-field admin-user-doctor-photo-field is-wide";

        const heading = document.createElement("span");
        heading.textContent = "Foto del médico";
        const content = document.createElement("div");
        content.className = "admin-user-doctor-photo-content";
        const preview = document.createElement("div");
        preview.className = "admin-user-doctor-photo-preview";
        const photoUrl = document.createElement("input");
        photoUrl.type = "hidden";
        photoUrl.name = "profilePhotoUrl";
        photoUrl.value =
            typeof doctor.profile_photo_url === "string" &&
            doctor.profile_photo_url.startsWith("/") &&
            !doctor.profile_photo_url.startsWith("//")
                ? doctor.profile_photo_url
                : "";
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/jpeg,image/png,image/webp";
        fileInput.className = "admin-user-doctor-photo-input";
        fileInput.setAttribute("aria-label", "Seleccionar foto del médico");
        const uploadLabel = document.createElement("label");
        uploadLabel.className = "admin-user-doctor-photo-upload";
        uploadLabel.textContent = "Cambiar foto";
        uploadLabel.append(fileInput);
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "admin-user-doctor-photo-remove";
        removeButton.textContent = "Quitar foto";
        removeButton.hidden = !photoUrl.value;

        function showPhoto(source) {
            preview.replaceChildren();
            if (source) {
                const image = document.createElement("img");
                image.src = source;
                image.alt = `Foto de ${doctor.display_name || "médico"}`;
                preview.append(image);
                return;
            }
            const initials = document.createElement("span");
            initials.setAttribute("aria-hidden", "true");
            initials.textContent = (doctor.display_name || "M").trim().charAt(0).toUpperCase();
            preview.append(initials);
        }

        showPhoto(photoUrl.value);
        fileInput.addEventListener("change", () => {
            const [file] = fileInput.files;
            if (!file) return;
            if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) {
                fileInput.value = "";
                doctorPhotoDataUrl = null;
                doctorPhotoReadPromise = Promise.resolve();
                showPhoto(photoUrl.value);
                setModalFeedback("Elige una foto JPG, PNG o WebP de máximo 2 MB.");
                return;
            }

            doctorPhotoDataUrl = null;
            doctorPhotoReadPromise = new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.addEventListener("load", () => {
                    doctorPhotoDataUrl = reader.result;
                    showPhoto(doctorPhotoDataUrl);
                    removeButton.hidden = false;
                    setModalFeedback("");
                    resolve();
                });
                reader.addEventListener("error", () =>
                    reject(new Error("No se pudo leer la foto seleccionada.")),
                );
                reader.readAsDataURL(file);
            });
        });
        removeButton.addEventListener("click", () => {
            fileInput.value = "";
            photoUrl.value = "";
            doctorPhotoDataUrl = null;
            doctorPhotoReadPromise = Promise.resolve();
            showPhoto(null);
            removeButton.hidden = true;
        });

        const hint = document.createElement("small");
        hint.className = "admin-user-form-hint";
        hint.textContent = "JPG, PNG o WebP. Máximo 2 MB.";
        content.append(preview, uploadLabel, removeButton, photoUrl, hint);
        field.append(heading, content);
        return field;
    }

    function formSection(title, fields) {
        const section = document.createElement("section");
        section.className = "admin-user-form-section";
        const heading = document.createElement("h3");
        heading.textContent = title;
        section.append(heading, ...fields);
        return section;
    }

    function addRoleProfilePhoto(container, user) {
        container.replaceChildren();
        const displayName =
            user.doctor?.display_name ||
            [user.patient?.first_name, user.patient?.last_name].filter(Boolean).join(" ") ||
            user.email;
        const initials = document.createElement("span");
        initials.className = "admin-user-modal-initials";
        initials.setAttribute("aria-hidden", "true");
        initials.textContent = displayName
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0] || "")
            .join("")
            .toUpperCase();
        if (user.profilePhotoUrl) {
            initials.hidden = true;
            const image = document.createElement("img");
            image.src = user.profilePhotoUrl;
            image.alt = `Foto de ${displayName}`;
            image.addEventListener(
                "error",
                () => {
                    image.remove();
                    initials.hidden = false;
                },
                { once: true },
            );
            container.append(image);
        }
        const identity = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = displayName;
        const details = document.createElement("span");
        details.textContent = `${user.email} · ${user.profileType === "Doctor" ? "Médico" : "Paciente"}`;
        identity.append(name, details);
        container.prepend(initials);
        container.append(identity);
    }

    function addPatientFields(user, departments, municipalities) {
        const editorVersion = editRequestVersion;
        const editorUserId = user.id;
        const patient = user.patient;
        const departmentOptions = [
            { value: "", label: "Selecciona un departamento" },
            ...departments.map((department) => ({
                value: department.code,
                label: department.name,
            })),
        ];
        const municipalityOptions = [
            { value: "", label: "Selecciona un municipio" },
            ...municipalities.map((municipality) => ({
                value: municipality.code,
                label: municipality.name,
            })),
        ];
        const email = formField("Correo de la cuenta", "email", user.email, {
            type: "email",
            required: true,
            maxLength: 320,
            wide: true,
        });
        const personalFields = [
            formField("Nombres", "firstName", patient.first_name, {
                required: true,
                maxLength: 50,
            }),
            formField("Apellidos", "lastName", patient.last_name, {
                required: true,
                maxLength: 50,
            }),
            formField("Teléfono", "phone", patient.phone, {
                type: "tel",
                required: true,
                maxLength: 15,
                pattern: "[0-9]{7,15}",
            }),
            formField(
                "Fecha de nacimiento",
                "dateOfBirth",
                String(patient.date_of_birth || "").slice(0, 10),
                { type: "date", required: true },
            ),
            formField("Tipo de documento", "documentType", patient.document_type, {
                required: true,
                options: [
                    { value: "CC", label: "Cédula de ciudadanía (CC)" },
                    { value: "CE", label: "Cédula de extranjería (CE)" },
                ],
            }),
            formField("Número de documento", "documentNumber", patient.document_number, {
                required: true,
                maxLength: 15,
                pattern: "[0-9]{1,15}",
            }),
            formField("Departamento", "departmentCode", patient.departmentCode, {
                required: true,
                options: departmentOptions,
            }),
            formField("Municipio", "municipalityCode", patient.municipalityCode, {
                required: true,
                options: municipalityOptions,
            }),
            formField("Dirección", "address", patient.address, { wide: true, maxLength: 150 }),
            formField("Ruta de la foto de perfil", "profilePhotoUrl", patient.profile_photo_url, {
                wide: true,
                maxLength: 255,
                placeholder: "/uploads/profile-photos/...",
            }),
        ];
        const notificationFields = [
            formField(
                "Teléfono de notificaciones",
                "notificationPhone",
                patient.notification_phone,
                { type: "tel", maxLength: 20, pattern: "\\+?[0-9]{7,15}" },
            ),
            formField(
                "WhatsApp de notificaciones",
                "notificationWhatsappPhone",
                patient.notification_whatsapp_phone,
                { type: "tel", maxLength: 20, pattern: "\\+?[0-9]{7,15}" },
            ),
            formField("Correo de notificaciones", "notificationEmail", patient.notification_email, {
                type: "email",
                maxLength: 254,
                wide: true,
            }),
        ];
        const bloodOptions = [
            { value: "", label: "Sin registrar" },
            ...["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((value) => ({
                value,
                label: value,
            })),
        ];
        const medicalFields = [
            formField("Tipo de sangre", "bloodType", patient.blood_type, { options: bloodOptions }),
            formField("Alergias", "allergies", patient.allergies, {
                type: "textarea",
                maxLength: 255,
            }),
            formField(
                "Condiciones médicas existentes",
                "existingConditions",
                patient.existing_conditions,
                { type: "textarea", maxLength: 255 },
            ),
        ];
        const emergency = editingUser.emergencyContact || {};
        const emergencyFields = [
            formField("Nombres", "emergencyFirstName", emergency.first_name, { maxLength: 50 }),
            formField("Apellidos", "emergencyLastName", emergency.last_name, { maxLength: 50 }),
            formField("Teléfono", "emergencyPhone", emergency.phone, {
                type: "tel",
                maxLength: 15,
                pattern: "[0-9]{7,15}",
            }),
            formField("Correo", "emergencyEmail", emergency.email, {
                type: "email",
                maxLength: 254,
            }),
            formField("Parentesco", "emergencyRelationship", emergency.relationship, {
                maxLength: 50,
            }),
        ];
        const emergencySection = formSection("Contacto de emergencia", emergencyFields);
        const emergencyNote = document.createElement("p");
        emergencyNote.className = "admin-user-form-hint";
        emergencyNote.textContent =
            "Dato opcional para demostraciones: usa información ficticia. SaludVital no contacta a esta persona ni le envía mensajes.";
        emergencySection.insertBefore(emergencyNote, emergencySection.children[1]);

        editFields.replaceChildren(
            formSection("Cuenta", [email]),
            formSection("Datos personales", personalFields),
            formSection("Contactos de notificación", notificationFields),
            formSection("Información médica", medicalFields),
            emergencySection,
        );

        const departmentSelect = editFields.querySelector('[name="departmentCode"]');
        const municipalitySelect = editFields.querySelector('[name="municipalityCode"]');
        departmentSelect.addEventListener("change", async () => {
            const departmentCode = departmentSelect.value;
            const requestVersion = ++municipalityRequestVersion;
            municipalitySelect.replaceChildren(new Option("Cargando municipios…", ""));
            try {
                const url = new URL(page.dataset.municipalitiesEndpoint, window.location.origin);
                url.searchParams.set("departmentCode", departmentCode);
                const response = await fetch(url, { headers: { Accept: "application/json" } });
                const values = await response.json();
                if (
                    !isCurrentMunicipalityRequest(
                        editorVersion,
                        editorUserId,
                        requestVersion,
                        departmentCode,
                        departmentSelect,
                    )
                ) {
                    return;
                }
                if (!response.ok)
                    throw new Error(values.message || "No pudimos cargar los municipios.");
                municipalitySelect.replaceChildren(new Option("Selecciona un municipio", ""));
                values.forEach((municipality) =>
                    municipalitySelect.add(new Option(municipality.name, municipality.code)),
                );
            } catch (error) {
                if (
                    !isCurrentMunicipalityRequest(
                        editorVersion,
                        editorUserId,
                        requestVersion,
                        departmentCode,
                        departmentSelect,
                    )
                ) {
                    return;
                }
                municipalitySelect.replaceChildren(new Option("Selecciona un municipio", ""));
                setModalFeedback(error.message, "error");
            }
        });
    }

    function addDoctorFields(user, specialties) {
        const doctor = user.doctor;
        const fields = [
            formSection("Cuenta", [
                formField("Correo de la cuenta", "email", user.email, {
                    type: "email",
                    required: true,
                    maxLength: 320,
                    wide: true,
                }),
            ]),
            formSection("Datos del médico", [
                formField("Nombre visible", "displayName", doctor.display_name, {
                    required: true,
                    maxLength: 120,
                    wide: true,
                }),
                doctorPhotoField({ ...doctor, profile_photo_url: user.profilePhotoUrl }),
                formField("Especialidad", "specialtyId", String(doctor.specialty_id), {
                    required: true,
                    options: specialties.map((specialty) => ({
                        value: String(specialty.id),
                        label: specialty.name,
                    })),
                    wide: true,
                }),
                formField(
                    "Información profesional",
                    "professionalInformation",
                    doctor.professional_information,
                    {
                        type: "textarea",
                        maxLength: 10000,
                        wide: true,
                    },
                ),
            ]),
        ];
        editFields.replaceChildren(...fields);
    }

    function setModalFeedback(message, kind = "error") {
        modalFeedback.textContent = message;
        modalFeedback.dataset.kind = kind;
    }

    function isCurrentEditRequest(requestVersion, userId) {
        return (
            requestVersion === editRequestVersion &&
            !modal.hidden &&
            Number(editingUser?.id ?? userId) === Number(userId)
        );
    }

    function isCurrentMunicipalityRequest(
        editorVersion,
        userId,
        requestVersion,
        departmentCode,
        departmentSelect,
    ) {
        return (
            isCurrentEditRequest(editorVersion, userId) &&
            requestVersion === municipalityRequestVersion &&
            editFields.contains(departmentSelect) &&
            departmentSelect.value === departmentCode
        );
    }

    function closeEditModal(force = false) {
        if (saveButton.disabled && !force) return;
        editRequestVersion += 1;
        municipalityRequestVersion += 1;
        modal.hidden = true;
        document.body.classList.remove("has-admin-modal");
        editFields.replaceChildren();
        editingUser = null;
        doctorPhotoDataUrl = null;
        doctorPhotoReadPromise = Promise.resolve();
        if (focusedBeforeModal?.isConnected) focusedBeforeModal.focus();
        else searchInput.focus();
    }

    async function openEditModal(userId, trigger) {
        const requestVersion = ++editRequestVersion;
        municipalityRequestVersion += 1;
        const requestedUserId = Number(userId);
        focusedBeforeModal = trigger;
        doctorPhotoDataUrl = null;
        doctorPhotoReadPromise = Promise.resolve();
        editingUser = null;
        modal.hidden = false;
        document.body.classList.add("has-admin-modal");
        dialog.focus();
        modalProfile.textContent = "Cargando información del usuario…";
        editFields.replaceChildren();
        setModalFeedback("");
        try {
            const response = await fetch(`${page.dataset.detailsEndpoint}/${userId}`, {
                headers: { Accept: "application/json" },
                cache: "no-store",
            });
            const data = await response.json();
            if (!isCurrentEditRequest(requestVersion, requestedUserId)) return;
            if (!response.ok) throw new Error(data.message || "No pudimos cargar el perfil.");
            editingUser = data.user;
            addRoleProfilePhoto(modalProfile, data.user);
            if (data.user.profileType === "Patient") {
                addPatientFields(data.user, data.departments, data.municipalities);
            } else if (data.user.profileType === "Doctor") {
                addDoctorFields(data.user, data.specialties);
            } else {
                throw new Error("Esta cuenta no tiene un perfil de paciente o médico editable.");
            }
            editFields.querySelector("input, select, textarea")?.focus();
        } catch (error) {
            if (!isCurrentEditRequest(requestVersion, requestedUserId)) return;
            setModalFeedback(error.message || "No pudimos cargar el perfil.");
        }
    }

    async function saveEditedProfile(event) {
        event.preventDefault();
        if (!editingUser || !editForm.reportValidity()) return;

        try {
            await doctorPhotoReadPromise;
        } catch (error) {
            setModalFeedback(error.message || "No se pudo leer la foto seleccionada.");
            return;
        }

        const values = new FormData(editForm);
        const value = (name) => values.get(name) || "";
        const payload = { email: value("email") };
        if (editingUser.profileType === "Patient") {
            payload.patient = {
                firstName: value("firstName"),
                lastName: value("lastName"),
                phone: value("phone"),
                dateOfBirth: value("dateOfBirth"),
                documentType: value("documentType"),
                documentNumber: value("documentNumber"),
                departmentCode: value("departmentCode"),
                municipalityCode: value("municipalityCode"),
                address: value("address"),
                notificationPhone: value("notificationPhone"),
                notificationWhatsappPhone: value("notificationWhatsappPhone"),
                notificationEmail: value("notificationEmail"),
                bloodType: value("bloodType"),
                allergies: value("allergies"),
                existingConditions: value("existingConditions"),
                profilePhotoUrl: value("profilePhotoUrl"),
            };
            payload.emergencyContact = {
                firstName: value("emergencyFirstName"),
                lastName: value("emergencyLastName"),
                phone: value("emergencyPhone"),
                email: value("emergencyEmail"),
                relationship: value("emergencyRelationship"),
            };
        } else {
            payload.doctor = {
                displayName: value("displayName"),
                specialtyId: value("specialtyId"),
                professionalInformation: value("professionalInformation"),
                profilePhotoUrl: value("profilePhotoUrl"),
            };
            if (doctorPhotoDataUrl) payload.doctor.photo = doctorPhotoDataUrl;
        }

        saveButton.disabled = true;
        setModalFeedback("Guardando cambios…", "status");
        try {
            const response = await fetch(
                `${page.dataset.updateEndpoint}/${editingUser.id}/profile`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify(payload),
                },
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No pudimos guardar los cambios.");
            const editedUserId = editingUser.id;
            closeEditModal(true);
            await loadUsers();
            document.querySelector(`[data-user-edit-id="${editedUserId}"]`)?.focus();
            setFeedback(data.message, "success");
        } catch (error) {
            setModalFeedback(error.message || "No pudimos guardar los cambios.");
        } finally {
            saveButton.disabled = false;
        }
    }

    function setRoleFeedback(message, kind = "error") {
        roleFeedback.textContent = message;
        roleFeedback.dataset.kind = kind;
    }

    function buildDoctorRoleFields(user) {
        const specialtyOptions = [
            { value: "", label: "Selecciona una especialidad" },
            ...state.specialties.map((specialty) => ({
                value: String(specialty.id),
                label: specialty.name,
            })),
        ];
        roleFields.replaceChildren(
            formSection("Información del médico", [
                formField("Nombre profesional", "displayName", user.displayName, {
                    required: true,
                    maxLength: 120,
                    wide: true,
                }),
                formField("Especialidad", "specialtyId", "", {
                    required: true,
                    options: specialtyOptions,
                    wide: true,
                }),
            ]),
        );
    }

    async function openRoleModal(user, targetRole, roleSelect) {
        changingRoleUser = user;
        changingRoleTarget = targetRole;
        roleSelectToRestore = roleSelect;
        focusedBeforeRoleModal =
            roleSelect || list.querySelector(`[data-user-edit-id="${user.id}"]`);
        roleFields.replaceChildren();
        roleImpact.hidden = true;
        roleImpact.textContent = "";
        setRoleFeedback("");
        roleSaveButton.disabled = true;
        roleSaveButton.textContent =
            targetRole.id === user.role.id ? "Completar perfil" : "Guardar rol y perfil";
        roleDialog.querySelector("h2").textContent =
            `Perfil de ${roleLabel(targetRole.name).toLowerCase()}`;
        roleModalProfile.textContent = `${user.displayName} · ${user.email}`;
        roleExplanation.textContent =
            targetRole.name === "Doctor"
                ? "El rol se guardará junto con el perfil médico. Si ya existe un perfil de paciente, se conservará con su historial."
                : user.hasPatientProfile
                  ? "El rol se guardará con el perfil de paciente que ya está registrado. Los registros médicos existentes se conservarán."
                  : "Para asignar el rol de paciente, la persona debe contar con un perfil y su consentimiento registrados.";
        roleModal.hidden = false;
        document.body.classList.add("has-admin-modal");
        roleSubmissionInProgress = false;
        roleDialog.focus();

        try {
            if (targetRole.name === "Doctor" && !user.isDoctorProfile) {
                buildDoctorRoleFields(user);
            } else if (targetRole.name === "Patient" && !user.hasPatientProfile) {
                const note = document.createElement("p");
                note.className = "admin-user-role-preserve-note";
                note.textContent =
                    "Primero registra el perfil de paciente con el titular de la cuenta. El administrador no puede aceptar el consentimiento en su nombre.";
                roleFields.replaceChildren(note);
                setRoleFeedback(
                    "El cambio de rol está bloqueado hasta que exista el perfil de paciente.",
                    "status",
                );
                return;
            } else {
                const note = document.createElement("p");
                note.className = "admin-user-role-preserve-note";
                note.textContent =
                    "El perfil necesario ya está registrado. El cambio conservará los datos e historiales existentes.";
                roleFields.replaceChildren(note);
            }

            if (targetRole.name === "Patient" && user.role.name === "Doctor" && user.doctorId) {
                const response = await fetch(
                    `${page.dataset.doctorStatusEndpoint}/${user.doctorId}/status-impact`,
                    { headers: { Accept: "application/json" }, cache: "no-store" },
                );
                const impact = await response.json();
                if (!response.ok) {
                    throw new Error(impact.message || "No pudimos revisar las citas futuras.");
                }
                roleImpact.textContent = impact.upcomingAppointmentCount
                    ? `${impact.upcomingAppointmentCount} citas futuras confirmadas se cancelarán y sus pacientes recibirán una notificación.`
                    : "No hay citas futuras confirmadas para cancelar. El historial médico se conservará.";
                roleImpact.hidden = false;
            }
            roleSaveButton.disabled = false;
            roleFields.querySelector("input, select, textarea")?.focus();
        } catch (error) {
            setRoleFeedback(error.message || "No pudimos preparar el cambio de perfil.");
        }
    }

    function closeRoleModal(force = false) {
        if (roleSubmissionInProgress && !force) return;
        roleModal.hidden = true;
        roleFields.replaceChildren();
        if (roleSelectToRestore && changingRoleUser) {
            roleSelectToRestore.value = String(changingRoleUser.role.id);
        }
        changingRoleUser = null;
        changingRoleTarget = null;
        roleSelectToRestore = null;
        if (modal.hidden) document.body.classList.remove("has-admin-modal");
        if (focusedBeforeRoleModal?.isConnected) focusedBeforeRoleModal.focus();
        else searchInput.focus();
        focusedBeforeRoleModal = null;
    }

    async function saveRoleConversion(event) {
        event.preventDefault();
        if (!changingRoleUser || !changingRoleTarget || !roleForm.reportValidity()) return;
        const values = new FormData(roleForm);
        const value = (name) => String(values.get(name) || "").trim();
        const payload = { roleId: changingRoleTarget.id };
        if (changingRoleTarget.name === "Doctor" && !changingRoleUser.isDoctorProfile) {
            payload.doctor = {
                displayName: value("displayName"),
                specialtyId: value("specialtyId"),
            };
        }
        const changedUserId = changingRoleUser.id;
        roleSubmissionInProgress = true;
        roleSaveButton.disabled = true;
        setRoleFeedback("Guardando el rol y el perfil…", "status");
        try {
            const response = await fetch(`${page.dataset.roleEndpoint}/${changedUserId}/role`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No pudimos guardar el cambio.");
            closeRoleModal(true);
            await loadUsers();
            document.querySelector(`[data-user-edit-id="${changedUserId}"]`)?.focus();
            setFeedback(data.message, "success");
        } catch (error) {
            setRoleFeedback(error.message || "Ocurrió un error al cambiar el rol.");
        } finally {
            roleSubmissionInProgress = false;
            roleSaveButton.disabled = false;
        }
    }

    function confirmDoctorDeactivation(doctorName, appointmentCount) {
        return new Promise((resolve) => {
            const dialogElement = document.createElement("dialog");
            dialogElement.className = "admin-user-doctor-status-dialog";
            const content = document.createElement("div");
            content.className = "admin-user-doctor-status-content";
            const title = document.createElement("h2");
            title.textContent = "Desactivar médico";
            const description = document.createElement("p");
            const appointmentMessage = appointmentCount
                ? `${appointmentCount} citas futuras confirmadas se cancelarán y sus pacientes recibirán una notificación.`
                : "No hay citas futuras confirmadas que deban cancelarse.";
            description.textContent = `La cuenta de ${doctorName} perderá acceso de inmediato. ${appointmentMessage} El historial se conservará.`;
            const actions = document.createElement("div");
            actions.className = "admin-user-doctor-status-actions";
            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.className = "admin-user-cancel";
            cancelButton.textContent = "Volver";
            const confirmButton = document.createElement("button");
            confirmButton.type = "button";
            confirmButton.className = "admin-user-doctor-status-confirm";
            confirmButton.textContent = "Desactivar cuenta";
            actions.append(cancelButton, confirmButton);
            content.append(title, description, actions);
            dialogElement.append(content);
            document.body.append(dialogElement);
            cancelButton.addEventListener("click", () => dialogElement.close("cancel"));
            confirmButton.addEventListener("click", () => dialogElement.close("confirm"));
            dialogElement.addEventListener("close", () => {
                const confirmed = dialogElement.returnValue === "confirm";
                dialogElement.remove();
                resolve(confirmed);
            });
            dialogElement.showModal();
            cancelButton.focus();
        });
    }

    async function changeDoctorAccountStatus(user, isActive, button) {
        button.disabled = true;
        setFeedback("Revisando el estado de la cuenta médica…");
        try {
            const endpoint = `${page.dataset.doctorStatusEndpoint}/${user.doctorId}`;
            if (!isActive) {
                const impactResponse = await fetch(`${endpoint}/status-impact`, {
                    headers: { Accept: "application/json" },
                    cache: "no-store",
                });
                const impact = await impactResponse.json();
                if (!impactResponse.ok) {
                    throw new Error(impact.message || "No pudimos revisar las citas del médico.");
                }
                if (
                    !(await confirmDoctorDeactivation(
                        user.displayName,
                        impact.upcomingAppointmentCount,
                    ))
                ) {
                    setFeedback("");
                    return;
                }
            }

            const response = await fetch(`${endpoint}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ isActive }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No pudimos actualizar la cuenta.");
            await loadUsers();
            setFeedback(data.message, "success");
        } catch (error) {
            setFeedback(error.message || "Ocurrió un error al actualizar la cuenta.", "error");
        } finally {
            button.disabled = false;
        }
    }

    modal
        .querySelectorAll("[data-user-modal-close], [data-user-modal-cancel]")
        .forEach((button) => {
            button.addEventListener("click", closeEditModal);
        });
    modal.addEventListener("click", (event) => {
        if (event.target === modal) closeEditModal();
    });
    modal.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const focusable = [
            ...modal.querySelectorAll(
                "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
            ),
        ];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    editForm.addEventListener("submit", saveEditedProfile);
    roleForm.addEventListener("submit", saveRoleConversion);
    roleModal
        .querySelectorAll("[data-role-modal-close], [data-role-modal-cancel]")
        .forEach((button) => button.addEventListener("click", () => closeRoleModal()));
    roleModal.addEventListener("click", (event) => {
        if (event.target === roleModal) closeRoleModal();
    });
    roleDialog.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const focusable = [
            ...roleDialog.querySelectorAll(
                "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
            ),
        ];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    function createUserCard(user, roles) {
        const card = document.createElement("article");
        card.className = "admin-user-card";

        const identity = document.createElement("div");
        identity.className = "admin-user-identity";
        const initials = document.createElement("span");
        initials.className = "admin-user-initials";
        initials.setAttribute("aria-hidden", "true");
        initials.textContent = user.displayName
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0] || "")
            .join("")
            .toUpperCase();
        if (user.profilePhotoUrl) {
            initials.hidden = true;
            const image = document.createElement("img");
            image.className = "admin-user-photo";
            image.src = user.profilePhotoUrl;
            image.alt = `Foto de ${user.displayName}`;
            image.addEventListener(
                "error",
                () => {
                    image.remove();
                    initials.hidden = false;
                },
                { once: true },
            );
            identity.append(image);
        }
        const identityText = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = user.displayName;
        const email = document.createElement("small");
        email.textContent = user.email;
        identityText.append(name, email);
        identity.append(initials, identityText);

        const roleSelect = document.createElement("select");
        roleSelect.className = "admin-user-role-select";
        roleSelect.setAttribute("aria-label", `Rol de ${user.displayName}`);
        roleSelect.disabled = Boolean(user.isPendingInvitation);
        if (user.isPendingInvitation) {
            roleSelect.title = "Completa la activación desde Invitaciones pendientes.";
        }
        roles
            .filter((role) => role.name !== "Administrator" || role.id === user.role.id)
            .forEach((role) => {
                const option = document.createElement("option");
                option.value = String(role.id);
                option.textContent = roleLabel(role.name);
                option.selected = role.id === user.role.id;
                roleSelect.append(option);
            });
        roleSelect.addEventListener("change", () => {
            const selectedRole = Number(roleSelect.value);
            const selected = roles.find((role) => role.id === selectedRole);
            if (!selected) {
                roleSelect.value = String(user.role.id);
                return;
            }
            void openRoleModal(user, selected, roleSelect);
        });

        const roleField = createField("Rol asignado", roleSelect, "admin-user-role");
        const profile = document.createElement("strong");
        profile.textContent = user.profileType;
        const profileField = createField("Tipo de perfil", profile, "admin-user-profile");
        if (user.profileMismatch) {
            const completeProfile = document.createElement("button");
            completeProfile.type = "button";
            completeProfile.className = "admin-user-complete-profile";
            completeProfile.textContent = "Completar perfil";
            completeProfile.addEventListener(
                "click",
                () => void openRoleModal(user, user.role, roleSelect),
            );
            profileField.append(completeProfile);
        }
        const lastLogin = document.createElement("strong");
        lastLogin.textContent = formatDate(user.lastLoginAt);
        const lastLoginField = createField("Último acceso", lastLogin, "admin-user-last-login");

        const actions = document.createElement("div");
        actions.className = "admin-user-actions";
        if (user.isPendingInvitation) {
            const pendingNote = document.createElement("span");
            pendingNote.className = "admin-user-pending-note";
            pendingNote.textContent = "Gestiona esta cuenta en Invitaciones pendientes";
            actions.append(pendingNote);
            card.append(identity, roleField, profileField, lastLoginField, actions);
            return card;
        }
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "admin-user-edit";
        editButton.dataset.userEditId = String(user.id);
        editButton.setAttribute("aria-label", `Editar datos de ${user.displayName}`);
        editButton.title = "Editar datos";
        editButton.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 5 5 5M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/></svg>';
        editButton.addEventListener("click", () => void openEditModal(user.id, editButton));
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = `admin-user-toggle ${user.isActive ? "is-deactivation" : "is-activation"}`;
        toggle.textContent = user.isActive ? "Desactivar cuenta" : "Activar cuenta";
        toggle.setAttribute(
            "aria-label",
            `${user.isActive ? "Desactivar" : "Activar"} la cuenta de ${user.displayName}`,
        );
        toggle.addEventListener("click", () => {
            const nextIsActive = !user.isActive;
            if (user.role.name === "Doctor" && user.doctorId) {
                void changeDoctorAccountStatus(user, nextIsActive, toggle);
                return;
            }
            const action = nextIsActive ? "activar" : "desactivar";
            if (!window.confirm(`¿Confirmas ${action} la cuenta de ${user.displayName}?`)) return;
            void updateUser(user, { isActive: nextIsActive });
        });
        actions.append(editButton);
        if (user.role.name !== "Doctor" || user.doctorId) actions.append(toggle);
        card.append(identity, roleField, profileField, lastLoginField, actions);
        return card;
    }

    function renderUsers(data) {
        state.specialties = data.specialties || [];
        if (roleFilter.options.length === 1) {
            data.roles.forEach((role) => {
                const option = document.createElement("option");
                option.value = String(role.id);
                option.textContent = roleLabel(role.name);
                roleFilter.append(option);
            });
        }
        list.replaceChildren();
        countLabel.textContent = Number(data.pagination.totalItems).toLocaleString("es-CO");
        state.totalPages = Math.max(1, data.pagination.totalPages);
        pageLabel.textContent = `Página ${state.page} de ${state.totalPages}`;
        previousButton.disabled = state.page <= 1;
        nextButton.disabled = state.page >= state.totalPages;

        if (!data.users.length) {
            const empty = document.createElement("div");
            empty.className = "admin-users-empty";
            empty.textContent = "No encontramos cuentas con esos filtros.";
            list.append(empty);
            return;
        }
        data.users.forEach((user) => list.append(createUserCard(user, data.roles)));

        if (pendingEditUserId) {
            const trigger = list.querySelector(`[data-user-edit-id="${pendingEditUserId}"]`);
            if (trigger) {
                const userId = pendingEditUserId;
                pendingEditUserId = null;
                const url = new URL(window.location.href);
                url.searchParams.delete("edit");
                window.history.replaceState({}, "", url);
                void openEditModal(userId, trigger);
            }
        }
    }

    async function loadUsers() {
        activeRequest?.abort();
        activeRequest = new AbortController();
        setFeedback("Cargando cuentas…");
        const params = new URLSearchParams({
            page: String(state.page),
            pageSize: String(state.pageSize),
        });
        if (state.search) params.set("search", state.search);
        if (state.roleId) params.set("roleId", state.roleId);
        if (state.status) params.set("status", state.status);

        try {
            const response = await fetch(`${page.dataset.endpoint}?${params}`, {
                headers: { Accept: "application/json" },
                cache: "no-store",
                signal: activeRequest.signal,
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No pudimos cargar las cuentas.");
            renderUsers(data);
            setFeedback(
                data.users.length ? "" : "Ajusta la búsqueda o los filtros para ver otras cuentas.",
            );
        } catch (error) {
            if (error.name === "AbortError") return;
            list.replaceChildren();
            setFeedback(error.message || "Ocurrió un error al cargar las cuentas.", "error");
        }
    }

    const invitationModal = document.querySelector("[data-invitation-modal]");
    const invitationDialog = document.querySelector("[data-invitation-dialog]");
    const invitationForm = document.querySelector("[data-invitation-form]");
    const invitationList = document.querySelector("[data-invitation-list]");
    const invitationFeedback = document.querySelector("[data-invitation-feedback]");
    const invitationModalFeedback = document.querySelector("[data-invitation-modal-feedback]");
    const invitationNote = document.querySelector("[data-invitation-note]");
    const invitationSubmit = document.querySelector("[data-invitation-submit]");
    let focusedBeforeInvitation;

    function setInvitationFeedback(message, kind = "") {
        invitationFeedback.textContent = message;
        invitationFeedback.classList.toggle("is-error", kind === "error");
        invitationFeedback.classList.toggle("is-success", kind === "success");
    }

    function invitationStatus(status) {
        const labels = {
            pending: "Correo pendiente",
            sent: "Invitación enviada",
            failed: "No se pudo enviar",
            expired: "Enlace vencido",
        };
        return labels[status] || "Correo pendiente";
    }

    function invitationIcon(kind) {
        return kind === "administrator"
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 7.6 7.5 9.5 4.3-1.9 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    }

    function invitationActionButton(label, className, iconMarkup, handler) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `admin-invitation-action ${className}`;
        button.setAttribute("aria-label", label);
        button.title = label;
        button.innerHTML = iconMarkup;
        button.addEventListener("click", handler);
        return button;
    }

    async function loadInvitations() {
        try {
            const response = await fetch(page.dataset.invitationsEndpoint, {
                headers: { Accept: "application/json" },
                cache: "no-store",
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.message || "No pudimos cargar las invitaciones.");
            renderInvitations(data.invitations || []);
        } catch (error) {
            invitationList.replaceChildren();
            setInvitationFeedback(error.message || "No pudimos cargar las invitaciones.", "error");
        }
    }

    function renderInvitations(invitations) {
        invitationList.replaceChildren();
        if (!invitations.length) {
            const empty = document.createElement("p");
            empty.className = "admin-invitations-empty";
            empty.textContent = "No hay invitaciones pendientes. Las nuevas aparecerán aquí.";
            invitationList.append(empty);
            setInvitationFeedback("");
            return;
        }

        invitations.forEach((invitation) => {
            const row = document.createElement("article");
            row.className = "admin-invitation-row";
            const symbol = document.createElement("span");
            symbol.className = `admin-invitation-avatar${invitation.accountType === "administrator" ? " is-admin" : ""}`;
            symbol.innerHTML = invitationIcon(invitation.accountType);
            const identity = document.createElement("div");
            identity.className = "admin-invitation-identity";
            const name = document.createElement("strong");
            name.textContent = invitation.displayName || invitation.email;
            const email = document.createElement("span");
            email.textContent = invitation.email;
            identity.append(name, email);
            const role = document.createElement("span");
            role.className = "admin-invitation-role";
            role.textContent = invitation.role;
            const status = document.createElement("span");
            status.className = `admin-invitation-status is-${invitation.status}`;
            status.textContent = invitationStatus(invitation.status);
            const actions = document.createElement("div");
            actions.className = "admin-invitation-actions";
            const resendIcon =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></svg>';
            const cancelIcon =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg>';
            actions.append(
                invitationActionButton("Volver a enviar", "is-resend", resendIcon, () => {
                    void manageInvitation(invitation.id, "resend");
                }),
                invitationActionButton("Cancelar invitación", "is-cancel", cancelIcon, () => {
                    void manageInvitation(invitation.id, "cancel");
                }),
            );
            row.append(symbol, identity, role, status, actions);
            invitationList.append(row);
        });
        setInvitationFeedback(
            `${invitations.length} ${invitations.length === 1 ? "invitación pendiente" : "invitaciones pendientes"}.`,
        );
    }

    async function manageInvitation(invitationId, action) {
        if (
            action === "cancel" &&
            !window.confirm(
                "¿Quieres cancelar esta invitación? La persona ya no podrá usar el enlace.",
            )
        ) {
            return;
        }
        const endpoint = `${page.dataset.invitationsEndpoint}/${invitationId}`;
        try {
            const response = await fetch(action === "resend" ? `${endpoint}/resend` : endpoint, {
                method: action === "resend" ? "POST" : "DELETE",
                headers: { Accept: "application/json" },
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.message || "No pudimos actualizar la invitación.");
            setInvitationFeedback(data.message, "success");
            await loadInvitations();
        } catch (error) {
            setInvitationFeedback(error.message || "No pudimos actualizar la invitación.", "error");
        }
    }

    function openInvitationModal() {
        focusedBeforeInvitation = document.activeElement;
        invitationModal.hidden = false;
        document.body.classList.add("has-admin-modal");
        invitationDialog.querySelector("input[name='displayName']")?.focus();
    }

    function closeInvitationModal() {
        invitationModal.hidden = true;
        document.body.classList.remove("has-admin-modal");
        invitationForm.reset();
        invitationModalFeedback.textContent = "";
        document.querySelector("[data-account-role-card]")?.classList.add("is-selected");
        focusedBeforeInvitation?.focus();
    }

    document
        .querySelector("[data-invitation-open]")
        ?.addEventListener("click", openInvitationModal);
    invitationModal
        .querySelectorAll("[data-invitation-close], [data-invitation-cancel]")
        .forEach((button) => button.addEventListener("click", closeInvitationModal));
    invitationModal.addEventListener("click", (event) => {
        if (event.target === invitationModal) closeInvitationModal();
    });
    invitationDialog.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const focusable = [
            ...invitationDialog.querySelectorAll(
                "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
            ),
        ];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    invitationModal.querySelectorAll("input[name='accountType']").forEach((radio) => {
        radio.addEventListener("change", () => {
            invitationModal.querySelectorAll("[data-account-role-card]").forEach((card) => {
                card.classList.toggle("is-selected", card.querySelector("input").checked);
            });
            invitationNote.textContent =
                radio.value === "patient"
                    ? "El paciente completa su información personal y de salud, acepta el aviso de privacidad y crea su propia contraseña."
                    : "El administrador confirma su correo y elige su contraseña antes de poder ingresar al panel.";
        });
    });
    invitationForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        invitationSubmit.disabled = true;
        invitationModalFeedback.textContent = "Enviando invitación…";
        const formData = new FormData(invitationForm);
        try {
            const response = await fetch(page.dataset.invitationsEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(Object.fromEntries(formData)),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No pudimos crear la invitación.");
            closeInvitationModal();
            setInvitationFeedback(data.message, "success");
            await Promise.all([loadInvitations(), loadUsers()]);
        } catch (error) {
            invitationModalFeedback.textContent =
                error.message || "No pudimos crear la invitación.";
        } finally {
            invitationSubmit.disabled = false;
        }
    });

    async function updateUser(user, changes) {
        document
            .querySelectorAll(".admin-user-role-select, .admin-user-toggle")
            .forEach((control) => {
                control.disabled = true;
            });
        setFeedback("Guardando cambios…");
        try {
            const response = await fetch(`${page.dataset.updateEndpoint}/${user.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(changes),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No pudimos guardar los cambios.");
            await loadUsers();
            setFeedback(data.message, "success");
        } catch (error) {
            await loadUsers();
            setFeedback(error.message || "Ocurrió un error al guardar los cambios.", "error");
        }
    }

    function applySearch(value) {
        state.search = value.trim();
        state.page = 1;
        if (searchInput.value !== value) searchInput.value = value;
        void loadUsers();
    }

    let searchTimer;
    document.querySelector("[data-user-filters]")?.addEventListener("submit", (event) => {
        event.preventDefault();
        applySearch(searchInput.value);
    });
    searchInput.addEventListener("input", () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => applySearch(searchInput.value), 250);
    });
    roleFilter.addEventListener("change", () => {
        state.roleId = roleFilter.value;
        state.page = 1;
        void loadUsers();
    });
    statusFilter.addEventListener("change", () => {
        state.status = statusFilter.value;
        state.page = 1;
        void loadUsers();
    });
    previousButton.addEventListener("click", () => {
        if (state.page > 1) {
            state.page -= 1;
            void loadUsers();
        }
    });
    nextButton.addEventListener("click", () => {
        if (state.page < state.totalPages) {
            state.page += 1;
            void loadUsers();
        }
    });

    function closeMenu() {
        app.classList.remove("is-sidebar-open");
        document.querySelector("[data-admin-open]")?.setAttribute("aria-expanded", "false");
    }

    document.querySelector("[data-admin-open]")?.addEventListener("click", () => {
        app.classList.add("is-sidebar-open");
        document.querySelector("[data-admin-open]")?.setAttribute("aria-expanded", "true");
        sidebar?.querySelector('a[href="/admin/users"]')?.focus();
    });
    document.querySelectorAll("[data-admin-close]").forEach((button) => {
        button.addEventListener("click", closeMenu);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!invitationModal.hidden) {
            closeInvitationModal();
            return;
        }
        if (!roleModal.hidden) {
            closeRoleModal();
            return;
        }
        if (!modal.hidden) {
            closeEditModal();
            return;
        }
        closeMenu();
    });

    void loadUsers();
    void loadInvitations();
}
