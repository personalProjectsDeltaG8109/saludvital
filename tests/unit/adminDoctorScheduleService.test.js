import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Doctor: { findAll: jest.fn() },
    DoctorAvailability: { findAll: jest.fn() },
    DoctorScheduleException: { findAll: jest.fn() },
    Specialities: { findAll: jest.fn() },
    User: {},
}));

const models = await import("../../src/models/associations.js");
const { getAdminDoctorSchedules } =
    await import("../../src/modules/admin/services/adminDoctorScheduleService.js");

const NOW = new Date("2026-10-26T12:00:00.000Z");

function createDoctor(id, overrides = {}) {
    return {
        id,
        display_name: `Doctor ${id}`,
        profile_photo_url: null,
        user: { email: `doctor${id}@saludvital.co`, is_active: true },
        specialty: { id: 4, name: "Medicina General" },
        availability: [],
        ...overrides,
    };
}

function configureDefaults(doctors = []) {
    models.Doctor.findAll.mockResolvedValue(doctors);
    models.DoctorScheduleException.findAll.mockResolvedValue([]);
    models.DoctorAvailability.findAll.mockResolvedValue([]);
    models.Specialities.findAll.mockResolvedValue([{ id: 4, name: "Medicina General" }]);
}

describe("admin doctor schedule directory", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        configureDefaults();
    });

    test("returns real schedule summaries and applies doctor, specialty, search, and status filters", async () => {
        configureDefaults([
            createDoctor(1, {
                availability: [
                    {
                        id: 10,
                        day_of_week: 1,
                        start_time: "08:00:00",
                        end_time: "12:00:00",
                        valid_from: "2026-01-01",
                        valid_until: null,
                    },
                ],
            }),
            createDoctor(2, { user: { email: "camila@example.co", is_active: true } }),
            createDoctor(3, { user: { email: "inactive@example.co", is_active: false } }),
        ]);
        models.DoctorScheduleException.findAll.mockResolvedValue([
            {
                id: 8,
                exception_type: "Unavailable",
                reason: "Permiso",
                start_at: "2026-10-27T13:00:00.000Z",
                end_at: "2026-10-27T17:00:00.000Z",
                doctor: createDoctor(1),
            },
        ]);

        const result = await getAdminDoctorSchedules(
            {
                search: "camila",
                doctorId: "2",
                specialtyId: "4",
                status: "unconfigured",
                weekStart: "2026-10-26",
            },
            NOW,
        );

        expect(result.summary).toEqual({
            activeDoctors: 2,
            configuredSchedules: 1,
            upcomingExceptions: 1,
        });
        expect(result.doctors).toHaveLength(1);
        expect(result.doctors[0]).toMatchObject({
            id: 2,
            email: "camila@example.co",
            hasSchedule: false,
        });
        expect(result.week).toEqual({ start: "2026-10-26", end: "2026-11-01" });
        expect(models.Doctor.findAll).toHaveBeenCalled();
        expect(models.Specialities.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ where: { is_active: true } }),
        );
        expect(models.DoctorScheduleException.findAll.mock.calls[0][0].where).toMatchObject({
            is_active: true,
            start_at: { [Op.lt]: new Date("2026-11-02T05:00:00.000Z") },
            end_at: { [Op.gt]: new Date("2026-10-26T05:00:00.000Z") },
        });
    });

    test("rejects invalid search values and weeks that do not start on Monday", async () => {
        await expect(
            getAdminDoctorSchedules({ search: "x".repeat(101) }, NOW),
        ).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(
            getAdminDoctorSchedules({ weekStart: "2026-10-27" }, NOW),
        ).rejects.toMatchObject({
            statusCode: 400,
        });
    });
});
