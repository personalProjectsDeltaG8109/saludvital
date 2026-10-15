
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
        expect(database.models.DoctorAvailability).toBeDefined();
        expect(database.models.DoctorScheduleException).toBeDefined();
        expect(database.models.NotificationPreference).toBeDefined();
        expect(database.models.Notification).toBeDefined();
    });


    test("models map to the existing database tables", () => {
        expect(database.models.Rol.tableName).toBe("roles");
        expect(database.models.User.tableName).toBe("users");
        expect(database.models.Patient.tableName).toBe("patients");
        expect(database.models.Doctor.tableName).toBe("doctors");
        expect(database.models.Specialities.tableName).toBe("specialties");
        expect(database.models.AppointmentStatus.tableName).toBe("appointment_statuses");
        expect(database.models.Appointment.tableName).toBe("appointments");
        expect(database.models.AppointmentHistory.tableName).toBe("appointment_history");
        expect(database.models.DoctorAvailability.tableName).toBe("doctor_availability");
        expect(database.models.DoctorScheduleException.tableName).toBe("doctor_schedule_exceptions");
        expect(database.models.NotificationPreference.tableName).toBe("notification_preferences");
        expect(database.models.Notification.tableName).toBe("notifications");
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


    test("doctor availability and schedule exception associations are registered", () => {
        const {
            User,
            Doctor,
            DoctorAvailability,
            DoctorScheduleException,
        } = database.models;

        // Verify the regular availability associations.
        expect(Doctor.associations.availability.target)
            .toBe(DoctorAvailability);
        expect(DoctorAvailability.associations.doctor.target)
            .toBe(Doctor);

        // Verify the schedule exception associations.
        expect(Doctor.associations.scheduleExceptions.target)
            .toBe(DoctorScheduleException);
        expect(DoctorScheduleException.associations.doctor.target)
            .toBe(Doctor);

        // Verify the optional user reference for schedule exceptions.
        expect(User.associations.scheduleExceptionsCreated.target)
            .toBe(DoctorScheduleException);
        expect(DoctorScheduleException.associations.creator.target)
            .toBe(User);
        expect(DoctorScheduleException.rawAttributes.created_by.allowNull)
            .toBe(true);

        // Verify the database deletion policy for the optional creator.
        expect(User.associations.scheduleExceptionsCreated.options.onDelete)
            .toBe("SET NULL");
        expect(DoctorScheduleException.associations.creator.options.onDelete)
            .toBe("SET NULL");
    });


    test("patient and notification preference associations are registered", () => {
        const { Patient, NotificationPreference } = database.models;

        expect(Patient.associations.notificationPreferences.target)
            .toBe(NotificationPreference);
        expect(NotificationPreference.associations.patient.target)
            .toBe(Patient);
    });

    test("patient, appointment, and notification associations are registered", () => {
        const { Patient, Appointment, Notification } = database.models;

        expect(Patient.associations.notifications.target)
            .toBe(Notification);
        expect(Notification.associations.patient.target)
            .toBe(Patient);

        expect(Appointment.associations.notifications.target)
            .toBe(Notification);
        expect(Notification.associations.appointment.target)
            .toBe(Appointment);

        expect(Notification.rawAttributes.appointment_id.allowNull)
            .toBe(true);

        // Verify that notification history is preserved after appointment deletion.
        expect(Appointment.associations.notifications.options.onDelete)
            .toBe("SET NULL");
        expect(Notification.associations.appointment.options.onDelete)
            .toBe("SET NULL");
    });

});
