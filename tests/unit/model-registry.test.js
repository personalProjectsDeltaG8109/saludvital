
import { describe, test, expect } from "@jest/globals";
import database from "../../config/database.js";

// Register the real Sequelize models and their associations.
await import("../../src/models/associations.js");

describe("Sequelize model registry", () => {
    test("all foundational models are registered", () => {
        expect(database.models.Rol).toBeDefined();
        expect(database.models.User).toBeDefined();
        expect(database.models.Patient).toBeDefined();
        expect(database.models.Doctor).toBeDefined();
        expect(database.models.Specialities).toBeDefined();
    });

    test("models map to the existing database tables", () => {
        expect(database.models.Rol.tableName).toBe("roles");
        expect(database.models.User.tableName).toBe("users");
        expect(database.models.Patient.tableName).toBe("patients");
        expect(database.models.Doctor.tableName).toBe("doctors");
        expect(database.models.Specialities.tableName).toBe("specialties");
    });

    test("role and user associations reference the correct models", () => {
        const { Rol, User } = database.models;

        expect(Rol.associations.usuarios.target).toBe(User);
        expect(User.associations.rol.target).toBe(Rol);
    });

    test("patient and user associations reference the correct models", () => {
        const { Patient, User } = database.models;

        expect(User.associations.patient.target).toBe(Patient);
        expect(Patient.associations.user.target).toBe(User);
    });

    test("doctor and user associations reference the correct models", () => {
        const { Doctor, User } = database.models;

        expect(User.associations.doctor.target).toBe(Doctor);
        expect(Doctor.associations.user.target).toBe(User);
    });

    test("doctor and specialty associations reference the correct models", () => {
        const { Doctor, Specialities } = database.models;

        expect(Specialities.associations.doctors.target).toBe(Doctor);
        expect(Doctor.associations.specialty.target).toBe(Specialities);
    });
});
