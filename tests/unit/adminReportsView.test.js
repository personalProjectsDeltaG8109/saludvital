import { describe, expect, test } from "@jest/globals";
import pug from "pug";

const reports = {
    period: { label: "Últimos 30 días", start: "28 sept 2026", end: "27 oct 2026" },
    summary: {
        totalAppointments: 8,
        attendedAppointments: 2,
        cancelledAppointments: 1,
        uniquePatients: 6,
        attendedPercentage: 25,
        cancellationRate: 13,
    },
    statusChart: {
        total: 8,
        style: "background: conic-gradient(#13b87a 0deg 180deg, #ff4c55 180deg 360deg)",
        description: "Distribución de citas por estado.",
        segments: [
            {
                label: "Confirmadas",
                color: "#13b87a",
                count: 4,
                percentage: 50,
            },
            {
                label: "Canceladas",
                color: "#ff4c55",
                count: 2,
                percentage: 25,
            },
            {
                label: "Reprogramadas",
                color: "#168de2",
                count: 2,
                percentage: 25,
            },
        ],
    },
    specialties: [{ name: "Medicina General", count: 8, height: 150, color: "#168de2" }],
    topDoctors: [
        { name: "Dra. Ana Torres", count: 8, rank: 1, width: 100 },
        { name: "<script>alert(1)</script>", count: 1, rank: 2, width: 13 },
    ],
    trend: {
        total: 8,
        maximum: 4,
        dates: [{ label: "1 oct", x: 12, showLabel: true }],
        series: [
            { label: "Atendidas", color: "#13b87a", points: "12,180" },
            { label: "Confirmadas", color: "#168de2", points: "12,80" },
            { label: "Canceladas", color: "#ff4c55", points: "12,210" },
        ],
    },
    averageConsultationMinutes: 32,
    whatsappAppointmentRequests: 3,
};

describe("administrator reports page", () => {
    test("renders the report aggregates and accessible charts without sample or sensitive data", () => {
        const html = pug.renderFile("views/admin/partials/admin-reports-content.pug", { reports });

        expect(html).toContain("Pacientes únicos");
        expect(html).toContain("Citas por estado");
        expect(html).toContain("Citas por especialidad");
        expect(html).toContain("Tendencia de citas");
        expect(html).toContain("Top médicos por número de citas");
        expect(html).toContain("Tiempo promedio de consulta");
        expect(html).toContain("Solicitudes por WhatsApp");
        expect(html).toContain("Atendidas");
        expect(html).toContain('role="img"');
        expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(html).not.toContain("<script>alert(1)</script>");
        expect(html).not.toMatch(/Pacientes nuevos|Pending|clinical_notes|password_hash/i);
        expect(html).toContain("Reprogramadas");
        expect(html).not.toMatch(/En curso/);
    });

    test("provides accessible loading and safe error states", () => {
        const html = pug.renderFile("views/admin/reports.pug", {
            pageTitle: "Reportes e indicadores | SaludVital",
            adminName: "Administrador",
            selectedReportDays: 30,
        });

        expect(html).toContain("Reportes e indicadores");
        expect(html).toContain("Últimos 7 días");
        expect(html).toContain("Últimos 30 días");
        expect(html).toContain("Últimos 90 días");
        expect(html).toContain('name="period"');
        expect(html).toContain("Seleccionar período del reporte");
        expect(html).toContain('role="status"');
        expect(html).toContain("Cargando reportes e indicadores");
        expect(html).toContain('role="alert"');
        expect(html).toContain("No pudimos cargar los reportes");
        expect(html).not.toContain("stack");
    });

    test("marks the selected period in the selector", () => {
        const html = pug.renderFile("views/admin/reports.pug", {
            pageTitle: "Reportes e indicadores | SaludVital",
            adminName: "Administrador",
            selectedReportDays: 90,
        });

        expect(html).toContain('<option value="90" selected>Últimos 90 días</option>');
    });

    test("shows trends when the period has only attended appointments", () => {
        const html = pug.renderFile("views/admin/partials/admin-reports-content.pug", {
            reports: {
                ...reports,
                statusChart: {
                    ...reports.statusChart,
                    total: 0,
                    description:
                        "No hay citas confirmadas, canceladas o reprogramadas en el período.",
                    segments: [],
                },
                trend: { ...reports.trend, total: 1 },
            },
        });

        expect(html).toContain("No hay citas en el período seleccionado.");
        expect(html).toContain("Tendencia diaria de citas atendidas, confirmadas y canceladas");
    });
});
