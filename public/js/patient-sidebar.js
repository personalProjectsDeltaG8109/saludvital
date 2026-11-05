(() => {
    const menuButton = document.querySelector("[data-toggle-sidebar]");
    const sidebarId = menuButton?.getAttribute("aria-controls");
    const sidebar = sidebarId ? document.getElementById(sidebarId) : null;
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

    const notificationBell = document.querySelector(".sv-bell[data-notification-count-url]");

    function updateNotificationCount(count) {
        if (!notificationBell || !Number.isSafeInteger(count) || count < 0) return;
        let badge = notificationBell.querySelector(".sv-notification-count");
        if (!count) {
            badge?.remove();
            notificationBell.setAttribute("aria-label", "Notificaciones");
            return;
        }
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "sv-notification-count";
            notificationBell.append(badge);
        }
        badge.textContent = count > 99 ? "99+" : String(count);
        notificationBell.setAttribute("aria-label", `Notificaciones, ${count} sin leer`);
    }

    async function refreshNotificationCount() {
        if (!notificationBell) return;
        try {
            const response = await fetch(notificationBell.dataset.notificationCountUrl, {
                headers: { Accept: "application/json" },
                credentials: "same-origin",
            });
            if (!response.ok) return;
            const result = await response.json();
            if (result.success) updateNotificationCount(result.unreadCount);
        } catch {
            // Keep the page usable if the unread-count endpoint is temporarily unavailable.
        }
    }

    void refreshNotificationCount();
    window.setInterval(refreshNotificationCount, 15000);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void refreshNotificationCount();
    });
})();
