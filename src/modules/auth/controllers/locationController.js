import { getDepartments, getMunicipalities } from "../services/locationService.js";

// Return the department catalog as JSON for the registration form.
export function listDepartments(req, res) {
    return res.status(200).json({
        data: getDepartments(),
    });
}

// Return municipalities only when the requested department exists.
export function listMunicipalities(req, res) {
    const { departmentCode } = req.params;
    const departments = getDepartments();

    const departmentExists = departments.some((department) => department.code === departmentCode);

    if (!departmentExists) {
        return res.status(404).json({
            error: "El departamento solicitado no existe.",
        });
    }

    return res.status(200).json({
        data: getMunicipalities(departmentCode),
    });
}
