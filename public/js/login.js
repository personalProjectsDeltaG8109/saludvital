const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("[data-password-toggle]");

if (passwordInput && passwordToggle) {
    passwordToggle.addEventListener("click", () => {
        const isPasswordVisible = passwordInput.type === "text";

        passwordInput.type = isPasswordVisible ? "password" : "text";
        passwordToggle.textContent = isPasswordVisible ? "Mostrar" : "Ocultar";
        passwordToggle.setAttribute(
            "aria-label",
            isPasswordVisible ? "Mostrar contraseña" : "Ocultar contraseña",
        );
        passwordToggle.setAttribute("aria-pressed", String(!isPasswordVisible));
    });
}
