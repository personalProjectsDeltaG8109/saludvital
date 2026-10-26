const specialtiesPage = document.querySelector("[data-admin-specialties]");

if (specialtiesPage) {
    const endpoint = specialtiesPage.dataset.endpoint;
    const list = specialtiesPage.querySelector("[data-specialty-list]");
    const feedback = specialtiesPage.querySelector("[data-specialty-feedback]");
    const errorMessage = specialtiesPage.querySelector("[data-specialty-error]");
    const search = specialtiesPage.querySelector("[data-specialty-search]");
    const status = specialtiesPage.querySelector("[data-specialty-status]");
    const pageSize = specialtiesPage.querySelector("[data-specialty-page-size]");
    const topSearch = document.querySelector("[data-user-top-search]");
    const topSearchForm = document.querySelector(".admin-global-search");
    const adminApp = document.querySelector(".admin-app");
    const sidebar = document.querySelector("[data-admin-sidebar]");
    let currentPage = 1;
    const pageQuery = new URLSearchParams(window.location.search);
    const specialtyCreated = pageQuery.get("created") === "1";
    const specialtyUpdated = pageQuery.get("updated") === "1";
    let specialtyStatusFeedback = "";
    if (pageQuery.has("search")) {
        search.value = pageQuery.get("search") || "";
        if (topSearch) topSearch.value = search.value;
    }

    function closeSidebar() {
        adminApp.classList.remove("is-sidebar-open");
        document.querySelector("[data-admin-open]")?.setAttribute("aria-expanded", "false");
    }

    document.querySelector("[data-admin-open]")?.addEventListener("click", () => {
        adminApp.classList.add("is-sidebar-open");
        document.querySelector("[data-admin-open]")?.setAttribute("aria-expanded", "true");
        sidebar?.querySelector('a[href="/admin/specialties"]')?.focus();
    });
    document.querySelectorAll("[data-admin-close]").forEach((control) => {
        control.addEventListener("click", closeSidebar);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeSidebar();
    });

    function createSpecialtyIcon() {
        const wrapper = document.createElement("span");
        wrapper.className = "specialty-row-icon";
        wrapper.setAttribute("aria-hidden", "true");

        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("fill", "none");
        icon.setAttribute("stroke", "currentColor");
        icon.setAttribute("stroke-width", "1.8");
        icon.setAttribute("stroke-linecap", "round");
        icon.setAttribute("stroke-linejoin", "round");

        const paths = ["m12 3 9 5-9 5-9-5 9-5Z", "m3 12 9 5 9-5", "m3 16 9 5 9-5"];
        for (const pathData of paths) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", pathData);
            icon.append(path);
        }

        wrapper.append(icon);
        return wrapper;
    }

    function createCell(label, className = "") {
        const cell = document.createElement("td");
        cell.dataset.label = label;
        if (className) cell.className = className;
        return cell;
    }

    function createSpecialtyRow(specialty, index) {
        const row = document.createElement("tr");
        const number = createCell("Número");
        number.textContent = String((currentPage - 1) * Number(pageSize.value) + index + 1);

        const name = createCell("Especialidad");
        name.className = "specialty-name-cell";
        name.append(createSpecialtyIcon());
        const nameText = document.createElement("span");
        nameText.textContent = specialty.name;
        name.append(nameText);

        const description = createCell("Descripción", "specialty-description");
        description.textContent = specialty.description || "Sin descripción";

        const doctorCount = createCell("Médicos", "specialty-doctor-count");
        doctorCount.textContent = String(specialty.doctorCount);

        const state = createCell("Estado");
        const badge = document.createElement("span");
        badge.className = `specialty-status-badge${specialty.isActive ? "" : " is-inactive"}`;
        badge.textContent = specialty.isActive ? "Activa" : "Inactiva";
        state.append(badge);

        const actions = createCell("Acciones", "specialty-actions-cell");
        const editLink = document.createElement("a");
        editLink.className = "specialty-edit-link";
        editLink.href = `/admin/specialties/${specialty.id}/edit`;
        editLink.setAttribute("aria-label", `Editar ${specialty.name}`);
        editLink.textContent = "Editar";
        actions.append(editLink);

        const statusButton = document.createElement("button");
        statusButton.className = `specialty-status-action${specialty.isActive ? " is-deactivate" : " is-activate"}`;
        statusButton.type = "button";
        statusButton.dataset.specialtyToggleStatus = specialty.isActive ? "deactivate" : "activate";
        statusButton.dataset.specialtyId = specialty.id;
        statusButton.dataset.specialtyName = specialty.name;
        statusButton.setAttribute(
            "aria-label",
            `${specialty.isActive ? "Desactivar" : "Activar"} ${specialty.name}`,
        );
        statusButton.textContent = specialty.isActive ? "Desactivar" : "Activar";
        actions.append(statusButton);

        row.append(number, name, description, doctorCount, state, actions);
        return row;
    }

    function renderSpecialties(specialties) {
        list.replaceChildren();

        if (!specialties.length) {
            const row = document.createElement("tr");
            row.className = "specialties-empty-row";
            const cell = document.createElement("td");
            cell.colSpan = 6;
            cell.textContent = "No encontramos especialidades con esos criterios.";
            row.append(cell);
            list.append(row);
            return;
        }

        specialties.forEach((specialty, index) => {
            list.append(createSpecialtyRow(specialty, index));
        });
    }

    function renderPagination(pagination) {
        const totalPages = Math.max(1, pagination.totalPages);
        const start = pagination.totalItems ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
        const end = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);

        specialtiesPage.querySelector("[data-specialty-page-summary]").textContent =
            `Mostrando ${start}–${end} de ${pagination.totalItems} especialidades`;
        specialtiesPage.querySelector("[data-specialty-page-label]").textContent =
            `${pagination.page} / ${totalPages}`;
        specialtiesPage.querySelector("[data-specialty-prev]").disabled = pagination.page <= 1;
        specialtiesPage.querySelector("[data-specialty-next]").disabled =
            pagination.page >= totalPages;
    }

    async function loadSpecialties() {
        feedback.textContent = "Cargando especialidades…";
        errorMessage.hidden = true;
        const params = new URLSearchParams({
            page: String(currentPage),
            pageSize: pageSize.value,
            status: status.value,
        });
        if (search.value.trim()) params.set("search", search.value.trim());

        try {
            const response = await fetch(`${endpoint}?${params}`, {
                headers: { Accept: "application/json" },
                cache: "no-store",
            });
            let data;
            try {
                data = await response.json();
            } catch {
                throw new Error("No pudimos cargar las especialidades. Inténtalo de nuevo.");
            }
            if (!response.ok) {
                throw new Error(
                    data.message || "No pudimos cargar las especialidades. Inténtalo de nuevo.",
                );
            }

            specialtiesPage.querySelector("[data-stat-total]").textContent = data.stats.total;
            specialtiesPage.querySelector("[data-stat-active]").textContent = data.stats.active;
            specialtiesPage.querySelector("[data-stat-inactive]").textContent = data.stats.inactive;
            specialtiesPage.querySelector("[data-stat-doctors]").textContent =
                data.stats.assignedDoctors;
            renderSpecialties(data.specialties);
            renderPagination(data.pagination);
            feedback.textContent =
                specialtyStatusFeedback ||
                (specialtyCreated
                    ? "La especialidad se creó correctamente y aparece en el catálogo."
                    : specialtyUpdated
                      ? "La especialidad se actualizó correctamente."
                      : data.pagination.totalItems
                        ? `${data.pagination.totalItems} especialidad${data.pagination.totalItems === 1 ? "" : "es"} encontrada${data.pagination.totalItems === 1 ? "" : "s"}.`
                        : "No hay especialidades para mostrar.");
            specialtyStatusFeedback = "";
        } catch (error) {
            list.replaceChildren();
            feedback.textContent = "No se pudieron cargar los datos.";
            errorMessage.textContent = error.message;
            errorMessage.hidden = false;
        }
    }

    specialtiesPage
        .querySelector("[data-specialty-filters]")
        .addEventListener("submit", (event) => {
            event.preventDefault();
            currentPage = 1;
            if (topSearch) topSearch.value = search.value;
            loadSpecialties();
        });

    list.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-specialty-toggle-status]");
        if (!button) return;

        const shouldActivate = button.dataset.specialtyToggleStatus === "activate";
        if (
            !shouldActivate &&
            !window.confirm(
                `¿Desactivar ${button.dataset.specialtyName}? No se podrá asignar ni reservar esta especialidad. Las relaciones y citas existentes se conservarán.`,
            )
        ) {
            return;
        }

        button.disabled = true;
        try {
            const response = await fetch(`${endpoint}/${button.dataset.specialtyId}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ isActive: shouldActivate }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No pudimos cambiar el estado.");

            specialtyStatusFeedback = `La especialidad se ${shouldActivate ? "activó" : "desactivó"} correctamente.`;
            await loadSpecialties();
        } catch (error) {
            feedback.textContent = "No se pudo cambiar el estado de la especialidad.";
            errorMessage.textContent = error.message;
            errorMessage.hidden = false;
            button.disabled = false;
        }
    });

    topSearchForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        search.value = topSearch.value;
        currentPage = 1;
        loadSpecialties();
    });

    search.addEventListener("input", () => {
        if (topSearch) topSearch.value = search.value;
    });
    topSearch?.addEventListener("input", () => {
        search.value = topSearch.value;
    });
    status.addEventListener("change", () => {
        currentPage = 1;
        loadSpecialties();
    });
    pageSize.addEventListener("change", () => {
        currentPage = 1;
        loadSpecialties();
    });
    specialtiesPage.querySelector("[data-specialty-prev]").addEventListener("click", () => {
        currentPage -= 1;
        loadSpecialties();
    });
    specialtiesPage.querySelector("[data-specialty-next]").addEventListener("click", () => {
        currentPage += 1;
        loadSpecialties();
    });

    loadSpecialties();
}
