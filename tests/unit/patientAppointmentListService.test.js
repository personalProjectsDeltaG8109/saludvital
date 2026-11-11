import { jest } from "@jest/globals";
import { Op } from "sequelize";

const models = {
    Appointment: { count: jest.fn(), findAll: jest.fn() },
    AppointmentHistory: {},
    AppointmentStatus: {},
    Doctor: {},
    Patient: { findOne: jest.fn() },
    Specialities: { findAll: jest.fn() },
};

jest.unstable_mockModule("../../src/models/associations.js", () => models);
jest.unstable_mockModule("../../src/modules/patient/errors/appointmentError.js", () => ({
    AppointmentError: class AppointmentError extends Error {
        constructor(message, statusCode) {
            super(message);
            this.statusCode = statusCode;
        }
    },
}));

const { getPatientAppointmentList } =
    await import("../../src/modules/patient/services/patientAppointmentListService.js");

function createAppointment(id) {
    return {
        get: () => ({
            id,
            history: [
                { event_type: "Created", occurred_at: "2026-11-01T12:00:00.000Z" },
                { event_type: "Rescheduled", occurred_at: "2026-11-02T12:00:00.000Z" },
            ],
        }),
    };
}

describe("patient appointment list service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        models.Patient.findOne.mockResolvedValue({ id: 42 });
        models.Appointment.count.mockResolvedValue(21);
        models.Appointment.findAll
            .mockResolvedValueOnce([
                { status_id: 1, "status.name": "Confirmed", count: "13" },
                { status_id: 2, "status.name": "Cancelled", count: "8" },
            ])
            .mockResolvedValueOnce([createAppointment(7)]);
        models.Specialities.findAll.mockResolvedValue([{ name: "Medicina General" }]);
    });

    test("bounds retrieval and preserves active filters in pagination links", async () => {
        const result = await getPatientAppointmentList(
            9,
            {
                filter: "all",
                page: "2",
                pageSize: "10",
                search: "Laura",
                specialty: "Medicina General",
                status: "Confirmed",
            },
            new Date("2026-11-10T15:00:00.000Z"),
        );

        expect(models.Patient.findOne).toHaveBeenCalledWith({
            where: { user_id: 9 },
            attributes: ["id"],
        });
        const appliedFilters = models.Appointment.count.mock.calls[0][0];
        expect(appliedFilters.include[0]).toMatchObject({ as: "doctor", required: true });
        expect(appliedFilters.include[1].where).toEqual({ name: "Medicina General" });
        expect(appliedFilters.include[2].where[Op.and][0]).toEqual({ name: "Confirmed" });
        expect(appliedFilters.where[Op.and][0]).toEqual({ patient_id: 42 });
        expect(models.Appointment.findAll).toHaveBeenLastCalledWith(
            expect.objectContaining({ limit: 10, offset: 10 }),
        );
        const pageQuery = models.Appointment.findAll.mock.calls.at(-1)[0];
        expect(pageQuery.order).toHaveLength(4);
        expect(pageQuery.order[0][0].val).toContain("Confirmed");
        expect(pageQuery.order[0][0].val).toContain("2026-11-10 10:00:00");
        expect(result.pagination).toMatchObject({ page: 2, total: 21, totalPages: 3 });
        expect(result.pagination.previousUrl).toContain("search=Laura");
        expect(result.pagination.previousUrl).toContain("status=Confirmed");
        expect(result.appointments[0].history.map((event) => event.event_type)).toEqual([
            "Created",
            "Rescheduled",
        ]);
    });

    test("rejects invalid page sizes and unsupported filters before querying appointments", async () => {
        await expect(getPatientAppointmentList(9, { pageSize: "11" })).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(getPatientAppointmentList(9, { status: "Delivered" })).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(models.Appointment.count).not.toHaveBeenCalled();
    });

    test("returns an empty bounded result for patients without appointment history", async () => {
        models.Patient.findOne.mockResolvedValue(null);

        const result = await getPatientAppointmentList(9);

        expect(result.appointments).toEqual([]);
        expect(result.pagination.total).toBe(0);
        expect(models.Appointment.count).not.toHaveBeenCalled();
    });

    test("clamps an out-of-range page to the last available page", async () => {
        const result = await getPatientAppointmentList(9, { page: "20", pageSize: "10" });

        expect(result.pagination.page).toBe(3);
        expect(models.Appointment.findAll).toHaveBeenLastCalledWith(
            expect.objectContaining({ limit: 10, offset: 20 }),
        );
    });
});
