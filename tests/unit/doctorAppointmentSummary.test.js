import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: {
        findAll: jest.fn(),
        findAndCountAll: jest.fn(),
        sequelize: {
            col: jest.fn((column) => column),
            fn: jest.fn((name, column) => [name, column]),
        },
    },
    AppointmentStatus: { findAll: jest.fn(), findOne: jest.fn() },
    Consultation: { findOne: jest.fn() },
    Doctor: { findOne: jest.fn() },
    Patient: {},
    Specialities: {},
}));

const models = await import("../../src/models/associations.js");
const { getDoctorAppointments } =
    await import("../../src/modules/doctor/services/doctorDashboardService.js");

function createAppointment(id, statusName) {
    return {
        id,
        start_at: new Date("2026-11-24T15:00:00.000Z"),
        end_at: new Date("2026-11-24T15:30:00.000Z"),
        patient: { first_name: "Ana", last_name: "Pérez" },
        status: { name: statusName },
        specialty: { name: "Medicina General" },
    };
}

describe("doctor appointment summary cards", () => {
    const statuses = [
        { id: 1, name: "Confirmed" },
        { id: 2, name: "In Progress" },
        { id: 3, name: "Attended" },
        { id: 4, name: "Cancelled" },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        models.Doctor.findOne.mockResolvedValue({ id: 17, display_name: "Dr. Test" });
        models.Consultation.findOne.mockResolvedValue(null);
        models.AppointmentStatus.findAll.mockResolvedValue(statuses);
        models.Appointment.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
        models.Appointment.findAll.mockResolvedValue([
            { status_id: 1, count: "5" },
            { status_id: 2, count: "2" },
            { status_id: 3, count: "3" },
            { status_id: 4, count: "1" },
        ]);
    });

    test("maps persisted status counts to the supported Spanish summary cards", async () => {
        const result = await getDoctorAppointments(42);

        expect(result.appointmentTotalCount).toBe(11);
        expect(
            result.appointmentStatuses.map(({ name, summaryLabel, count }) => [
                name,
                summaryLabel,
                count,
            ]),
        ).toEqual([
            ["Confirmed", "Confirmadas", 5],
            ["Attended", "Atendidas", 3],
            ["Cancelled", "Canceladas", 1],
        ]);
        expect(result.appointmentStatuses.map(({ summaryLabel }) => summaryLabel)).not.toContain(
            "En curso",
        );
    });

    test("loads status identifiers and counts only appointments owned by the signed-in doctor", async () => {
        await getDoctorAppointments(42);

        expect(models.AppointmentStatus.findAll).toHaveBeenCalledWith({
            attributes: ["id", "name"],
            order: [["name", "ASC"]],
        });
        expect(models.Appointment.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { doctor_id: 17 },
                attributes: ["status_id", [["COUNT", "id"], "count"]],
                group: ["status_id"],
                raw: true,
            }),
        );
    });

    test("returns zero for each supported status when no appointments exist", async () => {
        models.Appointment.findAll.mockResolvedValue([]);

        const result = await getDoctorAppointments(42);

        expect(result.appointmentTotalCount).toBe(0);
        expect(result.appointmentStatuses.map(({ count }) => count)).toEqual([0, 0, 0]);
    });

    test("returns the consultation link only for its matching in-progress appointment", async () => {
        models.Appointment.findAndCountAll.mockResolvedValue({
            count: 1,
            rows: [createAppointment(44, "In Progress")],
        });
        models.Consultation.findOne.mockResolvedValue({ id: 91, appointment_id: 44 });

        const result = await getDoctorAppointments(42);

        expect(models.Consultation.findOne).toHaveBeenCalledWith({
            where: { doctor_id: 17, status: "InProgress" },
            attributes: ["id", "appointment_id"],
            raw: true,
        });
        expect(result.appointments[0].consultationId).toBe(91);
    });

    test("does not link an in-progress appointment to a different consultation", async () => {
        models.Appointment.findAndCountAll.mockResolvedValue({
            count: 1,
            rows: [createAppointment(44, "In Progress")],
        });
        models.Consultation.findOne.mockResolvedValue({ id: 91, appointment_id: 45 });

        const result = await getDoctorAppointments(42);

        expect(result.appointments[0].consultationId).toBeNull();
    });

    test("does not return a consultation link when its identifier is unavailable", async () => {
        models.Appointment.findAndCountAll.mockResolvedValue({
            count: 1,
            rows: [createAppointment(44, "In Progress")],
        });
        models.Consultation.findOne.mockResolvedValue({ id: null, appointment_id: 44 });

        const result = await getDoctorAppointments(42);

        expect(result.appointments[0].consultationId).toBeNull();
    });
});
