const doctorsPage = document.querySelector("[data-doctors]");
const adminApp = document.querySelector(".admin-app");
const sidebar = document.querySelector("[data-admin-sidebar]");

function closeSidebar() {
    adminApp.classList.remove("is-sidebar-open");
    document.querySelector("[data-admin-open]")?.setAttribute("aria-expanded", "false");
}

document.querySelector("[data-admin-open]")?.addEventListener("click", () => {
    adminApp.classList.add("is-sidebar-open");
    document.querySelector("[data-admin-open]")?.setAttribute("aria-expanded", "true");
    sidebar?.querySelector('a[href="/admin/doctors"]')?.focus();
});
document.querySelectorAll("[data-admin-close]").forEach((control) => {
    control.addEventListener("click", closeSidebar);
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSidebar();
});

if (doctorsPage) {
    const search = doctorsPage.querySelector("[data-doctor-search]");
    const specialty = doctorsPage.querySelector("[data-doctor-specialty]");
    const status = doctorsPage.querySelector("[data-doctor-status]");
    const topSearch = document.querySelector("[data-user-top-search]");
    const topSearchForm = document.querySelector(".admin-global-search");
    const list = doctorsPage.querySelector("[data-doctor-list]");
    const feedback = doctorsPage.querySelector("[data-doctor-feedback]");
    let currentPage = 1;
    async function load() {
        feedback.textContent = "Cargando médicos…";
        const params = new URLSearchParams({ page: String(currentPage) });
        if (search.value.trim()) params.set("search", search.value.trim());
        if (specialty.value) params.set("specialtyId", specialty.value);
        if (status.value) params.set("status", status.value);
        try {
            const response = await fetch(`${doctorsPage.dataset.endpoint}?${params}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No se pudo cargar el directorio.");
            doctorsPage.querySelector("[data-stat-total]").textContent = data.stats.total;
            doctorsPage.querySelector("[data-stat-active]").textContent = data.stats.active;
            doctorsPage.querySelector("[data-stat-scheduled]").textContent = data.stats.scheduled;
            doctorsPage.querySelector("[data-stat-inactive]").textContent = data.stats.inactive;
            if (!specialty.options.length || specialty.options.length === 1)
                for (const item of data.specialties) specialty.add(new Option(item.name, item.id));
            list.replaceChildren();
            for (const doctor of data.doctors) {
                const article = document.createElement("article");
                article.className = "doctor-row";
                const avatar = document.createElement("span");
                avatar.className = "doctor-list-avatar";
                if (doctor.profilePhotoUrl?.startsWith("/uploads/profile-photos/")) {
                    const image = document.createElement("img");
                    image.src = doctor.profilePhotoUrl;
                    image.alt = "";
                    image.loading = "lazy";
                    avatar.append(image);
                } else {
                    avatar.textContent = doctor.name.trim().charAt(0).toUpperCase();
                }
                const info = document.createElement("div");
                info.className = "doctor-row-info";
                const name = document.createElement("strong");
                name.textContent = doctor.name;
                const detail = document.createElement("span");
                detail.textContent = `${doctor.specialty || "Sin especialidad"} · ${doctor.email}`;
                const schedule = document.createElement("small");
                schedule.textContent = doctor.hasSchedule
                    ? "Horario configurado"
                    : "Sin horario configurado";
                info.append(name, detail, schedule);
                const badge = document.createElement("span");
                badge.className = `doctor-status ${doctor.isActive ? "is-active" : "is-inactive"}`;
                badge.textContent = doctor.isActive ? "Activo" : "Inactivo";
                article.append(avatar, info, badge);
                list.append(article);
            }
            feedback.textContent = data.doctors.length
                ? `Se encontraron ${data.pagination.totalItems} médicos.`
                : "No hay médicos que coincidan con la búsqueda.";
            doctorsPage.querySelector("[data-doctor-page]").textContent =
                `Página ${data.pagination.page} de ${Math.max(1, data.pagination.totalPages)}`;
            doctorsPage.querySelector("[data-doctor-prev]").disabled = currentPage <= 1;
            doctorsPage.querySelector("[data-doctor-next]").disabled =
                currentPage >= data.pagination.totalPages;
        } catch (error) {
            feedback.textContent = error.message;
        }
    }
    doctorsPage.querySelector("[data-doctor-filters]").addEventListener("submit", (event) => {
        event.preventDefault();
        if (topSearch) topSearch.value = search.value;
        currentPage = 1;
        load();
    });
    topSearchForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        search.value = topSearch.value;
        currentPage = 1;
        load();
    });
    topSearch?.addEventListener("input", () => {
        search.value = topSearch.value;
    });
    search.addEventListener("input", () => {
        if (topSearch) topSearch.value = search.value;
    });
    for (const control of [specialty, status])
        control.addEventListener("change", () => {
            currentPage = 1;
            load();
        });
    doctorsPage.querySelector("[data-doctor-prev]").addEventListener("click", () => {
        currentPage--;
        load();
    });
    doctorsPage.querySelector("[data-doctor-next]").addEventListener("click", () => {
        currentPage++;
        load();
    });
    load();
}
