import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn() },
    AppointmentStatus: { findOne: jest.fn() },
    Doctor: { findAll: jest.fn() },
    DoctorAvailability: { findAll: jest.fn() },
    DoctorScheduleException: { findAll: jest.fn() },
    Specialities: { findAll: jest.fn() },
    User: {},
}));

const models = await import("../../src/models/associations.js");
const { getAdminAffectedAppointments, getAdminDoctorSchedules } =
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
    models.AppointmentStatus.findOne.mockResolvedValue({ id: 2 });
    models.Appointment.findAll.mockResolvedValue([]);
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
            affectedAppointments: 0,
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

    test("counts future confirmed appointments outside schedules or overlapping unavailable exceptions", async () => {
        configureDefaults();
        models.Appointment.findAll.mockResolvedValue([
            {
                id: 1,
                doctor_id: 1,
                start_at: "2026-10-31T14:30:00.000Z",
                end_at: "2026-10-31T15:00:00.000Z",
            },
            {
                id: 2,
                doctor_id: 2,
                start_at: "2026-10-31T14:30:00.000Z",
                end_at: "2026-10-31T15:00:00.000Z",
            },
            {
                id: 3,
                doctor_id: 3,
                start_at: "2026-10-31T14:30:00.000Z",
                end_at: "2026-10-31T15:00:00.000Z",
            },
        ]);
        models.DoctorAvailability.findAll.mockResolvedValue([
            {
                doctor_id: 2,
                day_of_week: 6,
                start_time: "09:00:00",
                end_time: "12:00:00",
                valid_from: "2026-01-01",
                valid_until: null,
            },
            {
                doctor_id: 3,
                day_of_week: 6,
                start_time: "09:00:00",
                end_time: "12:00:00",
                valid_from: "2026-01-01",
                valid_until: null,
            },
        ]);
        models.DoctorScheduleException.findAll.mockResolvedValueOnce([]).mockResolvedValueOnce([
            {
                doctor_id: 3,
                start_at: "2026-10-31T14:45:00.000Z",
                end_at: "2026-10-31T15:15:00.000Z",
            },
        ]);

        const result = await getAdminDoctorSchedules({}, NOW);

        expect(result.summary.affectedAppointments).toBe(2);
        expect(models.Appointment.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ status_id: 2 }) }),
        );
    });

    test("lists distinct affected appointments with exception context and safe fields", async () => {
        configureDefaults();
        models.Appointment.findAll.mockResolvedValue([
            {
                id: 103,
                doctor_id: 3,
                start_at: "2026-10-31T13:30:00.000Z",
                end_at: "2026-10-31T14:00:00.000Z",
                doctor: { id: 3, display_name: "Dr. Luis Morales" },
            },
            {
                id: 102,
                doctor_id: 2,
                start_at: "2026-10-31T14:30:00.000Z",
                end_at: "2026-10-31T15:00:00.000Z",
                doctor: { id: 2, display_name: "Dra. Ana Torres" },
            },
            {
                id: 102,
                doctor_id: 2,
                start_at: "2026-10-31T14:30:00.000Z",
                end_at: "2026-10-31T15:00:00.000Z",
                doctor: { id: 2, display_name: "Dra. Ana Torres" },
            },
        ]);
        models.DoctorAvailability.findAll.mockResolvedValue([
            {
                doctor_id: 2,
                day_of_week: 6,
                start_time: "09:00:00",
                end_time: "11:00:00",
                valid_from: "2026-01-01",
                valid_until: null,
            },
        ]);
        models.DoctorScheduleException.findAll.mockResolvedValue([
            {
                id: 91,
                doctor_id: 2,
                exception_type: "Unavailable",
                reason: "Permiso personal",
                start_at: "2026-10-31T14:00:00.000Z",
                end_at: "2026-10-31T15:30:00.000Z",
            },
        ]);

        const firstPage = await getAdminAffectedAppointments({ page: "1", pageSize: "1" }, NOW);
        const secondPage = await getAdminAffectedAppointments({ page: "2", pageSize: "1" }, NOW);

        expect(firstPage).toMatchObject({ totalItems: 2, page: 1, pageSize: 1, totalPages: 2 });
        expect(firstPage.appointments[0]).toMatchObject({
            id: 103,
            reference: "Cita #103",
            doctorName: "Dr. Luis Morales",
            status: "Confirmed",
            statusLabel: "Confirmada",
            reason: "El horario activo no cubre este intervalo.",
            exception: null,
            detailsHref: "/admin/appointments/103",
        });
        expect(secondPage.appointments).toHaveLength(1);
        expect(secondPage.appointments[0]).toMatchObject({
            id: 102,
            reason: "Permiso personal",
            exception: {
                reason: "Permiso personal",
                startDate: "2026-10-31",
                endDate: "2026-10-31",
            },
        });
        expect(JSON.stringify(secondPage)).not.toMatch(/patient|email|clinical/i);
        expect(models.DoctorScheduleException.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    exception_type: "Unavailable",
                    is_active: true,
                }),
            }),
        );
    });

    test("validates affected appointment pagination", async () => {
        await expect(getAdminAffectedAppointments({ page: "0" }, NOW)).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(getAdminAffectedAppointments({ pageSize: "26" }, NOW)).rejects.toMatchObject({
            statusCode: 400,
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
