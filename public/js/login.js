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
