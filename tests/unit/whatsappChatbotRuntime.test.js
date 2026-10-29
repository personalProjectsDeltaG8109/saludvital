import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const gte = Symbol("gte");
const mockModels = {
    Patient: { findByPk: jest.fn(), findAll: jest.fn() },
    User: {},
    WhatsAppVerification: { destroy: jest.fn(), findOne: jest.fn(), create: jest.fn() },
    WhatsAppChatbotRuntimeSetting: { findByPk: jest.fn() },
    ChatbotFlowVersion: {},
    Notification: { update: jest.fn() },
};
const mockConversation = { findOne: jest.fn(), create: jest.fn(), update: jest.fn() };
const mockMessage = { create: jest.fn(), update: jest.fn() };
const mockAppointmentService = {
    bookAppointment: jest.fn(),
    cancelPatientAppointment: jest.fn(),
    getAvailableDoctors: jest.fn(),
    getAvailableSpecialties: jest.fn(),
    getAvailableTimeSlots: jest.fn(),
    getPatientAppointmentsForWhatsApp: jest.fn(),
    getReschedulableAppointments: jest.fn(),
    reschedulePatientAppointment: jest.fn(),
};
const mockSendEmail = { sendWhatsAppIdentityCode: jest.fn() };
const mockSendWhatsApp = { sendWhatsAppReply: jest.fn() };

jest.unstable_mockModule("sequelize", () => ({ Op: { gt: gte, gte, ne: Symbol("ne") } }));
jest.unstable_mockModule("../../config/database.js", () => ({ default: {} }));
jest.unstable_mockModule("../../src/models/associations.js", () => mockModels);
jest.unstable_mockModule("../../src/models/WhatsAppConversation.js", () => ({
    default: mockConversation,
}));
jest.unstable_mockModule("../../src/models/WhatsAppMessage.js", () => ({ default: mockMessage }));
jest.unstable_mockModule(
    "../../src/modules/patient/services/appointmentService.js",
    () => mockAppointmentService,
);
jest.unstable_mockModule(
    "../../src/modules/patient/services/resendEmailService.js",
    () => mockSendEmail,
);
jest.unstable_mockModule(
    "../../src/modules/patient/services/whatsappService.js",
    () => mockSendWhatsApp,
);

const { processMetaWhatsAppWebhook } =
    await import("../../src/modules/patient/services/whatsappWebhookService.js");

function createConversation(state, patientId = 12) {
    const conversation = {
        id: 5,
        patient_id: patientId,
        provider_name: "Meta WhatsApp Cloud API",
        provider_account_id: "phone-number",
        wa_contact_id: "573001234567",
        chatbot_state: state,
        identity_verified_until: new Date(Date.now() + 60_000),
        status: "Active",
        update: jest.fn(async (values) => Object.assign(conversation, values)),
    };
    return conversation;
}

function createWebhook(message) {
    return {
        entry: [
            {
                changes: [
                    {
                        field: "messages",
                        value: {
                            metadata: { phone_number_id: "phone-number" },
                            messages: [message],
                        },
                    },
                ],
            },
        ],
    };
}

