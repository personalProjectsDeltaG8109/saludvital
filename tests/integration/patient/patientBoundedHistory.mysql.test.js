import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "@jest/globals";
import database from "../../../config/database.js";
import {
    Appointment,
    AppointmentHistory,
    AppointmentStatus,
    Consultation,
    Doctor,
    Patient,
    Rol,
    Specialities,
    User,
} from "../../../src/models/associations.js";
import { getPatientAppointmentList } from "../../../src/modules/patient/services/patientAppointmentListService.js";
import { getPatientClinicalHistory } from "../../../src/modules/patient/services/clinicalHistoryService.js";

if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
    throw new Error(
        "Patient history integration tests require NODE_ENV=test and DB_NAME=saludvital_test.",
    );
}

const FIXTURE_RECORD_COUNT = 120;
const PAGE_SIZE = 50;

describe("patient bounded histories with real MySQL", () => {
    const createdRecords = {
        userIds: [],
        doctorIds: [],
        patientIds: [],
        appointmentIds: [],
        consultationIds: [],
        statusIds: [],
        specialtyIds: [],
    };
    let patientUser;
    let patient;
    let doctor;
    let specialty;
    let attendedStatus;

    beforeAll(async () => {
        await database.authenticate();

        const [doctorRole, patientRole] = await Promise.all([
            Rol.findOne({ where: { name: "Doctor" } }),
            Rol.findOne({ where: { name: "Patient" } }),
        ]);
        if (!doctorRole || !patientRole) {
            throw new Error("Required roles are missing in saludvital_test.");
        }

        specialty = await Specialities.create({
            name: `Patient history test ${randomUUID()}`,
            description: "Synthetic specialty for patient history integration tests.",
            is_active: true,
        });
        createdRecords.specialtyIds.push(specialty.id);

        attendedStatus = await findOrCreateAttendedStatus();

        const suffix = randomUUID().replaceAll("-", "");
        patientUser = await createUser(patientRole.id, `patient-${suffix}`);
        patient = await Patient.create({
            user_id: patientUser.id,
            first_name: "Synthetic",
            last_name: "Patient",
            phone: "3000000000",
            date_of_birth: "1990-01-01",
            document_type: "CC",
            document_number: suffix.slice(0, 15),
            department: "Risaralda",
            municipality: "Pereira",
        });
        createdRecords.patientIds.push(patient.id);

        const doctorUser = await createUser(doctorRole.id, `doctor-${suffix}`);
        doctor = await Doctor.create({
            user_id: doctorUser.id,
            specialty_id: specialty.id,
            display_name: "Synthetic Doctor",
        });
        createdRecords.doctorIds.push(doctor.id);
    });

    afterEach(async () => {
        await removeAppointmentFixtures();
    });

    afterAll(async () => {
        await removeAppointmentFixtures();
        for (const patientId of createdRecords.patientIds.splice(0)) {
            await Patient.destroy({ where: { id: patientId } });
        }
        for (const doctorId of createdRecords.doctorIds.splice(0)) {
            await Doctor.destroy({ where: { id: doctorId } });
        }
        for (const userId of createdRecords.userIds.splice(0)) {
            await User.destroy({ where: { id: userId } });
        }
        for (const statusId of createdRecords.statusIds.splice(0)) {
            await AppointmentStatus.destroy({ where: { id: statusId } });
        }
        for (const specialtyId of createdRecords.specialtyIds.splice(0)) {
            await Specialities.destroy({ where: { id: specialtyId } });
        }
        await database.close();
    });

    test("returns every appointment across bounded, stable MySQL pages", async () => {
        const { appointmentIds: expectedAppointmentIds } = await createHistoryFixtures();
        const pages = [];

        for (let page = 1; page <= 3; page += 1) {
            pages.push(
                await getPatientAppointmentList(
                    patientUser.id,
                    { page: String(page), pageSize: String(PAGE_SIZE) },
                    new Date(),
                ),
            );
        }

        const pageIds = pages.flatMap((result) => result.appointments.map(({ id }) => id));
        expect(pages.map(({ appointments }) => appointments.length)).toEqual([50, 50, 20]);
        expect(pages.map(({ pagination }) => pagination.total)).toEqual([120, 120, 120]);
        expect(new Set(pageIds).size).toBe(FIXTURE_RECORD_COUNT);
        expect(pageIds).toEqual(expectedAppointmentIds);
    });

    test("returns every completed consultation across bounded, newest-first MySQL pages", async () => {
        const { consultationIds: expectedConsultationIds } = await createHistoryFixtures();
        const pages = [];

        for (let page = 1; page <= 3; page += 1) {
            pages.push(
                await getPatientClinicalHistory(patientUser.id, {
                    page: String(page),
                    pageSize: String(PAGE_SIZE),
                }),
            );
        }

        const pageIds = pages.flatMap((result) => result.consultations.map(({ id }) => id));
        expect(pages.map(({ consultations }) => consultations.length)).toEqual([50, 50, 20]);
        expect(pages.map(({ pagination }) => pagination.total)).toEqual([120, 120, 120]);
        expect(new Set(pageIds).size).toBe(FIXTURE_RECORD_COUNT);
        expect(pageIds).toEqual(expectedConsultationIds);
    });

    async function createUser(roleId, emailPrefix) {
        const user = await User.create({
            role_id: roleId,
            email: `${emailPrefix}@example.test`,
            password_hash: "integration-test-hash-not-for-authentication",
            is_active: true,
        });
        createdRecords.userIds.push(user.id);
        return user;
    }

    async function findOrCreateAttendedStatus() {
        const existingStatus = await AppointmentStatus.findOne({ where: { name: "Attended" } });
        if (existingStatus) return existingStatus;

        const status = await AppointmentStatus.create({
            name: "Attended",
            description: "Synthetic status for patient history integration tests.",
        });
        createdRecords.statusIds.push(status.id);
        return status;
    }

    async function createHistoryFixtures() {
        const now = Date.now();
        const appointments = await Appointment.bulkCreate(
            Array.from({ length: FIXTURE_RECORD_COUNT }, (_, index) => {
                const startAt = new Date(now - (index + 1) * 60 * 1000);
                return {
                    patient_id: patient.id,
                    doctor_id: doctor.id,
                    specialty_id: specialty.id,
                    status_id: attendedStatus.id,
                    start_at: startAt,
                    end_at: new Date(startAt.getTime() + 30 * 60 * 1000),
                    reason: null,
                    source: "Web",
                };
            }),
        );
        createdRecords.appointmentIds.push(...appointments.map(({ id }) => id));

        const consultations = await Consultation.bulkCreate(
            appointments.map((appointment) => ({
                appointment_id: appointment.id,
                doctor_id: doctor.id,
                started_at: appointment.start_at,
                ended_at: appointment.end_at,
                status: "Completed",
            })),
        );
        createdRecords.consultationIds.push(...consultations.map(({ id }) => id));

        return {
            appointmentIds: appointments.map(({ id }) => id),
            consultationIds: consultations.map(({ id }) => id),
        };
    }

    async function removeAppointmentFixtures() {
        const fixtureAppointments = patient
            ? await Appointment.findAll({
                  where: { patient_id: patient.id },
                  attributes: ["id"],
                  raw: true,
              })
            : [];
        const appointmentIds = [
            ...new Set([
                ...createdRecords.appointmentIds.splice(0),
                ...fixtureAppointments.map(({ id }) => id),
            ]),
        ];

        if (!appointmentIds.length) return;

        await Consultation.destroy({ where: { appointment_id: appointmentIds } });
        await AppointmentHistory.destroy({ where: { appointment_id: appointmentIds } });
        await Appointment.destroy({ where: { id: appointmentIds } });
        createdRecords.consultationIds.length = 0;
    }
});
