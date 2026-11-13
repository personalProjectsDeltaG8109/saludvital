import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../../src/modules/patient/services/resendEmailService.js", () => ({
    sendResendEmail: jest.fn(),
}));
jest.unstable_mockModule("../../../src/modules/patient/services/smsService.js", () => ({
    sendSms: jest.fn(),
}));
jest.unstable_mockModule("../../../src/modules/patient/services/whatsappService.js", () => ({
    sendWhatsApp: jest.fn(),
}));

const { sendResendEmail } =
    await import("../../../src/modules/patient/services/resendEmailService.js");
const { sendSms } = await import("../../../src/modules/patient/services/smsService.js");
const { sendWhatsApp } = await import("../../../src/modules/patient/services/whatsappService.js");
const { deliverNotification } =
    await import("../../../src/modules/patient/services/notificationDeliveryService.js");

describe("appointment confirmation delivery", () => {
    const payload = {
        date: "5 de noviembre de 2026",
        time: "10:30 a. m.",
        doctor: "Dra. Ejemplo",
        specialty: "Medicina general",
    };

    beforeEach(() => {
        jest.clearAllMocks();
        sendSms.mockResolvedValue({ id: "sms-id", status: "accepted" });
        sendResendEmail.mockResolvedValue({ id: "email-id", status: "accepted" });
        sendWhatsApp.mockResolvedValue({ id: "wa-id", status: "accepted" });
    });

    test("sends a Spanish SMS with appointment details and no clinical reason", async () => {
        await deliverNotification({
            id: 418,
            channel: "SMS",
            recipient_address: "+573001234567",
            event_type: "appointment_confirmation",
            payload: { ...payload, reason: "Sensitive clinical reason" },
        });

        expect(sendSms).toHaveBeenCalledWith({
            to: "+573001234567",
            notificationId: 418,
            body: expect.stringContaining("Tu cita quedó confirmada"),
        });
        const message = sendSms.mock.calls[0][0].body;
        expect(message).toContain(payload.date);
        expect(message).toContain(payload.time);
        expect(message).toContain(payload.doctor);
        expect(message).toContain(payload.specialty);
        expect(message).not.toContain("Sensitive clinical reason");
    });

    test("passes the approved template values to WhatsApp in documented order", async () => {
        await deliverNotification({
            channel: "WhatsApp",
            recipient_address: "+573001234567",
            event_type: "appointment_confirmation",
            payload,
        });

        expect(sendWhatsApp).toHaveBeenCalledWith({
            to: "+573001234567",
            eventType: "appointment_confirmation",
            contentVariables: [payload.date, payload.time, payload.doctor, payload.specialty],
        });
    });

    test("uses the existing Resend event subject and Spanish message", async () => {
        await deliverNotification({
            channel: "Email",
            recipient_address: "patient@example.test",
            event_type: "appointment_confirmation",
            payload,
        });

        expect(sendResendEmail).toHaveBeenCalledWith({
            to: "patient@example.test",
            eventType: "appointment_confirmation",
            body: expect.stringContaining("Tu cita quedó confirmada"),
        });
        expect(sendResendEmail.mock.calls[0][0].body).toContain(payload.specialty);
    });

    test("uses a stable Resend idempotency key for a persisted notification", async () => {
        await deliverNotification({
            id: 418,
            channel: "Email",
            recipient_address: "patient@example.test",
            event_type: "appointment_confirmation",
            payload,
        });

        expect(sendResendEmail).toHaveBeenCalledWith(
            expect.objectContaining({ idempotencyKey: "notification-418" }),
        );
    });
});
