import { Router } from "express";
import { listDepartments, listMunicipalities } from "../controllers/locationController.js";

// Define the public endpoints used by the registration form.
const locationRoutes = Router();

locationRoutes.get("/api/locations/departments", listDepartments);

locationRoutes.get("/api/locations/departments/:departmentCode/municipalities", listMunicipalities);

export default locationRoutes;
