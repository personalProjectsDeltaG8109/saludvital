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
    const state = { page: 1, pageSize: 10, totalPages: 1, search: "", roleId: "", status: "" };
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
        actions.append(toggle);
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
        if (event.key === "Escape") closeMenu();
    });

    void loadUsers();
}
