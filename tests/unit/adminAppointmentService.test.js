import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("sequelize", () => ({
    Op: {
        and: Symbol.for("sequelize.and"),
        gte: Symbol.for("sequelize.gte"),
        in: Symbol.for("sequelize.in"),
        lt: Symbol.for("sequelize.lt"),
        like: Symbol.for("sequelize.like"),
        or: Symbol.for("sequelize.or"),
    },
}));

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: {
        count: jest.fn(),
        findAll: jest.fn(),
        findAndCountAll: jest.fn(),
        findByPk: jest.fn(),
    },
    AppointmentStatus: { findAll: jest.fn() },
    Doctor: { findAll: jest.fn(), findByPk: jest.fn() },
    Patient: {},
    Specialities: { findAll: jest.fn(), findByPk: jest.fn() },
}));

const { Appointment, AppointmentStatus, Doctor, Specialities } =
    await import("../../src/models/associations.js");
const {
    getAdminAppointmentDetails,
    getAdminAppointments,
    getAdminAppointmentExportFilters,
    getAdminAppointmentExportRows,
} = await import("../../src/modules/admin/services/adminAppointmentService.js");

const supportedStatuses = [
    { id: 1, name: "Confirmed" },
    { id: 2, name: "In Progress" },
    { id: 3, name: "Attended" },
    { id: 4, name: "Cancelled" },
];

function createAppointment() {
    return {
        id: 10,
        start_at: new Date("2026-10-26T15:30:00.000Z"),
        end_at: new Date("2026-10-26T16:00:00.000Z"),
        reason: "private clinical information",
        source: "Web",
        patient: {
            id: 5,
            first_name: "María",
            last_name: "López",
            document_type: "CC",
            document_number: "123456",
            profile_photo_url: "/uploads/patient.jpg",
            phone: "3001234567",
        },
        doctor: { id: 3, display_name: "Dra. Ana Torres" },
        specialty: { id: 2, name: "Medicina General" },
        status: { id: 1, name: "Confirmed" },
    };
}

