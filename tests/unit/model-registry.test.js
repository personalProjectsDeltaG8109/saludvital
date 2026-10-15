
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
        expect(database.models.AuditLog).toBeDefined();
        expect(database.models.WhatsAppConversation).toBeDefined();
        expect(database.models.WhatsAppMessage).toBeDefined();
        expect(database.models.WhatsAppVerification).toBeDefined();
        expect(database.models.WhatsAppAppointmentRequest).toBeDefined();
        expect(database.models.Consultation).toBeDefined();
        expect(database.models.Diagnosis).toBeDefined();
        expect(database.models.Prescription).toBeDefined();
        expect(database.models.PrescriptionItem).toBeDefined();
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
        expect(database.models.AuditLog.tableName).toBe("audit_logs");
        expect(database.models.WhatsAppConversation.tableName).toBe("whatsapp_conversations");
        expect(database.models.WhatsAppMessage.tableName).toBe("whatsapp_messages");
        expect(database.models.WhatsAppVerification.tableName).toBe("whatsapp_verifications");
        expect(database.models.WhatsAppAppointmentRequest.tableName).toBe("whatsapp_appointment_requests");
        expect(database.models.Consultation.tableName).toBe("consultations");
        expect(database.models.Diagnosis.tableName).toBe("diagnoses");
        expect(database.models.Prescription.tableName).toBe("prescriptions");
        expect(database.models.PrescriptionItem.tableName).toBe("prescription_items");
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


    test("audit log associations preserve records when a user is deleted", () => {
        const { User, AuditLog } = database.models;

        // Verify both directions of the audit actor association.
        expect(User.associations.auditLogs.target).toBe(AuditLog);
        expect(AuditLog.associations.actor.target).toBe(User);

        // Verify the actor reference is optional.
        expect(AuditLog.rawAttributes.actor_user_id.allowNull).toBe(true);

        // Match the existing foreign key deletion policy.
        expect(User.associations.auditLogs.options.onDelete).toBe("SET NULL");
        expect(AuditLog.associations.actor.options.onDelete).toBe("SET NULL");

        // Audit logs do not use automatic Sequelize timestamps.
        expect(AuditLog.options.timestamps).toBe(false);
    });

    test("WhatsApp conversation and message associations are registered", () => {
        const {
            Patient,
            WhatsAppConversation,
            WhatsAppMessage,
        } = database.models;

        // Verify the optional patient reference.
        expect(Patient.associations.whatsappConversations.target)
            .toBe(WhatsAppConversation);

        expect(WhatsAppConversation.associations.patient.target)
            .toBe(Patient);

        expect(WhatsAppConversation.rawAttributes.patient_id.allowNull)
            .toBe(true);

        // Verify the conversation and message relationship.
        expect(WhatsAppConversation.associations.messages.target)
            .toBe(WhatsAppMessage);

        expect(WhatsAppMessage.associations.conversation.target)
            .toBe(WhatsAppConversation);

        expect(WhatsAppMessage.rawAttributes.conversation_id.allowNull)
            .toBe(false);

        // Preserve conversations and prevent deletion when messages exist.
        expect(WhatsAppConversation.associations.patient.options.onDelete)
            .toBe("SET NULL");

        expect(WhatsAppMessage.associations.conversation.options.onDelete)
            .toBe("RESTRICT");

        // Messages use created_at without automatic updated_at handling.
        expect(WhatsAppMessage.options.timestamps).toBe(false);

        expect(WhatsAppMessage.options.timestamps).toBe(false);

    });


    test("WhatsApp verification and appointment request associations are registered", () => {
        const {
            Patient,
            Doctor,
            Specialities,
            Appointment,
            WhatsAppConversation,
            WhatsAppVerification,
            WhatsAppAppointmentRequest,
        } = database.models;

        // Verify patient identity verification associations.
        expect(Patient.associations.whatsappVerifications.target)
            .toBe(WhatsAppVerification);
        expect(WhatsAppVerification.associations.patient.target)
            .toBe(Patient);

        // Verify patient and conversation request associations.
        expect(Patient.associations.whatsappAppointmentRequests.target)
            .toBe(WhatsAppAppointmentRequest);
        expect(WhatsAppAppointmentRequest.associations.patient.target)
            .toBe(Patient);
        expect(WhatsAppConversation.associations.appointmentRequests.target)
            .toBe(WhatsAppAppointmentRequest);
        expect(WhatsAppAppointmentRequest.associations.conversation.target)
            .toBe(WhatsAppConversation);

        // Verify optional specialty, doctor, and appointment references.
        expect(WhatsAppAppointmentRequest.associations.requestedSpecialty.target)
            .toBe(Specialities);
        expect(WhatsAppAppointmentRequest.associations.requestedDoctor.target)
            .toBe(Doctor);
        expect(WhatsAppAppointmentRequest.associations.appointment.target)
            .toBe(Appointment);

        // Verify required fields and the idempotency constraint.
        expect(WhatsAppVerification.rawAttributes.patient_id.allowNull)
            .toBe(false);
        expect(WhatsAppAppointmentRequest.rawAttributes.patient_id.allowNull)
            .toBe(false);
        expect(WhatsAppAppointmentRequest.rawAttributes.conversation_id.allowNull)
            .toBe(false);
        expect(WhatsAppAppointmentRequest.rawAttributes.idempotency_key.unique)
            .toBe(true);
    });


    test("clinical consultation, diagnosis, and prescription associations are registered", () => {
        const {
            Appointment,
            Doctor,
            Consultation,
            Diagnosis,
            Prescription,
            PrescriptionItem,
        } = database.models;

        // Verify the one-to-one appointment and consultation relationship.
        expect(Appointment.associations.consultation.target).toBe(Consultation);
        expect(Consultation.associations.appointment.target).toBe(Appointment);
        expect(Consultation.rawAttributes.appointment_id.unique).toBe(true);

        // Verify the doctor and consultation relationship.
        expect(Doctor.associations.consultations.target).toBe(Consultation);
        expect(Consultation.associations.doctor.target).toBe(Doctor);

        // Verify consultation diagnoses.
        expect(Consultation.associations.diagnoses.target).toBe(Diagnosis);
        expect(Diagnosis.associations.consultation.target).toBe(Consultation);

        // Verify consultation prescriptions.
        expect(Consultation.associations.prescriptions.target).toBe(Prescription);
        expect(Prescription.associations.consultation.target).toBe(Consultation);

        // Verify prescription items.
        expect(Prescription.associations.items.target).toBe(PrescriptionItem);
        expect(PrescriptionItem.associations.prescription.target).toBe(Prescription);
    });

});
