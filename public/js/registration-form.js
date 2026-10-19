"use strict";

// Restrict phone and identity document inputs to digits while typing or pasting.
const numericFields = [
    {
        selector: "#phone",
        minimumLength: 7,
        maximumLength: 15,
        label: "El teléfono debe contener entre 7 y 15 dígitos.",
    },
    {
        selector: "#document_number",
        minimumLength: 1,
        maximumLength: 15,
        label: "El documento debe contener entre 1 y 15 dígitos.",
    },
];

for (const field of numericFields) {
    const input = document.querySelector(field.selector);

    if (!input) {
        continue;
    }

    // Remove every character that is not a digit, including pasted characters.
    input.addEventListener("input", () => {
        const numericValue = input.value.replace(/[^0-9]/g, "");

        input.value = numericValue.slice(0, field.maximumLength);
    });
}

// Validate the password while the user types.
const passwordInput = document.querySelector("#password");
const strengthBar = document.querySelector("#password-strength-bar");
const strengthText = document.querySelector("#password-strength-text");

if (passwordInput && strengthBar && strengthText) {
    passwordInput.addEventListener("input", () => {
        const password = passwordInput.value;

        // Evaluate the password against the registration requirements.
        const checks = [
            password.length >= 10,
            /[A-Z]/.test(password),
            (password.match(/[a-z]/g) || []).length >= 3,
            /\d/.test(password),
            /[^A-Za-z0-9]/.test(password),
        ];

        const score = checks.filter(Boolean).length;

        // Display a color and label for each strength level.
        const levels = [
            { label: "Muy débil", width: "20%", color: "#DC2626" },
            { label: "Muy débil", width: "20%", color: "#DC2626" },
            { label: "Débil", width: "40%", color: "#EA580C" },
            { label: "Media", width: "60%", color: "#CA8A04" },
            { label: "Fuerte", width: "80%", color: "#168DE2" },
            { label: "Muy fuerte", width: "100%", color: "#16A34A" },
        ];

        // Reset the indicator when the field is empty.
        const level =
            password.length === 0
                ? {
                      label: "Escribe una contraseña",
                      width: "0%",
                      color: "#CBD5E1",
                  }
                : levels[score];

        // Update the progress bar and its accessible text.
        strengthBar.style.width = level.width;
        strengthBar.style.backgroundColor = level.color;
        strengthText.textContent = level.label;
    });
}

const birthDateInput = document.querySelector("#date_of_birth");

if (birthDateInput) {
    // Use local calendar dates to avoid timezone shifts in the date picker.
    function formatLocalDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    const today = new Date();
    const oldestAllowedDate = new Date(today);
    oldestAllowedDate.setFullYear(oldestAllowedDate.getFullYear() - 120);

    birthDateInput.max = formatLocalDate(today);
    birthDateInput.min = formatLocalDate(oldestAllowedDate);
}

// Validate password confirmation in real time.
const confirmPasswordInput = document.querySelector("#password_confirmation");
const passwordMatchMessage = document.querySelector("#password-match-message");

if (passwordInput && confirmPasswordInput && passwordMatchMessage) {
    function validatePasswordMatch() {
        const password = passwordInput.value;
        const confirmation = confirmPasswordInput.value;

        // Keep the field neutral until the user enters a confirmation.
        if (confirmation.length === 0) {
            confirmPasswordInput.classList.remove(
                "border-red-500",
                "border-green-600",
                "focus:border-red-500",
                "focus:border-green-600",
                "focus:ring-red-500",
                "focus:ring-green-600",
            );

            passwordMatchMessage.textContent = "";
            passwordMatchMessage.className = "mt-2 text-sm";
            confirmPasswordInput.removeAttribute("aria-invalid");
            return;
        }

        // Compare both values without sending either password anywhere.
        const passwordsMatch = password === confirmation;

        confirmPasswordInput.classList.remove(
            "border-red-500",
            "border-green-600",
            "focus:border-red-500",
            "focus:border-green-600",
            "focus:ring-red-500",
            "focus:ring-green-600",
        );

        if (passwordsMatch) {
            // Show a green border and a clear success message.
            confirmPasswordInput.classList.add(
                "border-green-600",
                "focus:border-green-600",
                "focus:ring-green-600",
            );

            passwordMatchMessage.textContent = "Las contraseñas coinciden.";
            passwordMatchMessage.className = "mt-2 text-sm font-medium text-green-700";

            confirmPasswordInput.removeAttribute("aria-invalid");
        } else {
            // Show a red border and an accessible error message.
            confirmPasswordInput.classList.add(
                "border-red-500",
                "focus:border-red-500",
                "focus:ring-red-500",
            );

            passwordMatchMessage.textContent = "Las contraseñas no coinciden.";

            passwordMatchMessage.className = "mt-2 text-sm font-medium text-red-600";

            confirmPasswordInput.setAttribute("aria-invalid", "true");
        }
    }

    // Revalidate whenever either password field changes.
    passwordInput.addEventListener("input", validatePasswordMatch);
    confirmPasswordInput.addEventListener("input", validatePasswordMatch);
}