describe("WhatsApp chatbot appointment safeguards", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.META_WHATSAPP_PHONE_NUMBER_ID = "phone-number";
        process.env.META_WHATSAPP_ACCESS_TOKEN = "test-token";
        process.env.META_WHATSAPP_API_VERSION = "v99.0";
        process.env.NODE_ENV = "test";
        process.env.WHATSAPP_CHATBOT_ENABLED = "true";
        mockSendWhatsApp.sendWhatsAppReply.mockResolvedValue({
            id: "outbound-id",
            status: "accepted",
        });
        mockMessage.update.mockResolvedValue([1]);
        mockMessage.create.mockResolvedValue({ id: 11 });
        mockModels.Patient.findAll.mockResolvedValue([]);
        mockModels.WhatsAppChatbotRuntimeSetting.findByPk.mockResolvedValue({
            activeFlowVersion: {
                id: 8,
                status: "Published",
                definition: {
                    steps: [
                        {
                            id: "menu",
                            type: "question",
                            text: "Elige una opción.",
                            options: [{ label: "Solicitar cita", nextStepId: "booking" }],
                        },
                    ],
                },
            },
        });
    });

    test("requires a verified identity before showing patient-specific appointment actions", async () => {
        const conversation = createConversation(null, null);
        conversation.chatbot_state = {
            step: "menu",
            menuOptions: [{ label: "Solicitar cita", nextStepId: "booking" }],
        };
        conversation.identity_verified_until = null;
        mockConversation.findOne.mockResolvedValue(conversation);

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-identity",
                from: "573001234567",
                type: "text",
                text: { body: "menu:1" },
            }),
        );

        expect(conversation.chatbot_state).toEqual({ step: "identity_document", intent: "book" });
        expect(mockAppointmentService.bookAppointment).not.toHaveBeenCalled();
        expect(mockSendWhatsApp.sendWhatsAppReply).toHaveBeenCalledWith(
            expect.objectContaining({ text: expect.stringContaining("número de documento") }),
        );
    });

    test("redacts numeric identity input before persisting the inbound message", async () => {
        const conversation = createConversation(
            { step: "identity_document", intent: "book" },
            null,
        );
        conversation.identity_verified_until = null;
        mockConversation.findOne.mockResolvedValue(conversation);

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-document",
                from: "573001234567",
                type: "text",
                text: { body: "12345-67890" },
            }),
        );

        expect(mockMessage.create.mock.calls[0][0]).toEqual(
            expect.objectContaining({ content: "[Dato de verificación omitido]" }),
        );
    });

    test("rate limits identity-code requests per WhatsApp conversation", async () => {
        const conversation = createConversation(
            { step: "identity_document", intent: "book" },
            null,
        );
        conversation.identity_verified_until = null;
        conversation.identity_code_sent_at = new Date(Date.now() - 30_000);
        mockConversation.findOne.mockResolvedValue(conversation);

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-document-repeat",
                from: "573001234567",
                type: "text",
                text: { body: "98765" },
            }),
        );

        expect(mockModels.Patient.findAll).not.toHaveBeenCalled();
        expect(mockSendEmail.sendWhatsAppIdentityCode).not.toHaveBeenCalled();
        expect(mockSendWhatsApp.sendWhatsAppReply).toHaveBeenCalledWith(
            expect.objectContaining({ text: expect.stringContaining("Ya enviamos un código") }),
        );
    });

    test("continues a verified booking confirmation once and ignores a duplicate provider message", async () => {
        const conversation = createConversation({
            step: "confirm_booking",
            intent: "book",
            specialtyId: 2,
            doctorId: 9,
            date: "2026-12-01",
            pendingTime: "09:30",
        });
        mockConversation.findOne.mockResolvedValue(conversation);
        mockModels.Patient.findByPk.mockResolvedValue({ user: { id: 42 } });
        mockAppointmentService.bookAppointment.mockResolvedValue({
            start_at: new Date("2026-12-01T14:30:00.000Z"),
        });
        mockMessage.create.mockImplementation(async (record) => {
            if (record.provider_message_id === "inbound-booking") {
                if (
                    mockMessage.create.mock.calls.filter(
                        ([item]) => item.provider_message_id === "inbound-booking",
                    ).length > 1
                ) {
                    const error = new Error("duplicate");
                    error.name = "SequelizeUniqueConstraintError";
                    throw error;
                }
            }
            return { id: 11 };
        });

        const message = {
            id: "inbound-booking",
            from: "573001234567",
            type: "text",
            text: { body: "1" },
        };
        await processMetaWhatsAppWebhook(createWebhook(message));
        await processMetaWhatsAppWebhook(createWebhook(message));

        expect(mockAppointmentService.bookAppointment).toHaveBeenCalledTimes(1);
        expect(mockAppointmentService.bookAppointment).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 42,
                doctorId: 9,
                specialtyId: 2,
                date: "2026-12-01",
                time: "09:30",
                source: "WhatsApp",
            }),
        );
    });

    test("persists only delivery states reported by Meta", async () => {
        await processMetaWhatsAppWebhook({
            entry: [
                {
                    changes: [
                        {
                            field: "messages",
                            value: {
                                metadata: { phone_number_id: "phone-number" },
                                statuses: [
                                    { id: "provider-message", status: "delivered" },
                                    { id: "untrusted-message", status: "connected" },
                                ],
                            },
                        },
                    ],
                },
            ],
        });

        expect(mockModels.Notification.update).toHaveBeenCalledTimes(1);
        expect(mockModels.Notification.update).toHaveBeenCalledWith(
            { provider_delivery_status: "delivered" },
            {
                where: {
                    channel: "WhatsApp",
                    provider_message_id: "provider-message",
                },
            },
        );
    });
});
