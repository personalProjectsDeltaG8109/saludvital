const CSV_HEADERS = [
    "N\u00famero de cita",
    "Fecha y hora de inicio",
    "Fecha y hora de finalizaci\u00f3n",
    "Paciente",
    "Especialidad",
    "M\u00e9dico",
    "Estado",
];

const bogotaDateTime = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
});

function escapeCsvCell(value) {
    let text = String(value ?? "");
    if (/^\s*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) {
        text = `'${text}`;
    }
    return `"${text.replaceAll('"', '""')}"`;
}

/** Create a UTF-8 CSV with spreadsheet-safe values and Spanish headings. */
export function createAppointmentCsv(appointments) {
    const rows = [CSV_HEADERS];

    appointments.forEach((appointment) => {
        rows.push([
            appointment.id,
            bogotaDateTime.format(new Date(appointment.startAt)),
            bogotaDateTime.format(new Date(appointment.endAt)),
            appointment.patientName,
            appointment.specialty,
            appointment.doctor,
            appointment.statusLabel,
        ]);
    });

    return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;
}
