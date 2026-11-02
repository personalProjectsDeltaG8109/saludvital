import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from "@jest/globals";
import database from "../../config/database.js";
import {
    Appointment,
    AppointmentHistory,
    AppointmentStatus,
    Consultation,
    Diagnosis,
    Doctor,
    Patient,
    Prescription,
    PrescriptionItem,
    Rol,
    Specialities,
    User,
} from "../../src/models/associations.js";
import {
    completeDoctorConsultation,
    getDoctorConsultation,
    saveDoctorConsultationDraft,
} from "../../src/modules/doctor/services/doctorConsultationService.js";

if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
    throw new Error(
        "Doctor consultation integration tests require NODE_ENV=test and DB_NAME=saludvital_test.",
    );
}

describe("Doctor consultation service with real MySQL", () => {
    const createdRecords = {
        userIds: [],
        doctorIds: [],
        patientIds: [],
        appointmentIds: [],
        statusIds: [],
        specialtyIds: [],
    };
    let doctorRole;
    let patientRole;
    let specialty;
    let inProgressStatus;
    let attendedStatus;

    beforeAll(async () => {
        await database.authenticate();
        [doctorRole, patientRole] = await Promise.all([
            Rol.findOne({ where: { name: "Doctor" } }),
            Rol.findOne({ where: { name: "Patient" } }),
        ]);
        if (!doctorRole || !patientRole) {
            throw new Error("Required roles are missing in saludvital_test.");
        }
        specialty = await Specialities.findOne({ where: { is_active: true }, attributes: ["id"] });
        if (!specialty) {
            specialty = await Specialities.create({
                name: `Consultation Test ${randomUUID()}`,
                description: "Test-only specialty for consultation integration coverage.",
                is_active: true,
            });
            createdRecords.specialtyIds.push(specialty.id);
        }
        inProgressStatus = await findOrCreateAppointmentStatus("In Progress");
        attendedStatus = await findOrCreateAppointmentStatus("Attended");
    });

    afterEach(async () => {
        for (const appointmentId of createdRecords.appointmentIds.splice(0)) {
            const consultation = await Consultation.findOne({
                where: { appointment_id: appointmentId },
                attributes: ["id"],
            });
            if (consultation) {
                const prescriptions = await Prescription.findAll({
                    where: { consultation_id: consultation.id },
                    attributes: ["id"],
                });
                const prescriptionIds = prescriptions.map(({ id }) => id);
                if (prescriptionIds.length) {
                    await PrescriptionItem.destroy({ where: { prescription_id: prescriptionIds } });
                }
                await Prescription.destroy({ where: { consultation_id: consultation.id } });
                await Diagnosis.destroy({ where: { consultation_id: consultation.id } });
                await Consultation.destroy({ where: { id: consultation.id } });
            }
            await AppointmentHistory.destroy({ where: { appointment_id: appointmentId } });
            await Appointment.destroy({ where: { id: appointmentId } });
        }
        for (const patientId of createdRecords.patientIds.splice(0)) {
            await Patient.destroy({ where: { id: patientId } });
        }
        for (const doctorId of createdRecords.doctorIds.splice(0)) {
            await Doctor.destroy({ where: { id: doctorId } });
        }
        for (const userId of createdRecords.userIds.splice(0)) {
            await User.destroy({ where: { id: userId } });
        }
    });

    afterAll(async () => {
        for (const statusId of createdRecords.statusIds) {
            await AppointmentStatus.destroy({ where: { id: statusId } });
        }
        for (const specialtyId of createdRecords.specialtyIds) {
            await Specialities.destroy({ where: { id: specialtyId } });
        }
        await database.close();
    });

    async function findOrCreateAppointmentStatus(name) {
        const existingStatus = await AppointmentStatus.findOne({ where: { name } });
        if (existingStatus) return existingStatus;
        const status = await AppointmentStatus.create({
            name,
            description: "Test-only status for doctor consultation integration coverage.",
        });
        createdRecords.statusIds.push(status.id);
        return status;
    }

    async function createConsultationFixture() {
        const suffix = randomUUID().replaceAll("-", "");
        const doctorUser = await User.create({
            role_id: doctorRole.id,
            email: `consultation-doctor-${suffix}@example.test`,
            password_hash: "integration-test-hash-not-for-authentication",
            is_active: true,
        });
        createdRecords.userIds.push(doctorUser.id);
        const doctor = await Doctor.create({
            user_id: doctorUser.id,
            specialty_id: specialty.id,
            display_name: "Integration Doctor",
        });
        createdRecords.doctorIds.push(doctor.id);

        const patientUser = await User.create({
            role_id: patientRole.id,
            email: `consultation-patient-${suffix}@example.test`,
            password_hash: "integration-test-hash-not-for-authentication",
            is_active: true,
        });
        createdRecords.userIds.push(patientUser.id);
        const patient = await Patient.create({
            user_id: patientUser.id,
            first_name: "Integration",
            last_name: "Patient",
            phone: "3000000000",
            date_of_birth: "1990-01-01",
            document_type: "CC",
            document_number: suffix.slice(0, 15),
            department: "Risaralda",
            municipality: "Pereira",
        });
        createdRecords.patientIds.push(patient.id);

        const appointment = await Appointment.create({
            patient_id: patient.id,
            doctor_id: doctor.id,
            specialty_id: specialty.id,
            status_id: inProgressStatus.id,
            start_at: new Date(Date.now() - 60 * 60 * 1000),
            end_at: new Date(Date.now() - 30 * 60 * 1000),
            source: "Web",
        });
        createdRecords.appointmentIds.push(appointment.id);
        const consultation = await Consultation.create({
            appointment_id: appointment.id,
            doctor_id: doctor.id,
            started_at: new Date(Date.now() - 30 * 60 * 1000),
            status: "InProgress",
            symptoms: "Original symptoms",
        });

        return { doctorUser, doctor, appointment, consultation };
    }

    function validDraft(overrides = {}) {
        return {
            symptoms: "Headache",
            patientFeeling: "Stable",
            clinicalNotes: "Clinical evaluation",
            recommendations: "Rest",
            medicalOrders: ["Follow-up"],
            vitalSigns: {
                bloodPressure: "120/80",
                heartRate: 72,
                temperature: 36.8,
                weight: 70,
                height: 1.7,
            },
            diagnoses: [{ diagnosis: "Headache", notes: "Mild" }],
            prescriptionItems: [
                {
                    medicationName: "Example medication",
                    dosage: "1 tablet",
                    frequency: "Daily",
                    duration: "5 days",
                    instructions: "After meals",
                },
            ],
            ...overrides,
        };
    }

    test("denies consultation retrieval and writes by a different doctor", async () => {
        const { consultation } = await createConsultationFixture();
        const otherUser = await User.create({
            role_id: doctorRole.id,
            email: `other-doctor-${randomUUID()}@example.test`,
            password_hash: "integration-test-hash-not-for-authentication",
            is_active: true,
        });
        createdRecords.userIds.push(otherUser.id);
        const otherDoctor = await Doctor.create({
            user_id: otherUser.id,
            specialty_id: specialty.id,
            display_name: "Other Integration Doctor",
        });
        createdRecords.doctorIds.push(otherDoctor.id);

        await expect(getDoctorConsultation(otherUser.id, consultation.id)).rejects.toMatchObject({
            statusCode: 404,
        });
        await expect(
            saveDoctorConsultationDraft(otherUser.id, consultation.id, validDraft()),
        ).rejects.toMatchObject({ statusCode: 404 });
        await expect(
            completeDoctorConsultation(otherUser.id, consultation.id, validDraft()),
        ).rejects.toMatchObject({ statusCode: 404 });
        await expect(consultation.reload()).resolves.toMatchObject({
            status: "InProgress",
            symptoms: "Original symptoms",
        });
    });

    test("persists draft fields, diagnoses, prescriptions, and items together", async () => {
        const { doctorUser, consultation } = await createConsultationFixture();

        await saveDoctorConsultationDraft(doctorUser.id, consultation.id, validDraft());

        const savedConsultation = await Consultation.findByPk(consultation.id);
        const diagnoses = await Diagnosis.findAll({ where: { consultation_id: consultation.id } });
        const prescription = await Prescription.findOne({
            where: { consultation_id: consultation.id },
        });
        const items = await PrescriptionItem.findAll({
            where: { prescription_id: prescription.id },
        });
        expect(savedConsultation).toMatchObject({ status: "InProgress", symptoms: "Headache" });
        expect(diagnoses).toHaveLength(1);
        expect(prescription).not.toBeNull();
        expect(items).toHaveLength(1);
    });

    test("rolls back consultation and diagnosis changes when a later draft write fails", async () => {
        const { doctorUser, consultation } = await createConsultationFixture();
        const bulkCreate = jest
            .spyOn(Diagnosis, "bulkCreate")
            .mockRejectedValueOnce(new Error("Simulated diagnosis persistence failure"));

        try {
            await expect(
                saveDoctorConsultationDraft(doctorUser.id, consultation.id, validDraft()),
            ).rejects.toThrow("Simulated diagnosis persistence failure");
        } finally {
            bulkCreate.mockRestore();
        }

        const savedConsultation = await Consultation.findByPk(consultation.id);
        const diagnoses = await Diagnosis.findAll({ where: { consultation_id: consultation.id } });
        expect(savedConsultation).toMatchObject({
            status: "InProgress",
            symptoms: "Original symptoms",
        });
        expect(diagnoses).toHaveLength(0);
    });

    test("allows only one of two concurrent requests to complete the consultation", async () => {
        const { doctorUser, appointment, consultation } = await createConsultationFixture();

        const results = await Promise.allSettled([
            completeDoctorConsultation(doctorUser.id, consultation.id, validDraft()),
            completeDoctorConsultation(doctorUser.id, consultation.id, validDraft()),
        ]);

        expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
        expect(
            results.filter(
                ({ status, reason }) => status === "rejected" && reason.statusCode === 409,
            ),
        ).toHaveLength(1);
        await expect(consultation.reload()).resolves.toMatchObject({ status: "Completed" });
        await expect(appointment.reload()).resolves.toMatchObject({ status_id: attendedStatus.id });
        await expect(
            AppointmentHistory.count({
                where: { appointment_id: appointment.id, event_type: "ConsultationCompleted" },
            }),
        ).resolves.toBe(1);
    });
});
