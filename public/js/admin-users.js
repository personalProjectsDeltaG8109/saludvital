const page = document.querySelector("[data-admin-users]");

if (page) {
    const app = document.querySelector(".admin-app");
    const sidebar = document.querySelector("[data-admin-sidebar]");
    const searchInput = document.querySelector("[data-user-search]");
    const topSearchInput = document.querySelector("[data-user-top-search]");
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
    const modalProfile = document.querySelector("[data-user-modal-profile]");
    const modalFeedback = document.querySelector("[data-user-modal-feedback]");
    const editForm = document.querySelector("[data-user-edit-form]");
    const editFields = document.querySelector("[data-user-edit-fields]");
    const saveButton = document.querySelector("[data-user-modal-save]");
    const state = { page: 1, pageSize: 10, totalPages: 1, search: "", roleId: "", status: "" };
    let focusedBeforeModal;
    let editingUser;
    let activeRequest;

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
            maxLength: 100,
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

        editFields.replaceChildren(
            formSection("Cuenta", [email]),
            formSection("Datos personales", personalFields),
            formSection("Contactos de notificación", notificationFields),
            formSection("Información médica", medicalFields),
            formSection("Contacto de emergencia", emergencyFields),
        );

        const departmentSelect = editFields.querySelector('[name="departmentCode"]');
        const municipalitySelect = editFields.querySelector('[name="municipalityCode"]');
        departmentSelect.addEventListener("change", async () => {
            municipalitySelect.replaceChildren(new Option("Cargando municipios…", ""));
            try {
                const url = new URL(page.dataset.municipalitiesEndpoint, window.location.origin);
                url.searchParams.set("departmentCode", departmentSelect.value);
                const response = await fetch(url, { headers: { Accept: "application/json" } });
                const values = await response.json();
                if (!response.ok)
                    throw new Error(values.message || "No pudimos cargar los municipios.");
                municipalitySelect.replaceChildren(new Option("Selecciona un municipio", ""));
                values.forEach((municipality) =>
                    municipalitySelect.add(new Option(municipality.name, municipality.code)),
                );
            } catch (error) {
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
                    maxLength: 100,
                    wide: true,
                }),
            ]),
            formSection("Datos del médico", [
                formField("Nombre visible", "displayName", doctor.display_name, {
                    maxLength: 120,
                    wide: true,
                }),
                formField(
                    "Ruta de la foto de perfil",
                    "profilePhotoUrl",
                    doctor.profile_photo_url,
                    { wide: true, maxLength: 255, placeholder: "/uploads/profile-photos/..." },
                ),
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

    function closeEditModal(force = false) {
        if (saveButton.disabled && !force) return;
        modal.hidden = true;
        document.body.classList.remove("has-admin-modal");
        editFields.replaceChildren();
        editingUser = null;
        if (focusedBeforeModal?.isConnected) focusedBeforeModal.focus();
        else searchInput.focus();
    }

    async function openEditModal(userId, trigger) {
        focusedBeforeModal = trigger;
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
            setModalFeedback(error.message || "No pudimos cargar el perfil.");
        }
    }

    async function saveEditedProfile(event) {
        event.preventDefault();
        if (!editingUser || !editForm.reportValidity()) return;
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
            closeEditModal(true);
            await loadUsers();
            setFeedback(data.message, "success");
        } catch (error) {
            setModalFeedback(error.message || "No pudimos guardar los cambios.");
        } finally {
            saveButton.disabled = false;
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
        roles.forEach((role) => {
            const option = document.createElement("option");
            option.value = String(role.id);
            option.textContent = roleLabel(role.name);
            option.selected = role.id === user.role.id;
            roleSelect.append(option);
        });
        roleSelect.addEventListener("change", () => {
            const selectedRole = Number(roleSelect.value);
            const label = roleLabel(
                roles.find((role) => role.id === selectedRole)?.name || "este rol",
            );
            if (!window.confirm(`¿Confirmas cambiar el rol de ${user.displayName} a ${label}?`)) {
                roleSelect.value = String(user.role.id);
                return;
            }
            void updateUser(user, { roleId: selectedRole });
        });

        const roleField = createField("Rol asignado", roleSelect, "admin-user-role");
        const profile = document.createElement("strong");
        profile.textContent = user.profileType;
        const profileField = createField("Tipo de perfil", profile, "admin-user-profile");
        const lastLogin = document.createElement("strong");
        lastLogin.textContent = formatDate(user.lastLoginAt);
        const lastLoginField = createField("Último acceso", lastLogin, "admin-user-last-login");

        const actions = document.createElement("div");
        actions.className = "admin-user-actions";
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "admin-user-edit";
        editButton.setAttribute("aria-label", `Editar datos de ${user.displayName}`);
        editButton.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 5 5 5M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/></svg><span>Editar</span>';
        editButton.addEventListener("click", () => void openEditModal(user.id, editButton));
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = `admin-user-toggle${user.isActive ? "" : " is-inactive"}`;
        toggle.textContent = user.isActive ? "Desactivar cuenta" : "Activar cuenta";
        toggle.setAttribute(
            "aria-label",
            `${user.isActive ? "Desactivar" : "Activar"} la cuenta de ${user.displayName}`,
        );
        toggle.addEventListener("click", () => {
            const nextIsActive = !user.isActive;
            const action = nextIsActive ? "activar" : "desactivar";
            if (!window.confirm(`¿Confirmas ${action} la cuenta de ${user.displayName}?`)) return;
            void updateUser(user, { isActive: nextIsActive });
        });
        actions.append(editButton, toggle);
        card.append(identity, roleField, profileField, lastLoginField, actions);
        return card;
    }

    function renderUsers(data) {
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
        if (topSearchInput.value !== value) topSearchInput.value = value;
        void loadUsers();
    }

    let searchTimer;
    document.querySelector("[data-user-filters]")?.addEventListener("submit", (event) => {
        event.preventDefault();
        applySearch(searchInput.value);
    });
    document
        .querySelector("[data-user-top-search]")
        ?.closest("form")
        ?.addEventListener("submit", (event) => {
            event.preventDefault();
            applySearch(topSearchInput.value);
        });
    searchInput.addEventListener("input", () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => applySearch(searchInput.value), 250);
    });
    topSearchInput.addEventListener("input", () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => applySearch(topSearchInput.value), 250);
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
        if (!modal.hidden) {
            closeEditModal();
            return;
        }
        closeMenu();
    });

    void loadUsers();
}
