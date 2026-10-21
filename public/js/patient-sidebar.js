(() => {
    const sidebar = document.querySelector("#patient-sidebar");
    const menuButton = document.querySelector("[data-toggle-sidebar]");
    const backdrop = document.querySelector("[data-close-sidebar]");

    if (!sidebar || !menuButton || !backdrop) return;

    function setSidebarOpen(isOpen) {
        sidebar.classList.toggle("is-open", isOpen);
        backdrop.classList.toggle("is-visible", isOpen);
        menuButton.setAttribute("aria-expanded", String(isOpen));
        menuButton.setAttribute("aria-label", isOpen ? "Cerrar menú" : "Abrir menú");
        document.body.classList.toggle("sidebar-menu-open", isOpen);
    }

    menuButton.addEventListener("click", () => {
        setSidebarOpen(!sidebar.classList.contains("is-open"));
    });
    backdrop.addEventListener("click", () => setSidebarOpen(false));
    sidebar.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => setSidebarOpen(false));
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") setSidebarOpen(false);
    });
})();
