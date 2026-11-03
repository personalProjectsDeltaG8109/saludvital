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
});
