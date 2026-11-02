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

async function markAllNotificationsRead(button) {
    const feedback = document.querySelector("[data-notification-feedback]");
    button.disabled = true;
    feedback.textContent = "";

    try {
        const response = await fetch("/api/doctor/notifications/read-all", {
            method: "POST",
            headers: { Accept: "application/json" },
            credentials: "same-origin",
        });
        if (!response.ok) throw new Error("Unable to update notifications.");

        document.querySelectorAll(".doctor-notification-item.is-unread").forEach((item) => {
            item.classList.remove("is-unread");
            item.classList.add("is-read");
            const readButton = item.querySelector("[data-mark-notification-read]");
            if (readButton) {
                readButton.replaceWith(
                    Object.assign(document.createElement("span"), {
                        className: "doctor-notification-read",
                        textContent: "Leída",
                    }),
                );
            }
        });

        const result = await response.json();
        button.remove();
        feedback.textContent = "Todas las notificaciones se marcaron como leídas.";
        updateNotificationCount(result.unreadCount);
        document.querySelector("[data-unread-count]").textContent =
            `${result.unreadCount} sin leer`;
    } catch {
        button.disabled = false;
        feedback.textContent = "No pudimos actualizar las notificaciones. Inténtalo de nuevo.";
    }
}

function showNotificationDetails(button) {
    const dialog = document.querySelector("[data-notification-details-dialog]");
    const item = button.closest(".doctor-notification-item");
    if (!dialog || !item) return;

    dialog.querySelector("[data-detail-label]").textContent = button.dataset.label;
    dialog.querySelector("[data-detail-event]").textContent = button.dataset.eventType;
    dialog.querySelector("[data-detail-occurred-at]").textContent = button.dataset.occurredAt;
    const appointmentRow = dialog.querySelector("[data-detail-appointment-row]");
    appointmentRow.hidden = !button.dataset.appointmentAt;
    dialog.querySelector("[data-detail-appointment-at]").textContent =
        button.dataset.appointmentAt || "";
    dialog.showModal();
}

document.querySelectorAll("[data-mark-notification-read]").forEach((button) => {
    button.addEventListener("click", () => markNotificationRead(button));
});

document
    .querySelector("[data-mark-all-notifications-read]")
    ?.addEventListener("click", (event) => markAllNotificationsRead(event.currentTarget));

document.querySelectorAll("[data-notification-details]").forEach((button) => {
    button.addEventListener("click", () => showNotificationDetails(button));
});

document.querySelector("[data-close-notification-details]")?.addEventListener("click", () => {
    document.querySelector("[data-notification-details-dialog]")?.close();
});

refreshNotificationCount();
