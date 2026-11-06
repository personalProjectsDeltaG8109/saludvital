// Mirror the patient rescheduling rules when deciding whether to show the action.
export function canPatientRescheduleAppointment(appointment, now = Date.now()) {
    const rescheduleCount = appointment.history.filter(
        (event) => event.event_type === "Rescheduled",
    ).length;
    return (
        appointment.status.name === "Confirmed" &&
        new Date(appointment.start_at).getTime() >= now + 24 * 60 * 60 * 1000 &&
        rescheduleCount < 3
    );
}
