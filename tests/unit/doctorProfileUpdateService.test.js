import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("../../config/database.js", () => ({
    default: {
        transaction: jest.fn(async (callback) => callback(transaction)),
    },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Doctor: { findOne: jest.fn() },
    Specialities: {},
    User: { findByPk: jest.fn() },
}));

const database = (await import("../../config/database.js")).default;
const { Doctor, User } = await import("../../src/models/associations.js");
const { updateDoctorProfile } =
    await import("../../src/modules/doctor/services/doctorProfileService.js");

function createDoctorRecord() {
    const doctor = {
        id: 9,
        alternate_phone: null,
        address: null,
        department: null,
        municipality: null,
        update: jest.fn(async (values) => Object.assign(doctor, values)),
    };
    return doctor;
}

function createUserRecord() {
    const user = {
        id: 42,
        phone: "+573001234567",
        is_active: true,
        update: jest.fn(async (values) => Object.assign(user, values)),
    };
    return user;
}

function createProfileRecord(doctor, user) {
    return {
        ...doctor,
        display_name: "Carlos Ramírez",
        profile_photo_url: null,
        created_at: new Date("2024-01-15T12:00:00.000Z"),
        specialty: { name: "Medicina General" },
        user: {
            display_name: null,
            email: "carlos@example.co",
            phone: user.phone,
            is_active: true,
            email_verified_at: null,
            created_at: new Date("2024-01-15T12:00:00.000Z"),
        },
    };
}

const validInput = {
    phone: "+573112223344",
    alternatePhone: "+573155667788",
    address: "Carrera 10 # 20-30",
    department: "05",
    city: "05002",
};

describe("doctor profile updates", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("updates only the authenticated doctor's contact and address fields atomically", async () => {
        const doctor = createDoctorRecord();
        const user = createUserRecord();
        Doctor.findOne
            .mockResolvedValueOnce(doctor)
            .mockImplementationOnce(async () => createProfileRecord(doctor, user));
        User.findByPk.mockResolvedValue(user);

        const result = await updateDoctorProfile("42", validInput);

        expect(Doctor.findOne).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                where: { user_id: 42 },
                transaction,
                lock: "UPDATE",
            }),
        );
        expect(doctor.update).toHaveBeenCalledWith(
            {
                alternate_phone: "+573155667788",
                address: "Carrera 10 # 20-30",
                department: "ANTIOQUIA",
                municipality: "ABEJORRAL",
            },
            { transaction },
        );
        expect(user.update).toHaveBeenCalledWith({ phone: "+573112223344" }, { transaction });
        expect(result).toMatchObject({
            changed: true,
            profile: {
                editableFields: {
                    phone: "+573112223344",
                    alternatePhone: "+573155667788",
                    address: "Carrera 10 # 20-30",
                    department: "05",
                    city: "05002",
                },
            },
        });
    });

    test("rejects invalid phone numbers and unsupported fields before starting a transaction", async () => {
        await expect(
            updateDoctorProfile("42", { ...validInput, phone: "abc" }),
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            updateDoctorProfile("42", { ...validInput, specialtyId: 3 }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(database.transaction).not.toHaveBeenCalled();
        expect(Doctor.findOne).not.toHaveBeenCalled();
    });

    test("rejects a municipality that does not belong to the selected department", async () => {
        await expect(
            updateDoctorProfile("42", { ...validInput, city: "66001" }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(database.transaction).not.toHaveBeenCalled();
    });

    test("rejects incomplete payloads instead of clearing omitted profile fields", async () => {
        await expect(updateDoctorProfile("42", { phone: "+573112223344" })).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(database.transaction).not.toHaveBeenCalled();
    });

    test("rejects attempts to address another doctor by ID", async () => {
        await expect(updateDoctorProfile("not-an-id", validInput)).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(database.transaction).not.toHaveBeenCalled();
    });

    test("clears optional fields when the doctor submits empty values", async () => {
        const doctor = createDoctorRecord();
        doctor.alternate_phone = "+573155667788";
        doctor.address = "Carrera 10";
        doctor.department = "ANTIOQUIA";
        doctor.municipality = "ABEJORRAL";
        const user = createUserRecord();
        const input = {
            phone: user.phone,
            alternatePhone: "",
            address: "",
            department: "",
            city: "",
        };
        Doctor.findOne
            .mockResolvedValueOnce(doctor)
            .mockImplementationOnce(async () => createProfileRecord(doctor, user));
        User.findByPk.mockResolvedValue(user);

        await updateDoctorProfile("42", input);

        expect(doctor.update).toHaveBeenCalledWith(
            { alternate_phone: null, address: null, department: null, municipality: null },
            { transaction },
        );
        expect(user.update).not.toHaveBeenCalled();
    });
});
