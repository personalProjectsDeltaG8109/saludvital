const bell = document.querySelector("[data-notification-count-url]");

function updateNotificationCount(count) {
    if (!bell || !Number.isSafeInteger(count) || count < 0) return;

    let badge = bell.querySelector(".sv-notification-count");
    if (count === 0) {
        badge?.remove();
        bell.setAttribute("aria-label", "Notificaciones");
        return;
    }

    if (!badge) {
        badge = document.createElement("span");
        badge.className = "sv-notification-count";
        bell.append(badge);
    }
    badge.textContent = count > 99 ? "99+" : String(count);
    bell.setAttribute("aria-label", `Notificaciones, ${count} sin leer`);
}

async function refreshNotificationCount() {
    if (!bell) return;
    try {
        const response = await fetch(bell.dataset.notificationCountUrl, {
            headers: { Accept: "application/json" },
            credentials: "same-origin",
        });
        if (!response.ok) return;
        const result = await response.json();
        updateNotificationCount(result.unreadCount);
    } catch {
        // Keep the bell usable if the unread count cannot be refreshed.
    }
}

async function markNotificationRead(button) {
    button.disabled = true;
    try {
        const response = await fetch(
            `/api/doctor/notifications/${button.dataset.markNotificationRead}/read`,
            {
                method: "POST",
                headers: { Accept: "application/json" },
                credentials: "same-origin",
            },
        );
        if (!response.ok) throw new Error("No pudimos actualizar la notificación.");
        const item = button.closest(".doctor-notification-item");
        item?.classList.remove("is-unread");
        item?.classList.add("is-read");
        button.replaceWith(
            Object.assign(document.createElement("span"), {
                className: "doctor-notification-read",
                textContent: "Leída",
            }),
        );
        await refreshNotificationCount();
    } catch {
        button.disabled = false;
        button.textContent = "No se pudo actualizar. Reintentar";
    }
}

document.querySelectorAll("[data-mark-notification-read]").forEach((button) => {
    button.addEventListener("click", () => markNotificationRead(button));
});

refreshNotificationCount();
