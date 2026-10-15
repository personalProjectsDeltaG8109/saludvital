
import { describe, test, expect } from "@jest/globals";
import database from "../../config/database.js";

// Register the real Sequelize models and their associations.
await import("../../src/models/associations.js");

describe("Sequelize model registry", () => {
    test("all foundational and appointment models are registered", () => {
        expect(database.models.Rol).toBeDefined();
        expect(database.models.User).toBeDefined();
        expect(database.models.Patient).toBeDefined();
        expect(database.models.Doctor).toBeDefined();
        expect(database.models.Specialities).toBeDefined();
        expect(database.models.AppointmentStatus).toBeDefined();
        expect(database.models.Appointment).toBeDefined();
        expect(database.models.AppointmentHistory).toBeDefined();
    });

    test("models map to the existing database tables", () => {
        expect(database.models.Rol.tableName).toBe("roles");
        expect(database.models.User.tableName).toBe("users");
        expect(database.models.Patient.tableName).toBe("patients");
        expect(database.models.Doctor.tableName).toBe("doctors");
        expect(database.models.Specialities.tableName).toBe("specialties");
        expect(database.models.AppointmentStatus.tableName)
            .toBe("appointment_statuses");
        expect(database.models.Appointment.tableName).toBe("appointments");
        expect(database.models.AppointmentHistory.tableName)
            .toBe("appointment_history");
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

    test("appointment status and appointment associations are registered", () => {
        const { AppointmentStatus, Appointment } = database.models;

        expect(AppointmentStatus.associations.appointments.target)
            .toBe(Appointment);
        expect(Appointment.associations.status.target)
            .toBe(AppointmentStatus);
    });

    test("patient and appointment associations are registered", () => {
        const { Patient, Appointment } = database.models;

        expect(Patient.associations.appointments.target).toBe(Appointment);
        expect(Appointment.associations.patient.target).toBe(Patient);
    });

    test("doctor and appointment associations are registered", () => {
        const { Doctor, Appointment } = database.models;

        expect(Doctor.associations.appointments.target).toBe(Appointment);
        expect(Appointment.associations.doctor.target).toBe(Doctor);
    });

    test("specialty and appointment associations are registered", () => {
        const { Specialities, Appointment } = database.models;

        expect(Specialities.associations.appointments.target)
            .toBe(Appointment);
        expect(Appointment.associations.specialty.target)
            .toBe(Specialities);
    });

    test("appointment and history associations are registered", () => {
        const { Appointment, AppointmentHistory } = database.models;

        expect(Appointment.associations.history.target)
            .toBe(AppointmentHistory);
        expect(AppointmentHistory.associations.appointment.target)
            .toBe(Appointment);
    });

    test("appointment history actor association uses the optional user reference", () => {
        const { User, AppointmentHistory } = database.models;

        expect(User.associations.appointmentHistoryActions.target)
            .toBe(AppointmentHistory);
        expect(AppointmentHistory.associations.actor.target).toBe(User);
        expect(AppointmentHistory.rawAttributes.actor_user_id.allowNull)
            .toBe(true);
    });
});
