// Confirm intentional logout without delaying automatic session expiration.
(() => {
    if (document.querySelector("[data-logout-confirmation]")) return;
    const dialog = document.createElement("dialog");
    dialog.className = "logout-confirmation";
    dialog.dataset.logoutConfirmation = "";
    dialog.setAttribute("aria-labelledby", "logout-confirmation-title");
    dialog.setAttribute("aria-describedby", "logout-confirmation-description");
    dialog.innerHTML = `
        <span class="logout-confirmation-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h13"/>
            </svg>
        </span>
        <h2 id="logout-confirmation-title">¿Deseas cerrar sesión?</h2>
        <p id="logout-confirmation-description">Tendrás que iniciar sesión de nuevo para acceder a tu cuenta.</p>
        <div class="logout-confirmation-actions">
            <button type="button" data-cancel-logout autofocus>Cancelar</button>
            <button type="button" data-confirm-logout>Cerrar sesión</button>
        </div>`;
    document.body.append(dialog);
    const cancel = dialog.querySelector("[data-cancel-logout]");
    const confirm = dialog.querySelector("[data-confirm-logout]");
    let pendingForm = null;
    let trigger = null;
    let submitting = false;

    document.addEventListener("submit", (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        const action = new URL(form.action, window.location.href);
        if (
            action.origin !== window.location.origin ||
            action.pathname !== "/logout" ||
            form.method.toLowerCase() !== "post"
        )
            return;
        event.preventDefault();
        if (submitting || dialog.open) return;
        pendingForm = form;
        trigger = event.submitter || document.activeElement;
        dialog.showModal();
        document.body.classList.add("logout-confirmation-open");
        cancel.focus();
    });

    dialog.addEventListener("keydown", (event) => {
        if (event.key !== "Tab" || submitting) return;
        if (event.shiftKey && document.activeElement === cancel) {
            event.preventDefault();
            confirm.focus();
        } else if (!event.shiftKey && document.activeElement === confirm) {
            event.preventDefault();
            cancel.focus();
        }
    });
    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
        // The close event is queued; ignore a stale close if the dialog reopened first.
        if (dialog.open) return;
        document.body.classList.remove("logout-confirmation-open");
        pendingForm = null;
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
        trigger = null;
    });
    confirm.addEventListener("click", () => {
        if (!pendingForm || submitting) return;
        submitting = true;
        cancel.disabled = true;
        confirm.disabled = true;
        confirm.textContent = "Cerrando sesión...";
        dialog.setAttribute("aria-busy", "true");
        // Submit the original form, preserving hidden fields such as CSRF tokens.
        HTMLFormElement.prototype.submit.call(pendingForm);
    });
    dialog.addEventListener("cancel", (event) => {
        if (submitting) event.preventDefault();
    });
})();
