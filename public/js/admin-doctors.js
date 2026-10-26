const doctorsPage = document.querySelector("[data-doctors]");
const adminApp = document.querySelector(".admin-app");
const sidebar = document.querySelector("[data-admin-sidebar]");

function closeSidebar() {
    adminApp.classList.remove("is-sidebar-open");
    document.querySelector("[data-admin-open]")?.setAttribute("aria-expanded", "false");
}

function confirmDoctorDeactivation(doctorName, upcomingAppointmentCount) {
    return new Promise((resolve) => {
        const dialog = document.createElement("dialog");
        dialog.className = "doctor-status-dialog";
        dialog.setAttribute("aria-labelledby", "doctor-status-dialog-title");

        const content = document.createElement("div");
        content.className = "doctor-status-dialog-content";
        const title = document.createElement("h2");
        title.id = "doctor-status-dialog-title";
        title.textContent = "Desactivar médico";
        const description = document.createElement("p");
        const appointmentMessage = upcomingAppointmentCount
            ? `${upcomingAppointmentCount} citas futuras confirmadas se cancelarán. Sus pacientes recibirán una notificación según sus preferencias.`
            : "No hay citas futuras confirmadas que deban cancelarse.";
        description.textContent = `La cuenta de ${doctorName} perderá acceso de inmediato. ${appointmentMessage} El historial se conservará y las citas canceladas no se restaurarán al reactivar la cuenta.`;

        const actions = document.createElement("div");
        actions.className = "doctor-status-dialog-actions";
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "doctors-secondary-button";
        cancelButton.textContent = "Volver";
        const confirmButton = document.createElement("button");
        confirmButton.type = "button";
        confirmButton.className = "doctor-status-confirm-button";
        confirmButton.textContent = "Desactivar médico";
        actions.append(cancelButton, confirmButton);
        content.append(title, description, actions);
        dialog.append(content);
        document.body.append(dialog);

        cancelButton.addEventListener("click", () => dialog.close("cancel"));
        confirmButton.addEventListener("click", () => dialog.close("confirm"));
        dialog.addEventListener("close", () => {
            const confirmed = dialog.returnValue === "confirm";
            dialog.remove();
            resolve(confirmed);
        });
        dialog.showModal();
        cancelButton.focus();
    });
}

async function changeDoctorStatus({
    doctorId,
    doctorName,
    isActive,
    statusEndpoint,
    impactEndpoint,
}) {
    if (!isActive) {
        const impactResponse = await fetch(`${impactEndpoint}/${doctorId}/status-impact`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
        });
        const impact = await impactResponse.json();
        if (!impactResponse.ok) {
            throw new Error(impact.message || "No pudimos verificar las citas del médico.");
        }
        if (!(await confirmDoctorDeactivation(doctorName, impact.upcomingAppointmentCount))) {
            return null;
        }
    }

    const response = await fetch(`${statusEndpoint}/${doctorId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ isActive }),
    });
    const data = await response.json();
    if (!response.ok)
        throw new Error(data.message || "No pudimos actualizar el estado del médico.");
    return data;
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
                const actions = document.createElement("div");
                actions.className = "doctor-row-actions";
                const detailsLink = document.createElement("a");
                detailsLink.className = "doctor-details-link";
                detailsLink.href = `/admin/doctors/${doctor.id}`;
                detailsLink.setAttribute("aria-label", `Ver detalles de ${doctor.name}`);
                detailsLink.innerHTML =
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span>Ver</span>';
                const editLink = document.createElement("a");
                editLink.className = "doctor-details-link doctor-edit-link";
                editLink.href = `/admin/users?search=${encodeURIComponent(doctor.email)}&edit=${doctor.userId}`;
                editLink.setAttribute("aria-label", `Editar información de ${doctor.name}`);
                editLink.innerHTML =
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 5 5 5M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/></svg><span>Editar</span>';
                const statusAction = document.createElement("button");
                statusAction.type = "button";
                statusAction.className = `doctor-row-status-action doctor-status-action${doctor.isActive ? " is-deactivation" : " is-activation"}`;
                statusAction.textContent = doctor.isActive ? "Desactivar" : "Activar";
                statusAction.setAttribute(
                    "aria-label",
                    `${doctor.isActive ? "Desactivar" : "Activar"} a ${doctor.name}`,
                );
                statusAction.addEventListener("click", async () => {
                    statusAction.disabled = true;
                    feedback.textContent = "Actualizando el estado del médico…";
                    try {
                        const result = await changeDoctorStatus({
                            doctorId: doctor.id,
                            doctorName: doctor.name,
                            isActive: !doctor.isActive,
                            statusEndpoint: doctorsPage.dataset.statusEndpoint,
                            impactEndpoint: doctorsPage.dataset.statusImpactEndpoint,
                        });
                        if (!result) return;
                        await load();
                        feedback.textContent = result.message;
                        feedback.classList.add("is-success");
                    } catch (error) {
                        feedback.textContent = error.message;
                        feedback.classList.add("is-error");
                    } finally {
                        statusAction.disabled = false;
                    }
                });
                actions.append(badge, detailsLink, editLink, statusAction);
                article.append(avatar, info, actions);
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

const doctorDetailsPage = document.querySelector("[data-doctor-details]");
const doctorStatusAction = doctorDetailsPage?.querySelector("[data-doctor-status-action]");
doctorStatusAction?.addEventListener("click", async () => {
    const feedback = doctorDetailsPage.querySelector("[data-doctor-status-feedback]");
    const statusLabel = doctorDetailsPage.querySelector("[data-doctor-status-label]");
    const isActive = doctorStatusAction.dataset.isActive === "true";
    doctorStatusAction.disabled = true;
    feedback.textContent = "Actualizando el estado del médico…";
    try {
        const result = await changeDoctorStatus({
            doctorId: doctorStatusAction.dataset.doctorId,
            doctorName: doctorDetailsPage.querySelector("#doctor-name").textContent,
            isActive: !isActive,
            statusEndpoint: doctorDetailsPage.dataset.statusEndpoint,
            impactEndpoint: doctorDetailsPage.dataset.statusImpactEndpoint,
        });
        if (!result) return;
        doctorStatusAction.dataset.isActive = String(result.isActive);
        doctorStatusAction.textContent = result.isActive ? "Desactivar médico" : "Activar médico";
        statusLabel.textContent = result.isActive ? "Activo" : "Inactivo";
        statusLabel.classList.toggle("is-active", result.isActive);
        statusLabel.classList.toggle("is-inactive", !result.isActive);
        feedback.textContent = result.message;
        feedback.classList.add("is-success");
    } catch (error) {
        feedback.textContent = error.message;
        feedback.classList.add("is-error");
    } finally {
        doctorStatusAction.disabled = false;
    }
});
