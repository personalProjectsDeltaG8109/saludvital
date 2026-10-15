
import Rol from "./Rol.js";
import Usuario from "./User.js";
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

// Associate each role with its user accounts.
Rol.hasMany(Usuario, {
    foreignKey: "role_id",
    as: "usuarios",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Usuario.belongsTo(Rol, {
    foreignKey: "role_id",
    as: "rol",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate user accounts with their patient profiles.
Usuario.hasOne(Patient, {
    foreignKey: "user_id",
    as: "patient",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Patient.belongsTo(Usuario, {
    foreignKey: "user_id",
    as: "user",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate user accounts with their doctor profiles.
Usuario.hasOne(Doctor, {
    foreignKey: "user_id",
    as: "doctor",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Doctor.belongsTo(Usuario, {
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
Usuario.hasMany(AppointmentHistory, {
    foreignKey: "actor_user_id",
    as: "appointmentHistoryActions",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

AppointmentHistory.belongsTo(Usuario, {
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
Usuario.hasMany(DoctorScheduleException, {
    foreignKey: "created_by",
    as: "scheduleExceptionsCreated",
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
});

DoctorScheduleException.belongsTo(Usuario, {
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

// Export the models after registering their associations.
export {
    Rol,
    Usuario,
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
