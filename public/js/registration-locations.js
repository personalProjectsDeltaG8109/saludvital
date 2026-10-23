"use strict";

// Connect the department and municipality selectors on the registration page.
const departmentSelect = document.getElementById("department");
const municipalitySelect = document.getElementById("municipality");

// Do nothing on pages that do not contain the registration form.
if (departmentSelect && municipalitySelect) {
    // Create options using textContent to avoid interpreting catalog values as HTML.
    function populateOptions(select, items, placeholder, getValue, getLabel) {
        select.replaceChildren(new Option(placeholder, ""));

        for (const item of items) {
            select.add(new Option(getLabel(item), getValue(item)));
        }
    }

    // Load departments from the application's local API.
    async function loadDepartments() {
        departmentSelect.disabled = true;

        try {
            const response = await fetch("/api/locations/departments");

            if (!response.ok) {
                throw new Error("Unable to load departments.");
            }

            const { data } = await response.json();

            populateOptions(
                departmentSelect,
                data,
                "Selecciona un departamento",
                (department) => department.code,
                (department) => department.name,
            );
        } catch {
            populateOptions(
                departmentSelect,
                [],
                "No se pudieron cargar los departamentos",
                () => "",
                () => "",
            );
        } finally {
            departmentSelect.disabled = false;
        }
    }

    // Reset municipalities whenever the selected department changes.
    departmentSelect.addEventListener("change", async () => {
        const departmentCode = departmentSelect.value;

        municipalitySelect.disabled = true;
        populateOptions(
            municipalitySelect,
            [],
            departmentCode ? "Cargando municipios..." : "Primero selecciona un departamento",
            () => "",
            () => "",
        );

        if (!departmentCode) {
            return;
        }

        try {
            const response = await fetch(
                `/api/locations/departments/${encodeURIComponent(departmentCode)}/municipalities`,
            );

            if (!response.ok) {
                throw new Error("Unable to load municipalities.");
            }

            const { data } = await response.json();

            populateOptions(
                municipalitySelect,
                data,
                "Selecciona un municipio",
                (municipality) => municipality.code,
                (municipality) => municipality.name,
            );

            municipalitySelect.disabled = false;
        } catch {
            populateOptions(
                municipalitySelect,
                [],
                "No se pudieron cargar los municipios",
                () => "",
                () => "",
            );
        }
    });

    loadDepartments();
}
