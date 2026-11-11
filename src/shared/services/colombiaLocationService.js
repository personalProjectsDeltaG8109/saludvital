import locations from "../data/colombiaLocations.json" with { type: "json" };

// Return the unique departments available in the official location catalog.
export function getDepartments() {
    const departments = new Map();

    for (const location of locations) {
        departments.set(location.departmentCode, {
            code: location.departmentCode,
            name: location.departmentName,
        });
    }

    return [...departments.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// Return only the municipalities that belong to the requested department.
export function getMunicipalities(departmentCode) {
    if (typeof departmentCode !== "string") {
        return [];
    }

    return locations
        .filter((location) => location.departmentCode === departmentCode)
        .map((location) => ({
            code: location.municipalityCode,
            name: location.municipalityName,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// Resolve official names only when both submitted codes match the catalog.
export function resolveLocation(departmentCode, municipalityCode) {
    if (typeof departmentCode !== "string" || typeof municipalityCode !== "string") {
        return null;
    }

    const location = locations.find(
        (item) =>
            item.departmentCode === departmentCode && item.municipalityCode === municipalityCode,
    );

    if (!location) {
        return null;
    }

    return {
        department: location.departmentName,
        municipality: location.municipalityName,
    };
}