describe("admin appointment directory service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        AppointmentStatus.findAll.mockResolvedValue(supportedStatuses);
        Appointment.findAndCountAll.mockResolvedValue({ rows: [createAppointment()], count: 1 });
        Appointment.findAll.mockResolvedValue([createAppointment()]);
        Appointment.count.mockResolvedValue(1);
        Specialities.findAll.mockResolvedValue([{ id: 2, name: "Medicina General" }]);
        Doctor.findAll.mockResolvedValue([{ id: 3, display_name: "Dra. Ana Torres" }]);
        Specialities.findByPk.mockResolvedValue({ id: 2, name: "Medicina General" });
        Doctor.findByPk.mockResolvedValue({ id: 3, display_name: "Dra. Ana Torres" });
    });

    test("returns persisted appointment summaries, status counts, options, and pagination", async () => {
        const result = await getAdminAppointments({ page: "2", pageSize: "25" });

        expect(result.appointments[0]).toEqual({
            id: 10,
            startAt: "2026-10-26T15:30:00.000Z",
            endAt: "2026-10-26T16:00:00.000Z",
            patient: {
                id: 5,
                name: "María López",
                document: "CC 123456",
                photoUrl: "/uploads/patient.jpg",
            },
            specialty: "Medicina General",
            doctor: "Dra. Ana Torres",
            status: "Confirmed",
            statusLabel: "Confirmada",
        });
        expect(JSON.stringify(result)).not.toContain("private clinical information");
        expect(JSON.stringify(result)).not.toContain("3001234567");
        expect(result.stats).toEqual({
            total: 4,
            Confirmed: 1,
            "In Progress": 1,
            Attended: 1,
            Cancelled: 1,
        });
        expect(result.pagination).toMatchObject({ page: 2, pageSize: 25, totalItems: 1 });
        expect(Appointment.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 25, offset: 25, distinct: true }),
        );
        expect(AppointmentStatus.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    name: {
                        [Symbol.for("sequelize.in")]: supportedStatuses.map((row) => row.name),
                    },
                },
            }),
        );
    });

    test("applies Bogota date boundaries and patient name, document, and phone search", async () => {
        await getAdminAppointments({
            from: "2026-10-26",
            to: "2026-10-27",
            specialtyId: "2",
            doctorId: "3",
            search: "María López",
        });

        const { where } = Appointment.findAndCountAll.mock.calls[0][0];
        expect(where.start_at).toEqual({
            [Symbol.for("sequelize.gte")]: new Date("2026-10-26T05:00:00.000Z"),
            [Symbol.for("sequelize.lt")]: new Date("2026-10-28T05:00:00.000Z"),
        });
        expect(where).toMatchObject({ specialty_id: 2, doctor_id: 3 });
        expect(where[Symbol.for("sequelize.or")]).toEqual(
            expect.arrayContaining([
                {
                    "$patient.document_number$": {
                        [Symbol.for("sequelize.like")]: "%María López%",
                    },
                },
                { "$patient.phone$": { [Symbol.for("sequelize.like")]: "%María López%" } },
            ]),
        );
    });

    test("filters by one of the supported appointment statuses", async () => {
        await getAdminAppointments({ status: "Cancelled" });

        expect(Appointment.findAndCountAll.mock.calls[0][0].where.status_id).toBe(4);
        expect(AppointmentStatus.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    name: {
                        [Symbol.for("sequelize.in")]: supportedStatuses.map((row) => row.name),
                    },
                },
            }),
        );
    });

    test("exports all matching records with safe fields and no pagination", async () => {
        const rows = await getAdminAppointmentExportRows({
            from: "2026-10-26",
            to: "2026-10-27",
            status: "Confirmed",
            specialtyId: "2",
            doctorId: "3",
            search: "Mar\u00eda L\u00f3pez",
        });

        expect(rows).toEqual([
            {
                id: 10,
                startAt: "2026-10-26T15:30:00.000Z",
                endAt: "2026-10-26T16:00:00.000Z",
                patientName: "Mar\u00eda L\u00f3pez",
                specialty: "Medicina General",
                doctor: "Dra. Ana Torres",
                status: "Confirmed",
                statusLabel: "Confirmada",
            },
        ]);
        expect(Appointment.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    specialty_id: 2,
                    doctor_id: 3,
                    status_id: 1,
                    start_at: {
                        [Symbol.for("sequelize.gte")]: new Date("2026-10-26T05:00:00.000Z"),
                        [Symbol.for("sequelize.lt")]: new Date("2026-10-28T05:00:00.000Z"),
                    },
                }),
                order: [
                    ["start_at", "DESC"],
                    ["id", "DESC"],
                ],
            }),
        );
        expect(Appointment.findAll.mock.calls[0][0].where[Symbol.for("sequelize.or")]).toEqual(
            expect.arrayContaining([
                {
                    "$patient.first_name$": {
                        [Symbol.for("sequelize.like")]: "%María L\u00f3pez%",
                    },
                },
                {
                    "$patient.document_number$": {
                        [Symbol.for("sequelize.like")]: "%María L\u00f3pez%",
                    },
                },
                { "$patient.phone$": { [Symbol.for("sequelize.like")]: "%María L\u00f3pez%" } },
            ]),
        );
        expect(Appointment.findAll.mock.calls[0][0]).not.toHaveProperty("limit");
        expect(Appointment.findAll.mock.calls[0][0].include[0].attributes).toEqual([
            "id",
            "first_name",
            "last_name",
        ]);
        expect(JSON.stringify(rows)).not.toContain("123456");
        expect(JSON.stringify(rows)).not.toContain("3001234567");
        expect(JSON.stringify(rows)).not.toContain("private clinical information");
        expect(JSON.stringify(rows)).not.toContain("Pending");
    });

    test("returns an empty export result when no appointments match the filters", async () => {
        Appointment.findAll.mockResolvedValue([]);

        await expect(getAdminAppointmentExportRows({ search: "no-match" })).resolves.toEqual([]);
    });

    test("rejects unsupported appointment statuses in export filters", async () => {
        await expect(getAdminAppointmentExportRows({ status: "Pending" })).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(Appointment.findAll).not.toHaveBeenCalled();
    });

    test("formats active export filters for the printable report", async () => {
        const filters = await getAdminAppointmentExportFilters({
            from: "2026-10-20",
            to: "2026-10-27",
            status: "Confirmed",
            specialtyId: "2",
            doctorId: "3",
            search: "María",
        });

        expect(filters).toEqual([
            { label: "Desde", value: "2026-10-20" },
            { label: "Hasta", value: "2026-10-27" },
            { label: "Estado", value: "Confirmada" },
            { label: "Especialidad", value: "Medicina General" },
            { label: "Médico", value: "Dra. Ana Torres" },
            { label: "Paciente", value: "María" },
        ]);
        expect(Specialities.findByPk).toHaveBeenCalledWith(2, {
            attributes: ["name"],
        });
        expect(Doctor.findByPk).toHaveBeenCalledWith(3, {
            attributes: ["id", "display_name"],
        });
    });

    test("returns safe details for an existing appointment", async () => {
        Appointment.findByPk.mockResolvedValue(createAppointment());

        const result = await getAdminAppointmentDetails("10");

        expect(result).toEqual({
            id: 10,
            startAt: "2026-10-26T15:30:00.000Z",
            endAt: "2026-10-26T16:00:00.000Z",
            patient: { id: 5, name: "María López", photoUrl: "/uploads/patient.jpg" },
            specialty: "Medicina General",
            doctor: "Dra. Ana Torres",
            status: "Confirmed",
            statusLabel: "Confirmada",
        });
        expect(JSON.stringify(result)).not.toContain("123456");
        expect(JSON.stringify(result)).not.toContain("3001234567");
        expect(JSON.stringify(result)).not.toContain("private clinical information");
        expect(Appointment.findByPk).toHaveBeenCalledWith(
            10,
            expect.objectContaining({
                include: expect.arrayContaining([
                    expect.objectContaining({
                        as: "patient",
                        attributes: ["id", "first_name", "last_name", "profile_photo_url"],
                    }),
                ]),
            }),
        );
    });

    test("returns not found for invalid, missing, or unsupported-status appointments", async () => {
        await expect(getAdminAppointmentDetails("not-an-id")).rejects.toMatchObject({
            statusCode: 404,
            message: "No encontramos esa cita.",
        });
        Appointment.findByPk.mockResolvedValue(null);
        await expect(getAdminAppointmentDetails("999")).rejects.toMatchObject({
            statusCode: 404,
            message: "No encontramos esa cita.",
        });

        Appointment.findByPk.mockResolvedValue({
            ...createAppointment(),
            status: { id: 5, name: "Unknown" },
        });
        await expect(getAdminAppointmentDetails("10")).rejects.toMatchObject({
            statusCode: 404,
            message: "No encontramos esa cita.",
        });
    });

    test.each([
        [{ page: "0" }, "La página tiene un valor no válido."],
        [{ pageSize: "15" }, "El tamaño de página solicitado no es válido."],
        [{ status: "Unsupported" }, "El estado seleccionado no es válido."],
        [{ from: "2026-02-30" }, "La fecha inicial no es válida."],
        [
            { from: "2026-10-28", to: "2026-10-26" },
            "La fecha inicial debe ser anterior a la fecha final.",
        ],
        [{ search: "x".repeat(101) }, "La búsqueda no puede superar los 100 caracteres."],
    ])("rejects invalid query %o", async (query, message) => {
        await expect(getAdminAppointments(query)).rejects.toMatchObject({
            statusCode: 400,
            message,
        });
        expect(Appointment.findAndCountAll).not.toHaveBeenCalled();
    });
});
