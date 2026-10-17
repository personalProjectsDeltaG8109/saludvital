import Rol from "./Rol.js";
import User from "./User.js";
import Patient from "./Patient.js";
import Doctor from "./Doctor.js";
import Specialities from "./Specialities.js";
import AppointmentStatus from "./AppointmentStatus.js";
import Appointment from "./Appointment.js";
import AppointmentHistory from "./AppointmentHistory.js";
import DoctorAvailability from "./DoctorAvailability.js";
import DoctorScheduleException from "./DoctorScheduleException.js";
import NotificationPreference from "./NotificationPreference.js";
import Notification from "./Notification.js";
import AuditLog from "./AuditLog.js";
import WhatsAppConversation from "./WhatsAppConversation.js";
import WhatsAppMessage from "./WhatsAppMessage.js";
import WhatsAppVerification from "./WhatsAppVerification.js";
import WhatsAppAppointmentRequest from "./WhatsAppAppointmentRequest.js";
import Consultation from "./Consultation.js";
import Diagnosis from "./Diagnosis.js";
import Prescription from "./Prescription.js";
import PrescriptionItem from "./PrescriptionItem.js";
import EmergencyContact from "./EmergencyContact.js";
import PasswordResetToken from "./PasswordResetToken.js";

// Associate each role with its user accounts.
Rol.hasMany(User, {
    foreignKey: "role_id",
    as: "usuarios",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

User.belongsTo(Rol, {
    foreignKey: "role_id",
    as: "rol",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate user accounts with their patient profiles.
User.hasOne(Patient, {
    foreignKey: "user_id",
    as: "patient",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Patient.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate user accounts with their doctor profiles.
User.hasOne(Doctor, {
    foreignKey: "user_id",
    as: "doctor",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Doctor.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate each medical specialty with its doctors.
Specialities.hasMany(Doctor, {
    foreignKey: "specialty_id",
    as: "doctors",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Doctor.belongsTo(Specialities, {
    foreignKey: "specialty_id",
    as: "specialty",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate each appointment status with its appointments.
AppointmentStatus.hasMany(Appointment, {
    foreignKey: "status_id",
    as: "appointments",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Appointment.belongsTo(AppointmentStatus, {
    foreignKey: "status_id",
    as: "status",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate each patient with their appointments.
Patient.hasMany(Appointment, {
    foreignKey: "patient_id",
    as: "appointments",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Appointment.belongsTo(Patient, {
    foreignKey: "patient_id",
    as: "patient",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate each doctor with their appointments.
Doctor.hasMany(Appointment, {
    foreignKey: "doctor_id",
    as: "appointments",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Appointment.belongsTo(Doctor, {
    foreignKey: "doctor_id",
    as: "doctor",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate each specialty with its appointments.
Specialities.hasMany(Appointment, {
    foreignKey: "specialty_id",
    as: "appointments",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Appointment.belongsTo(Specialities, {
    foreignKey: "specialty_id",
    as: "specialty",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate each appointment with its history records.
Appointment.hasMany(AppointmentHistory, {
    foreignKey: "appointment_id",
    as: "history",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

AppointmentHistory.belongsTo(Appointment, {
    foreignKey: "appointment_id",
    as: "appointment",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Preserve history when the actor account is deleted.
User.hasMany(AppointmentHistory, {
    foreignKey: "actor_user_id",
    as: "appointmentHistoryActions",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

AppointmentHistory.belongsTo(User, {
    foreignKey: "actor_user_id",
    as: "actor",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

// Associate each doctor with their regular availability blocks.
Doctor.hasMany(DoctorAvailability, {
    foreignKey: "doctor_id",
    as: "availability",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

DoctorAvailability.belongsTo(Doctor, {
    foreignKey: "doctor_id",
    as: "doctor",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate each doctor with their schedule exceptions.
Doctor.hasMany(DoctorScheduleException, {
    foreignKey: "doctor_id",
    as: "scheduleExceptions",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

DoctorScheduleException.belongsTo(Doctor, {
    foreignKey: "doctor_id",
    as: "doctor",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate schedule exceptions with the user who created them.
User.hasMany(DoctorScheduleException, {
    foreignKey: "created_by",
    as: "scheduleExceptionsCreated",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

DoctorScheduleException.belongsTo(User, {
    foreignKey: "created_by",
    as: "creator",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

// Associate each patient with their notification preferences.
Patient.hasMany(NotificationPreference, {
    foreignKey: "patient_id",
    as: "notificationPreferences",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

NotificationPreference.belongsTo(Patient, {
    foreignKey: "patient_id",
    as: "patient",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate each patient with their notification delivery history.
Patient.hasMany(Notification, {
    foreignKey: "patient_id",
    as: "notifications",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Notification.belongsTo(Patient, {
    foreignKey: "patient_id",
    as: "patient",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Preserve notification history when an appointment is deleted.
Appointment.hasMany(Notification, {
    foreignKey: "appointment_id",
    as: "notifications",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

Notification.belongsTo(Appointment, {
    foreignKey: "appointment_id",
    as: "appointment",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

// Associate audit records with the user who performed each action.
User.hasMany(AuditLog, {
    foreignKey: "actor_user_id",
    as: "auditLogs",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

AuditLog.belongsTo(User, {
    foreignKey: "actor_user_id",
    as: "actor",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

// Associate conversations with patients while preserving conversations.
Patient.hasMany(WhatsAppConversation, {
    foreignKey: "patient_id",
    as: "whatsappConversations",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

WhatsAppConversation.belongsTo(Patient, {
    foreignKey: "patient_id",
    as: "patient",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

// Associate each conversation with its messages.
WhatsAppConversation.hasMany(WhatsAppMessage, {
    foreignKey: "conversation_id",
    as: "messages",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

WhatsAppMessage.belongsTo(WhatsAppConversation, {
    foreignKey: "conversation_id",
    as: "conversation",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

/* WhatsApp identity verification associations. */
Patient.hasMany(WhatsAppVerification, {
    foreignKey: "patient_id",
    as: "whatsappVerifications",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

WhatsAppVerification.belongsTo(Patient, {
    foreignKey: "patient_id",
    as: "patient",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

/* WhatsApp appointment request associations. */
Patient.hasMany(WhatsAppAppointmentRequest, {
    foreignKey: "patient_id",
    as: "whatsappAppointmentRequests",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

WhatsAppAppointmentRequest.belongsTo(Patient, {
    foreignKey: "patient_id",
    as: "patient",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

WhatsAppConversation.hasMany(WhatsAppAppointmentRequest, {
    foreignKey: "conversation_id",
    as: "appointmentRequests",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

WhatsAppAppointmentRequest.belongsTo(WhatsAppConversation, {
    foreignKey: "conversation_id",
    as: "conversation",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Specialities.hasMany(WhatsAppAppointmentRequest, {
    foreignKey: "requested_specialty_id",
    as: "whatsappAppointmentRequests",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

WhatsAppAppointmentRequest.belongsTo(Specialities, {
    foreignKey: "requested_specialty_id",
    as: "requestedSpecialty",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

Doctor.hasMany(WhatsAppAppointmentRequest, {
    foreignKey: "requested_doctor_id",
    as: "whatsappAppointmentRequests",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

WhatsAppAppointmentRequest.belongsTo(Doctor, {
    foreignKey: "requested_doctor_id",
    as: "requestedDoctor",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

Appointment.hasMany(WhatsAppAppointmentRequest, {
    foreignKey: "appointment_id",
    as: "whatsappRequests",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

WhatsAppAppointmentRequest.belongsTo(Appointment, {
    foreignKey: "appointment_id",
    as: "appointment",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

/* Clinical consultation associations. */
Appointment.hasOne(Consultation, {
    foreignKey: "appointment_id",
    as: "consultation",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Consultation.belongsTo(Appointment, {
    foreignKey: "appointment_id",
    as: "appointment",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Doctor.hasMany(Consultation, {
    foreignKey: "doctor_id",
    as: "consultations",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Consultation.belongsTo(Doctor, {
    foreignKey: "doctor_id",
    as: "doctor",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

/* Diagnosis associations. */
Consultation.hasMany(Diagnosis, {
    foreignKey: "consultation_id",
    as: "diagnoses",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Diagnosis.belongsTo(Consultation, {
    foreignKey: "consultation_id",
    as: "consultation",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

/* Prescription associations. */
Consultation.hasMany(Prescription, {
    foreignKey: "consultation_id",
    as: "prescriptions",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Prescription.belongsTo(Consultation, {
    foreignKey: "consultation_id",
    as: "consultation",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

/* Prescription item associations. */
Prescription.hasMany(PrescriptionItem, {
    foreignKey: "prescription_id",
    as: "items",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

PrescriptionItem.belongsTo(Prescription, {
    foreignKey: "prescription_id",
    as: "prescription",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

/* Patient emergency contact associations. */
Patient.hasMany(EmergencyContact, {
    foreignKey: "patient_id",
    as: "emergencyContacts",
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
});

EmergencyContact.belongsTo(Patient, {
    foreignKey: "patient_id",
    as: "patient",
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
});

/* User password reset token associations. */
User.hasMany(PasswordResetToken, {
    foreignKey: "user_id",
    as: "passwordResetTokens",
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
});

PasswordResetToken.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
});

// Export the models after registering their associations.
export {
    Rol,
    User,
    Patient,
    Doctor,
    Specialities,
    AppointmentStatus,
    Appointment,
    AppointmentHistory,
    DoctorAvailability,
    DoctorScheduleException,
    NotificationPreference,
    Notification,
};
