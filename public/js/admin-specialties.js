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

        row.append(number, name, description, doctorCount, state);
        return row;
    }

    function renderSpecialties(specialties) {
        list.replaceChildren();

        if (!specialties.length) {
            const row = document.createElement("tr");
            row.className = "specialties-empty-row";
            const cell = document.createElement("td");
            cell.colSpan = 5;
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
            feedback.textContent = data.pagination.totalItems
                ? `${data.pagination.totalItems} especialidad${data.pagination.totalItems === 1 ? "" : "es"} encontrada${data.pagination.totalItems === 1 ? "" : "s"}.`
                : "No hay especialidades para mostrar.";
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
