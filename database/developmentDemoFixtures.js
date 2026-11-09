export const DEMO_PASSWORD = "SaludVitalTest2026!";

export const DEMO_ACCOUNTS = [
    {
        email: "admin.test@saludvital.local",
        role: "Administrator",
        displayName: "Administrador Demo",
    },
    {
        email: "doctor.test@saludvital.local",
        role: "Doctor",
        displayName: "Dr. Carlos Ramírez",
        specialty: "General Medicine",
        photo: "/brand/patient/doctor-carlos-ramirez.png",
    },
    {
        email: "doctor.pediatrics.test@saludvital.local",
        role: "Doctor",
        displayName: "Dra. Valentina Ríos",
        specialty: "Pediatrics",
        photo: "/brand/patient/doctor-valentina-rios.png",
    },
    {
        email: "doctor.dermatology.test@saludvital.local",
        role: "Doctor",
        displayName: "Dra. Camila Torres",
        specialty: "Dermatology",
        photo: "/brand/patient/doctor-camila-torres.png",
    },
    {
        email: "test@saludvital.local",
        role: "Patient",
        displayName: "Paciente Demo",
    },
];

const APPOINTMENTS = [
    {
        key: "confirmed",
        status: "Confirmed",
        doctor: "doctor.test@saludvital.local",
        dateOffset: 3,
        hour: 9,
        minute: 0,
        createdOffset: -5,
        reason: "Consulta de demostración confirmada.",
    },
    {
        key: "rescheduled",
        status: "Confirmed",
        doctor: "doctor.test@saludvital.local",
        dateOffset: 12,
        hour: 10,
        minute: 0,
        createdOffset: -14,
        previousDateOffset: 2,
        previousHour: 15,
        reason: "Consulta de demostración reprogramada.",
    },
    {
        key: "cancelled",
        status: "Cancelled",
        doctor: "doctor.test@saludvital.local",
        dateOffset: 6,
        hour: 11,
        minute: 0,
        createdOffset: -10,
        reason: "Consulta de demostración cancelada.",
    },
    {
        key: "no-show",
        status: "No Show",
        doctor: "doctor.test@saludvital.local",
        dateOffset: -2,
        hour: 9,
        minute: 0,
        createdOffset: -12,
        reason: "Consulta de demostración para mostrar una inasistencia.",
    },
    {
        key: "attended-01",
        status: "Attended",
        doctor: "doctor.test@saludvital.local",
        dateOffset: -30,
        hour: 8,
        minute: 0,
        createdOffset: -37,
        reason: "Consulta de demostración atendida 01.",
    },
    {
        key: "attended-02",
        status: "Attended",
        doctor: "doctor.test@saludvital.local",
        dateOffset: -90,
        hour: 10,
        minute: 30,
        createdOffset: -97,
        reason: "Consulta de demostración atendida 02.",
    },
    {
        key: "attended-03",
        status: "Attended",
        doctor: "doctor.test@saludvital.local",
        dateOffset: -180,
        hour: 14,
        minute: 0,
        createdOffset: -187,
        reason: "Consulta de demostración atendida 03.",
    },
    {
        key: "pediatrics-confirmed",
        status: "Confirmed",
        doctor: "doctor.pediatrics.test@saludvital.local",
        dateOffset: 5,
        hour: 13,
        minute: 0,
        createdOffset: -2,
        reason: "Consulta ficticia para mostrar la agenda de pediatría.",
    },
    {
        key: "dermatology-confirmed",
        status: "Confirmed",
        doctor: "doctor.dermatology.test@saludvital.local",
        dateOffset: 8,
        hour: 15,
        minute: 0,
        createdOffset: -3,
        reason: "Consulta ficticia para mostrar la agenda de dermatología.",
    },
];

const CLINICAL_RECORDS = [
    {
        key: "attended-01",
        symptoms: "DEMO: ejemplo ficticio de consulta preventiva.",
        notes: "DEMO: nota clínica de ejemplo; no tiene validez médica.",
        diagnosis: "DEMO: registro preventivo ficticio.",
        vitals: { blood_pressure: "120/80 mmHg (DEMO)", heart_rate: "72 lpm (DEMO)" },
    },
    {
        key: "attended-02",
        symptoms: "DEMO: ejemplo ficticio de consulta de seguimiento.",
        notes: "DEMO: información de seguimiento de prueba; no tiene validez médica.",
        diagnosis: "DEMO: seguimiento general ficticio.",
        vitals: { blood_pressure: "118/78 mmHg (DEMO)", heart_rate: "70 lpm (DEMO)" },
    },
    {
        key: "attended-03",
        symptoms: "DEMO: ejemplo ficticio de consulta de control.",
        notes: "DEMO: registro para mostrar el historial; no usar para atención clínica.",
        diagnosis: "DEMO: consulta de control ficticia.",
        vitals: { temperature: "36.7 °C (DEMO)", oxygen_saturation: "98 % (DEMO)" },
    },
];

function getBogotaDateParts(referenceDate) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "numeric",
        day: "numeric",
    }).formatToParts(referenceDate);
    return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}

export function formatDemoDateTime(dayOffset, hour, minute = 0, referenceDate = new Date()) {
    const { year, month, day } = getBogotaDateParts(referenceDate);
    const localDate = new Date(Date.UTC(year, month - 1, day + dayOffset, hour, minute));
    return localDate.toISOString().slice(0, 19).replace("T", " ");
}

export function addDemoMinutes(localDateTime, minutes) {
    const date = new Date(`${localDateTime.replace(" ", "T")}Z`);
    date.setUTCMinutes(date.getUTCMinutes() + minutes);
    return date.toISOString().slice(0, 19).replace("T", " ");
}

export function getDemoAppointmentScenarios(referenceDate = new Date()) {
    return APPOINTMENTS.map((scenario) => {
        const startAt = formatDemoDateTime(
            scenario.dateOffset,
            scenario.hour,
            scenario.minute,
            referenceDate,
        );
        const endAt = addDemoMinutes(startAt, 30);
        return {
            ...scenario,
            startAt,
            endAt,
            createdAt: formatDemoDateTime(scenario.createdOffset, 12, 0, referenceDate),
            previousStartAt:
                scenario.previousDateOffset === undefined
                    ? null
                    : formatDemoDateTime(
                          scenario.previousDateOffset,
                          scenario.previousHour,
                          0,
                          referenceDate,
                      ),
            previousEndAt:
                scenario.previousDateOffset === undefined
                    ? null
                    : formatDemoDateTime(
                          scenario.previousDateOffset,
                          scenario.previousHour,
                          30,
                          referenceDate,
                      ),
        };
    });
}

export function getDemoClinicalRecords() {
    return CLINICAL_RECORDS.map((record) => ({ ...record, vitals: { ...record.vitals } }));
}
