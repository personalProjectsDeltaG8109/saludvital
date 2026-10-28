const app = document.querySelector(".admin-app");
const sidebar = document.querySelector("[data-admin-sidebar]");
const menuButton = document.querySelector("[data-admin-open]");

function closeMenu(restoreFocus = false) {
    const wasOpen = app?.classList.contains("is-sidebar-open");
    app?.classList.remove("is-sidebar-open");
    menuButton?.setAttribute("aria-expanded", "false");
    if (restoreFocus && wasOpen) menuButton?.focus();
}

function openMenu() {
    app?.classList.add("is-sidebar-open");
    menuButton?.setAttribute("aria-expanded", "true");
    sidebar?.querySelector('.admin-nav-link[aria-current="page"]')?.focus();
}

if (app && sidebar && menuButton && menuButton.dataset.sidebarBound !== "true") {
    menuButton.dataset.sidebarBound = "true";
    menuButton.addEventListener("click", openMenu);
    document.querySelectorAll("[data-admin-close]").forEach((button) => {
        button.addEventListener("click", () => closeMenu(true));
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu(true);
    });
    window.addEventListener("resize", () => {
        if (window.matchMedia("(min-width: 761px)").matches) closeMenu();
    });
}

const page = document.querySelector("[data-admin-dashboard]");

if (page) {
    const weekSelect = document.querySelector("[data-week-select]");
    const chart = document.querySelector("[data-week-chart]");
    const tableBody = document.querySelector("[data-chart-table-body]");
    const feedback = document.querySelector("[data-chart-feedback]");
    let weeklyAppointments = [];

    try {
        weeklyAppointments = JSON.parse(page.dataset.weeklyAppointments || "[]");
    } catch {
        weeklyAppointments = [];
    }

    function renderChart(days) {
        chart.replaceChildren();
        tableBody.replaceChildren();
        const maximum = Math.max(
            1,
            ...days.flatMap((day) => [day.scheduled, day.completed, day.cancelled]),
        );
        days.forEach((day) => {
            const column = document.createElement("div");
            column.className = "admin-chart-day";
            column.setAttribute(
                "aria-label",
                day.label +
                    ": " +
                    day.scheduled +
                    " programadas, " +
                    day.completed +
                    " completadas, " +
                    day.cancelled +
                    " canceladas",
            );

            const bars = document.createElement("div");
            bars.className = "admin-chart-bars";
            [
                ["scheduled", day.scheduled],
                ["completed", day.completed],
                ["cancelled", day.cancelled],
            ].forEach(([status, count]) => {
                const bar = document.createElement("span");
                bar.className = "admin-chart-bar is-" + status;
                bar.style.height = Math.max(count ? 5 : 1, (count / maximum) * 100) + "%";
                bar.title = count + " " + status;
                bars.append(bar);
            });

            const label = document.createElement("span");
            label.textContent = day.label;
            column.append(bars, label);
            chart.append(column);

            const row = document.createElement("tr");
            [day.label, day.scheduled, day.completed, day.cancelled].forEach((value) => {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.append(cell);
            });
            tableBody.append(row);
        });
    }

    renderChart(weeklyAppointments);

    weekSelect?.addEventListener("change", async () => {
        feedback.textContent = "Actualizando el gráfico…";
        weekSelect.disabled = true;
        try {
            const response = await fetch(
                page.dataset.dashboardEndpoint + "?week=" + encodeURIComponent(weekSelect.value),
                { headers: { Accept: "application/json" } },
            );
            const result = await response.json();
            if (!response.ok)
                throw new Error(result.message || "No fue posible cargar el resumen.");
            weeklyAppointments = result.weeklyAppointments;
            renderChart(weeklyAppointments);
            feedback.textContent = "";
        } catch (error) {
            feedback.textContent = error.message || "No fue posible actualizar el gráfico.";
        } finally {
            weekSelect.disabled = false;
        }
    });
}
