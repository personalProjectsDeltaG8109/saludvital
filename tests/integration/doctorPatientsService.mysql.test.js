import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "@jest/globals";
import database from "../../config/database.js";
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
} from "../../src/models/associations.js";
import {
    getDoctorPatientDetails,
    getDoctorPatientsPage,
} from "../../src/modules/doctor/services/doctorPatientsService.js";

if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
    throw new Error(
        "Doctor patient integration tests require NODE_ENV=test and DB_NAME=saludvital_test.",
    );
}

describe("Doctor patient detail retrieval with MySQL", () => {
    const records = {
        userIds: [],
        doctorIds: [],
        patientIds: [],
        appointmentIds: [],
        consultationIds: [],
        statusIds: [],
        specialtyIds: [],
    };
    let doctorRole;
    let patientRole;
    let specialty;
    let attendedStatus;

    beforeAll(async () => {
        await database.authenticate();
        [doctorRole, patientRole] = await Promise.all([
            Rol.findOne({ where: { name: "Doctor" } }),
            Rol.findOne({ where: { name: "Patient" } }),
        ]);
        if (!doctorRole || !patientRole)
            throw new Error("Required roles are missing in saludvital_test.");

        specialty = await Specialities.findOne({ where: { is_active: true }, attributes: ["id"] });
        if (!specialty) {
            specialty = await Specialities.create({
                name: `Patient detail ${randomUUID()}`,
                description: "Test-only specialty for doctor patient history coverage.",
                is_active: true,
            });
            records.specialtyIds.push(specialty.id);
        }
        attendedStatus = await AppointmentStatus.findOne({ where: { name: "Attended" } });
        if (!attendedStatus) {
            attendedStatus = await AppointmentStatus.create({
                name: "Attended",
                description: "Test-only status for doctor patient history coverage.",
            });
            records.statusIds.push(attendedStatus.id);
        }
    });

    afterEach(async () => {
        if (records.consultationIds.length) {
            await Consultation.destroy({ where: { id: records.consultationIds.splice(0) } });
        }
        for (const appointmentId of records.appointmentIds.splice(0)) {
            await AppointmentHistory.destroy({ where: { appointment_id: appointmentId } });
            await Appointment.destroy({ where: { id: appointmentId } });
        }
        for (const patientId of records.patientIds.splice(0)) {
            await Patient.destroy({ where: { id: patientId } });
        }
        for (const doctorId of records.doctorIds.splice(0)) {
            await Doctor.destroy({ where: { id: doctorId } });
        }
        if (records.userIds.length)
            await User.destroy({ where: { id: records.userIds.splice(0) } });
    });

    afterAll(async () => {
        if (records.statusIds.length)
            await AppointmentStatus.destroy({ where: { id: records.statusIds } });
        if (records.specialtyIds.length)
            await Specialities.destroy({ where: { id: records.specialtyIds } });
        await database.close();
    });

    async function createFixture() {
        const suffix = randomUUID().replaceAll("-", "");
        const doctorUser = await User.create({
            role_id: doctorRole.id,
            email: `doctor-patients-${suffix}@example.test`,
            password_hash: "integration-test-hash-not-for-authentication",
            is_active: true,
        });
        records.userIds.push(doctorUser.id);
        const doctor = await Doctor.create({ user_id: doctorUser.id, specialty_id: specialty.id });
        records.doctorIds.push(doctor.id);

        const patientUser = await User.create({
            role_id: patientRole.id,
            email: `patient-history-${suffix}@example.test`,
            password_hash: "integration-test-hash-not-for-authentication",
            is_active: true,
        });
        records.userIds.push(patientUser.id);
        const patient = await Patient.create({
            user_id: patientUser.id,
            first_name: "History",
            last_name: "Patient",
            phone: "3000000000",
            date_of_birth: "1990-01-01",
            document_type: "CC",
            document_number: suffix.slice(0, 15),
            department: "Risaralda",
            municipality: "Pereira",
        });
        records.patientIds.push(patient.id);
        return { doctorUser, doctor, patient };
    }

    test("returns bounded, stable appointment and history pages for the assigned doctor", async () => {
        const { doctorUser, doctor, patient } = await createFixture();
        const firstStart = new Date("2025-01-01T12:00:00.000Z");
        for (let index = 0; index < 12; index += 1) {
            const startAt = new Date(firstStart.getTime() + Math.floor(index / 2) * 60_000);
            const appointment = await Appointment.create({
                patient_id: patient.id,
                doctor_id: doctor.id,
                specialty_id: specialty.id,
                status_id: attendedStatus.id,
                start_at: startAt,
                end_at: new Date(startAt.getTime() + 30 * 60_000),
                reason: `Synthetic visit ${index}`,
                source: "Web",
            });
            records.appointmentIds.push(appointment.id);
            const consultation = await Consultation.create({
                appointment_id: appointment.id,
                doctor_id: doctor.id,
                started_at: startAt,
                ended_at: new Date(startAt.getTime() + 20 * 60_000),
                status: "Completed",
                symptoms: `Synthetic symptom ${index}`,
            });
            records.consultationIds.push(consultation.id);
        }

        const firstPage = await getDoctorPatientDetails(doctorUser.id, patient.id, {
            appointmentsPage: "1",
            historyPage: "1",
            limit: "10",
        });
        const secondPage = await getDoctorPatientDetails(doctorUser.id, patient.id, {
            appointmentsPage: "2",
            historyPage: "2",
            limit: "10",
        });
        const outOfRangePage = await getDoctorPatientDetails(doctorUser.id, patient.id, {
            appointmentsPage: "99",
            historyPage: "99",
            limit: "10",
        });

        expect(firstPage.appointments).toHaveLength(10);
        expect(firstPage.clinicalHistory).toHaveLength(10);
        expect(firstPage.pagination).toMatchObject({
            pageSize: 10,
            appointments: { page: 1, totalItems: 12, totalPages: 2 },
            clinicalHistory: { page: 1, totalItems: 12, totalPages: 2 },
        });
        expect(secondPage.appointments).toHaveLength(2);
        expect(secondPage.clinicalHistory).toHaveLength(2);
        expect(outOfRangePage.pagination).toMatchObject({
            appointments: { page: 2, totalPages: 2 },
            clinicalHistory: { page: 2, totalPages: 2 },
        });
        expect(outOfRangePage.appointments).toHaveLength(2);
        expect(firstPage.appointments[0].startsAt.getTime()).toBeGreaterThan(
            firstPage.appointments.at(-1).startsAt.getTime(),
        );
        expect(firstPage.appointments[0].id).toBeGreaterThan(firstPage.appointments[1].id);
        expect(firstPage.appointments.at(-1).id).not.toBe(secondPage.appointments[0].id);
        expect(firstPage.clinicalHistory[0].startedAt.getTime()).toBeGreaterThan(
            secondPage.clinicalHistory[0].startedAt.getTime(),
        );
        expect(firstPage.clinicalHistory[0]).toMatchObject({ diagnoses: [], prescriptions: [] });
    });

    test("does not return another doctor's patient or clinical history", async () => {
        const { doctorUser, patient } = await createFixture();
        await expect(getDoctorPatientDetails(doctorUser.id, patient.id)).rejects.toMatchObject({
            statusCode: 404,
        });
    });

    test("rejects invalid detail pagination and does not preload history for the directory", async () => {
        const { doctorUser, doctor, patient } = await createFixture();
        await Appointment.create({
            patient_id: patient.id,
            doctor_id: doctor.id,
            specialty_id: specialty.id,
            status_id: attendedStatus.id,
            start_at: new Date("2025-01-01T12:00:00.000Z"),
            end_at: new Date("2025-01-01T12:30:00.000Z"),
            source: "Web",
        }).then((appointment) => records.appointmentIds.push(appointment.id));

        await expect(
            getDoctorPatientDetails(doctorUser.id, patient.id, { historyPage: "0" }),
        ).rejects.toMatchObject({ statusCode: 400 });
        const page = await getDoctorPatientsPage(doctorUser.id);
        expect(page.details).toBeNull();
        expect(page.selectedPatientId).toBeNull();
    });
});
