const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("[data-password-toggle]");

if (passwordInput && passwordToggle) {
    passwordToggle.addEventListener("click", () => {
        const isPasswordVisible = passwordInput.type === "text";
        const toggleLabel = passwordToggle.querySelector("[data-password-toggle-label]");

        passwordInput.type = isPasswordVisible ? "password" : "text";
        toggleLabel.textContent = isPasswordVisible ? "Mostrar contraseña" : "Ocultar contraseña";
        passwordToggle.setAttribute(
            "aria-label",
            isPasswordVisible ? "Mostrar contraseña" : "Ocultar contraseña",
        );
        passwordToggle.setAttribute("aria-pressed", String(!isPasswordVisible));
    });
}

const lockCountdown = document.querySelector("[data-login-lock-countdown]");

if (lockCountdown) {
    const emailInput = document.querySelector("#email");
    const submitButton = document.querySelector('.login-form button[type="submit"]');
    const lockTime = lockCountdown.querySelector("[data-login-lock-time]");
    const errorMessage = document.querySelector("#login-error");

    function unlockLoginForm() {
        emailInput.disabled = false;
        passwordInput.disabled = false;
        passwordToggle.disabled = false;
        submitButton.disabled = false;
        lockCountdown.hidden = true;

        if (errorMessage) {
            errorMessage.textContent = "El bloqueo terminó. Ya puedes volver a intentarlo.";
        }
    }

    function updateLockCountdown() {
        const lockUntil = Number(lockCountdown.dataset.lockUntil);
        const remainingSeconds = Math.ceil((lockUntil - Date.now()) / 1000);

        if (!Number.isFinite(lockUntil) || remainingSeconds <= 0) {
            unlockLoginForm();
            return false;
        }

        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        lockTime.textContent = `${minutes}:${String(seconds).padStart(2, "0")}.`;
        return true;
    }

    if (updateLockCountdown()) {
        const countdownTimer = window.setInterval(() => {
            if (!updateLockCountdown()) {
                window.clearInterval(countdownTimer);
            }
        }, 1000);
    }
}
