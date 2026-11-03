const MODULE_PRESENTATIONS = {
    Appointment: { label: "Citas médicas", icon: "appointment" },
    Doctor: { label: "Médicos", icon: "doctor" },
    DoctorAvailability: { label: "Horarios", icon: "schedule" },
    DoctorScheduleException: { label: "Horarios", icon: "schedule" },
    MedicalSpecialty: { label: "Especialidades", icon: "specialty" },
    User: { label: "Usuarios y roles", icon: "user" },
};

const ACTION_LABELS = {
    AdminAppointmentCreated: "Creación de cita",
    AdminAppointmentCancelled: "Cancelación de cita",
    AdminAppointmentRescheduled: "Reprogramación de cita",
    AppointmentCancelled: "Cancelación de cita",
    AppointmentCreated: "Creación de cita",
    AppointmentRescheduled: "Reprogramación de cita",
    AdminDoctorActivated: "Activación de médico",
    AdminDoctorCreated: "Registro de médico",
    AdminDoctorDeactivated: "Desactivación de médico",
    AdminDoctorScheduleDeleted: "Retiro de intervalo",
    AdminDoctorScheduleExceptionActivated: "Activación de excepción",
    AdminDoctorScheduleExceptionCreated: "Creación de excepción",
    AdminDoctorScheduleExceptionDeactivated: "Desactivación de excepción",
    AdminDoctorScheduleExceptionUpdated: "Actualización de excepción",
    AdminDoctorScheduleUpdated: "Actualización de horario",
    AdminSpecialtyActivated: "Activación de especialidad",
    AdminSpecialtyCreated: "Creación de especialidad",
    AdminSpecialtyDeactivated: "Desactivación de especialidad",
    AdminSpecialtyUpdated: "Actualización de especialidad",
    AdminUserAccountUpdated: "Actualización de cuenta",
    AdminUserProfileUpdated: "Actualización de perfil",
    AdminUserProfilePhotoUpdated: "Actualización de foto de perfil",
    AdminUserProfilePhotoRemoved: "Eliminación de foto de perfil",
    AdminNotificationPreferencesUpdated: "Actualización de preferencias de notificaciones",
    UserPasswordReset: "Restablecimiento de contraseña",
};

export function getAuditModulePresentation(targetType) {
    return MODULE_PRESENTATIONS[targetType] || { label: "Otros", icon: "system" };
}

export function getAuditModuleLabel(targetType, fallback = "Otros") {
    return MODULE_PRESENTATIONS[targetType]?.label || fallback;
}

export function getAuditActionLabel(action) {
    return ACTION_LABELS[action] || "Actividad";
}
