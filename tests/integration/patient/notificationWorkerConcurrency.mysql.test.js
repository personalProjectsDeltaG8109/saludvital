import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    jest,
    test,
} from "@jest/globals";

jest.unstable_mockModule(
    "../../../src/modules/patient/services/notificationDeliveryService.js",
    () => ({
        deliverNotification: jest.fn(),
    }),
);

const { default: database } = await import("../../../config/database.js");
const { Notification, Patient } = await import("../../../src/models/associations.js");
const { deliverNotification } =
    await import("../../../src/modules/patient/services/notificationDeliveryService.js");
const { processNotificationBatch } =
    await import("../../../src/modules/patient/services/notificationWorker.js");

describe("notification worker MySQL concurrency", () => {
    let patient;
    let notification;
    let previousDeliverySetting;

    beforeAll(async () => {
        if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
            throw new Error("Notification worker integration tests require saludvital_test.");
        }

        await database.authenticate();
    });

    beforeEach(async () => {
        previousDeliverySetting = process.env.NOTIFICATION_DELIVERY_ENABLED;
        process.env.NOTIFICATION_DELIVERY_ENABLED = "true";
        jest.clearAllMocks();

        const uniqueDocumentNumber = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-15);
        patient = await Patient.create({
            first_name: "Synthetic",
            last_name: "Worker Test",
            phone: "3000000000",
            date_of_birth: "1990-01-01",
            document_type: "CC",
            document_number: uniqueDocumentNumber,
            department: "Risaralda",
            municipality: "Pereira",
        });

        notification = await Notification.create({
            patient_id: patient.id,
            channel: "Email",
            recipient_address: "notification-worker-test@example.invalid",
            event_type: "appointment_confirmation",
            status: "Pending",
            scheduled_at: new Date(Date.now() - 1000),
        });
    });

    afterEach(async () => {
        if (notification) await notification.destroy();
        if (patient) await patient.destroy();

        if (previousDeliverySetting === undefined) {
            delete process.env.NOTIFICATION_DELIVERY_ENABLED;
        } else {
            process.env.NOTIFICATION_DELIVERY_ENABLED = previousDeliverySetting;
        }
    });

    afterAll(async () => {
        await database.close();
    });

    test("does not let a second worker claim a notification already being delivered", async () => {
        let signalProviderStarted;
        const providerStarted = new Promise((resolve) => {
            signalProviderStarted = resolve;
        });
        let releaseProviderCall;
        const providerResponse = new Promise((resolve) => {
            releaseProviderCall = resolve;
        });

        deliverNotification.mockImplementation(async () => {
            signalProviderStarted();
            await providerResponse;
            return { id: "synthetic-provider-reference" };
        });

        const firstWorker = processNotificationBatch(1);
        await providerStarted;

        const secondWorker = processNotificationBatch(1);
        await expect(secondWorker).resolves.toBe(0);

        releaseProviderCall();
        await expect(firstWorker).resolves.toBe(1);

        await notification.reload();
        expect(deliverNotification).toHaveBeenCalledTimes(1);
        expect(notification.status).toBe("Sent");
        expect(notification.attempt_count).toBe(1);
    });
});
