import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const gte = Symbol("gte");
const mockModels = {
    Patient: { findByPk: jest.fn(), findAll: jest.fn() },
    User: {},
    WhatsAppVerification: { destroy: jest.fn(), findOne: jest.fn(), create: jest.fn() },
    WhatsAppChatbotRuntimeSetting: { findByPk: jest.fn() },
    ChatbotFlowVersion: {},
    Notification: { findOne: jest.fn(), update: jest.fn() },
};
const mockConversation = { findOne: jest.fn(), create: jest.fn(), update: jest.fn() };
const mockMessage = { create: jest.fn(), findOne: jest.fn(), update: jest.fn() };
const mockTransaction = {
    LOCK: { UPDATE: "UPDATE" },
    commit: jest.fn(),
    rollback: jest.fn(),
};
const mockDatabase = { transaction: jest.fn() };
const mockAppointmentService = {
    bookAppointment: jest.fn(),
    cancelPatientAppointment: jest.fn(),
    getAvailableDoctors: jest.fn(),
    getAvailableAppointmentDates: jest.fn(),
    getAvailableSpecialties: jest.fn(),
    getAvailableTimeSlots: jest.fn(),
    getPatientAppointmentsForWhatsApp: jest.fn(),
    getReschedulableAppointments: jest.fn(),
    reschedulePatientAppointment: jest.fn(),
    getUpcomingConfirmedAppointmentsForWhatsApp: jest.fn(),
};
const mockSendEmail = { sendWhatsAppIdentityCode: jest.fn() };
const mockSendWhatsApp = { sendWhatsAppReply: jest.fn() };

jest.unstable_mockModule("sequelize", () => ({ Op: { gt: gte, gte, ne: Symbol("ne") } }));
jest.unstable_mockModule("../../config/database.js", () => ({ default: mockDatabase }));
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

function createChoiceValues(count, prefix = "Option") {
    return Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        name: `${prefix} ${index + 1}`,
    }));
}

function normalizeSpanishText(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function requestBookingSpecialtyList(count) {
    const conversation = createConversation({
        step: "menu",
        menuOptions: [{ label: "Book appointment", nextStepId: "booking" }],
    });
    mockConversation.findOne.mockResolvedValue(conversation);
    mockModels.Patient.findByPk.mockResolvedValue({ user: { id: 42 } });
    mockAppointmentService.getAvailableSpecialties.mockResolvedValue(
        createChoiceValues(count, "Specialty"),
    );

    await processMetaWhatsAppWebhook(
        createWebhook({
            id: `inbound-specialties-${count}`,
            from: "573001234567",
            type: "text",
            text: { body: "menu:1" },
        }),
    );

    return { conversation, reply: mockSendWhatsApp.sendWhatsAppReply.mock.lastCall?.[0] };
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
        mockTransaction.commit.mockResolvedValue(undefined);
        mockTransaction.rollback.mockResolvedValue(undefined);
        mockDatabase.transaction.mockResolvedValue(mockTransaction);
        mockMessage.update.mockResolvedValue([1]);
        mockModels.Notification.update.mockResolvedValue([1]);
        mockMessage.create.mockResolvedValue({ id: 11 });
        mockAppointmentService.getAvailableAppointmentDates.mockResolvedValue([]);
        mockMessage.findOne.mockResolvedValue({
            delivery_status: null,
            delivery_status_at: null,
            update: jest.fn().mockResolvedValue(undefined),
        });
        mockModels.Notification.findOne.mockResolvedValue({
            provider_delivery_status: null,
            provider_delivery_status_at: null,
            update: jest.fn().mockResolvedValue(undefined),
        });
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

    test("shows only real available dates after the patient selects a booking doctor", async () => {
        const conversation = createConversation({
            step: "booking_doctor",
            intent: "book",
            specialtyId: 4,
            choices: [{ id: 9 }],
            labels: ["Dr. Carlos Ramírez"],
            page: 0,
            pageSize: 10,
        });
        mockConversation.findOne.mockResolvedValue(conversation);
        mockModels.Patient.findByPk.mockResolvedValue({ user: { id: 42 } });
        mockAppointmentService.getAvailableAppointmentDates.mockResolvedValue([
            { date: "2026-11-25", times: ["09:00"] },
            { date: "2026-11-27", times: ["10:00"] },
        ]);

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-booking-doctor-date-list",
                from: "573001234567",
                type: "text",
                text: { body: "1" },
            }),
        );

        expect(mockAppointmentService.getAvailableAppointmentDates).toHaveBeenCalledWith(
            9,
            42,
            expect.objectContaining({ purpose: "booking", dayCount: 15 }),
        );
        expect(conversation.chatbot_state).toEqual(
            expect.objectContaining({
                step: "booking_date",
                dateWindowDays: 15,
                choices: ["2026-11-25", "2026-11-27", { showMoreDates: true }],
            }),
        );
        const reply = mockSendWhatsApp.sendWhatsAppReply.mock.lastCall[0];
        expect(reply.text).toContain("Selecciona una fecha con horarios disponibles");
        expect(reply.text).not.toContain("AAAA-MM-DD");
        expect(reply.options.at(-1).title).toBe("Ver más fechas");
        expect(reply.options[0].title).toContain("2026");
    });

    test("excludes the selected appointment when listing reschedule dates", async () => {
        const conversation = createConversation({
            step: "reschedule_appointment",
            intent: "reschedule",
            choices: [{ id: 55, doctorId: 9, specialtyId: 4 }],
            labels: ["Cita del 1 nov."],
            page: 0,
            pageSize: 10,
        });
        mockConversation.findOne.mockResolvedValue(conversation);
        mockModels.Patient.findByPk.mockResolvedValue({ user: { id: 42 } });
        mockAppointmentService.getAvailableAppointmentDates.mockResolvedValue([
            { date: "2026-11-25", times: ["09:00"] },
        ]);

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-reschedule-appointment-date-list",
                from: "573001234567",
                type: "text",
                text: { body: "1" },
            }),
        );

        expect(mockAppointmentService.getAvailableAppointmentDates).toHaveBeenCalledWith(
            9,
            42,
            expect.objectContaining({
                purpose: "reschedule",
                dayCount: 15,
                excludeAppointmentId: 55,
            }),
        );
        expect(conversation.chatbot_state).toEqual(
            expect.objectContaining({ step: "reschedule_date", appointmentId: 55 }),
        );
    });

    test("loads times only for a date selected from the current WhatsApp list", async () => {
        const conversation = createConversation({
            step: "booking_date",
            intent: "book",
            specialtyId: 4,
            doctorId: 9,
            dateWindowStart: "2026-11-24",
            dateWindowDays: 15,
            choices: ["2026-11-25", { showMoreDates: true }],
            labels: ["mié., 25 nov.", "Ver más fechas"],
            page: 0,
            pageSize: 10,
        });
        mockConversation.findOne.mockResolvedValue(conversation);
        mockModels.Patient.findByPk.mockResolvedValue({ user: { id: 42 } });
        mockAppointmentService.getAvailableTimeSlots.mockResolvedValue(["09:00", "09:30"]);

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-booking-date-choice",
                from: "573001234567",
                type: "text",
                text: { body: "1" },
            }),
        );

        expect(mockAppointmentService.getAvailableTimeSlots).toHaveBeenCalledWith(
            9,
            "2026-11-25",
            42,
            { purpose: "booking" },
        );
        expect(conversation.chatbot_state).toEqual(
            expect.objectContaining({ step: "booking_time", date: "2026-11-25" }),
        );
    });

    test("refreshes date choices when the selected date no longer has available times", async () => {
        const conversation = createConversation({
            step: "booking_date",
            intent: "book",
            specialtyId: 4,
            doctorId: 9,
            dateWindowStart: "2026-11-24",
            dateWindowDays: 15,
            choices: ["2026-11-25", { showMoreDates: true }],
            labels: ["mié., 25 nov.", "Ver más fechas"],
            page: 0,
            pageSize: 10,
        });
        mockConversation.findOne.mockResolvedValue(conversation);
        mockModels.Patient.findByPk.mockResolvedValue({ user: { id: 42 } });
        mockAppointmentService.getAvailableTimeSlots.mockResolvedValue([]);
        mockAppointmentService.getAvailableAppointmentDates.mockResolvedValue([
            { date: "2026-11-26", times: ["10:00"] },
        ]);

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-booking-stale-date",
                from: "573001234567",
                type: "text",
                text: { body: "1" },
            }),
        );

        expect(mockAppointmentService.getAvailableTimeSlots).toHaveBeenCalledWith(
            9,
            "2026-11-25",
            42,
            { purpose: "booking" },
        );
        expect(mockAppointmentService.getAvailableAppointmentDates).toHaveBeenCalledWith(
            9,
            42,
            expect.objectContaining({ purpose: "booking", startDate: "2026-11-24" }),
        );
        expect(conversation.chatbot_state).toEqual(
            expect.objectContaining({
                step: "booking_date",
                choices: ["2026-11-26", { showMoreDates: true }],
            }),
        );
        expect(mockSendWhatsApp.sendWhatsAppReply.mock.lastCall[0].text).toContain(
            "Ese día acaba de ocuparse",
        );
    });

    test("rejects typed dates that were not offered in the current list", async () => {
        const conversation = createConversation({
            step: "booking_date",
            intent: "book",
            specialtyId: 4,
            doctorId: 9,
            choices: ["2026-11-25", { showMoreDates: true }],
            labels: ["mié., 25 nov.", "Ver más fechas"],
            page: 0,
            pageSize: 10,
        });
        mockConversation.findOne.mockResolvedValue(conversation);
        mockModels.Patient.findByPk.mockResolvedValue({ user: { id: 42 } });

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-booking-typed-date",
                from: "573001234567",
                type: "text",
                text: { body: "2026-11-26" },
            }),
        );

        expect(mockAppointmentService.getAvailableTimeSlots).not.toHaveBeenCalled();
        expect(mockSendWhatsApp.sendWhatsAppReply.mock.lastCall[0].text).toContain(
            "Elige una de las fechas disponibles",
        );
    });

    test("offers the next real date window when the patient requests more dates", async () => {
        const conversation = createConversation({
            step: "booking_date",
            intent: "book",
            specialtyId: 4,
            doctorId: 9,
            dateWindowStart: "2026-11-24",
            dateWindowDays: 15,
            choices: ["2026-11-25", { showMoreDates: true }],
            labels: ["mié., 25 nov.", "Ver más fechas"],
            page: 0,
            pageSize: 10,
        });
        mockConversation.findOne.mockResolvedValue(conversation);
        mockModels.Patient.findByPk.mockResolvedValue({ user: { id: 42 } });
        mockAppointmentService.getAvailableAppointmentDates.mockResolvedValue([]);

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-booking-more-dates",
                from: "573001234567",
                type: "text",
                text: { body: "2" },
            }),
        );

        expect(mockAppointmentService.getAvailableAppointmentDates).toHaveBeenCalledWith(
            9,
            42,
            expect.objectContaining({ purpose: "booking", startDate: "2026-12-09", dayCount: 15 }),
        );
        expect(mockSendWhatsApp.sendWhatsAppReply.mock.lastCall[0].text).toContain(
            "No encontramos horarios disponibles en este período",
        );
    });

    test("shows opening menu choices once and keeps the interactive selection", async () => {
        const conversation = createConversation(null, null);
        conversation.chatbot_state = null;
        mockConversation.findOne.mockResolvedValue(conversation);

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-opening-menu",
                from: "573001234567",
                type: "text",
                text: { body: "Hola" },
            }),
        );

        const reply = mockSendWhatsApp.sendWhatsAppReply.mock.lastCall[0];
        expect(reply.text.match(/Solicitar cita/g)).toHaveLength(1);
        expect(reply.text).toContain("Escribe *menu* para volver en cualquier momento.");
        expect(normalizeSpanishText(reply.text)).toContain(
            "Tambien puedes responder con el numero de la opcion.",
        );
        expect(reply.options).toEqual([{ id: "menu:1", title: "Solicitar cita" }]);
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

    test("consults only upcoming confirmed appointments for a verified patient", async () => {
        const conversation = createConversation({
            step: "menu",
            menuOptions: [{ label: "Consultar citas", nextStepId: "appointments" }],
        });
        mockConversation.findOne.mockResolvedValue(conversation);
        mockModels.Patient.findByPk.mockResolvedValue({ user: { id: 42 } });
        mockAppointmentService.getUpcomingConfirmedAppointmentsForWhatsApp.mockResolvedValue([
            {
                start_at: new Date("2026-12-01T14:30:00.000Z"),
                status: { name: "Confirmed" },
                specialty: { name: "Medicina General" },
            },
        ]);

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-consult-appointments",
                from: "573001234567",
                type: "text",
                text: { body: "1" },
            }),
        );

        expect(
            mockAppointmentService.getUpcomingConfirmedAppointmentsForWhatsApp,
        ).toHaveBeenCalledWith(42);
        expect(mockAppointmentService.getPatientAppointmentsForWhatsApp).not.toHaveBeenCalled();
        expect(mockSendWhatsApp.sendWhatsAppReply).toHaveBeenCalledWith(
            expect.objectContaining({
                text: expect.stringContaining("próximas citas confirmadas"),
            }),
        );
        const replyText = mockSendWhatsApp.sendWhatsAppReply.mock.lastCall[0].text;
        expect(replyText).toContain("Estado: Confirmada");
        expect(replyText).not.toContain("Confirmed");
    });

    test("explains when a verified patient has no upcoming confirmed appointments", async () => {
        const conversation = createConversation({
            step: "menu",
            menuOptions: [{ label: "Consultar citas", nextStepId: "appointments" }],
        });
        mockConversation.findOne.mockResolvedValue(conversation);
        mockModels.Patient.findByPk.mockResolvedValue({ user: { id: 42 } });
        mockAppointmentService.getUpcomingConfirmedAppointmentsForWhatsApp.mockResolvedValue([]);

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-consult-no-appointments",
                from: "573001234567",
                type: "text",
                text: { body: "1" },
            }),
        );

        expect(mockSendWhatsApp.sendWhatsAppReply).toHaveBeenCalledWith(
            expect.objectContaining({
                text: expect.stringContaining("No tienes próximas citas confirmadas."),
            }),
        );
    });

    test.each([0, 1, 9, 10, 11, 20, 21])(
        "keeps a booking list within Meta's row limit when there are %i choices",
        async (count) => {
            const { conversation, reply } = await requestBookingSpecialtyList(count);
            const sentRows = reply.options;

            expect(sentRows.length).toBeLessThanOrEqual(10);
            if (count === 0) {
                expect(reply.text).toContain("No encontramos opciones");
                return;
            }

            const hasNextPage = count > 10;
            const expectedVisibleChoices = hasNextPage ? 9 : count;
            expect(sentRows).toHaveLength(expectedVisibleChoices + Number(hasNextPage));
            expect(sentRows.at(-1)?.id).toBe(hasNextPage ? "choice:next" : `choice:${count}`);
            expect(conversation.chatbot_state.pageSize).toBe(hasNextPage ? 9 : 10);
            expect(normalizeSpanishText(reply.text).includes("mas opciones")).toBe(hasNextPage);
        },
    );

    test("keeps later rescheduling pages reachable and maps their numbers to the visible appointment", async () => {
        const appointments = createChoiceValues(20, "Appointment").map((item) => ({
            id: item.id,
            doctorId: 9,
            specialtyId: 2,
        }));
        const labels = appointments.map((item, index) => `Appointment ${index + 1}`);
        const conversation = createConversation({
            step: "reschedule_appointment",
            intent: "reschedule",
            choices: appointments,
            labels,
            page: 0,
            pageSize: 9,
        });
        mockConversation.findOne.mockResolvedValue(conversation);
        mockModels.Patient.findByPk.mockResolvedValue({ user: { id: 42 } });

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-next-page-interactive",
                from: "573001234567",
                type: "interactive",
                interactive: { list_reply: { id: "choice:next" } },
            }),
        );

        const secondPageReply = mockSendWhatsApp.sendWhatsAppReply.mock.lastCall[0];
        expect(conversation.chatbot_state.page).toBe(1);
        expect(secondPageReply.options.map((option) => option.id)).toEqual([
            "choice:10",
            "choice:11",
            "choice:12",
            "choice:13",
            "choice:14",
            "choice:15",
            "choice:16",
            "choice:17",
            "choice:18",
            "choice:next",
        ]);
        expect(secondPageReply.text).toContain("10. Appointment 10");
        expect(normalizeSpanishText(secondPageReply.text)).toContain("ver mas opciones");

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-next-page-text",
                from: "573001234567",
                type: "text",
                text: { body: "mas opciones" },
            }),
        );

        const finalPageReply = mockSendWhatsApp.sendWhatsAppReply.mock.lastCall[0];
        expect(conversation.chatbot_state.page).toBe(2);
        expect(finalPageReply.options.map((option) => option.id)).toEqual([
            "choice:19",
            "choice:20",
        ]);
        expect(finalPageReply.text).toContain("20. Appointment 20");
        expect(normalizeSpanishText(finalPageReply.text)).not.toContain("ver mas opciones");

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-final-page-choice",
                from: "573001234567",
                type: "text",
                text: { body: "20" },
            }),
        );

        expect(conversation.chatbot_state).toEqual(
            expect.objectContaining({
                step: "reschedule_date",
                intent: "reschedule",
                appointmentId: 20,
                doctorId: 9,
                specialtyId: 2,
                dateWindowDays: 15,
                choices: [{ showMoreDates: true }],
            }),
        );
    });

    test("allows a patient to reach a later booking specialty by its displayed name", async () => {
        const { conversation } = await requestBookingSpecialtyList(20);
        mockAppointmentService.getAvailableDoctors.mockResolvedValue([
            { id: 77, display_name: "Dr Example" },
        ]);

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-booking-next-page-two",
                from: "573001234567",
                type: "text",
                text: { body: "mas opciones" },
            }),
        );
        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-booking-next-page-three",
                from: "573001234567",
                type: "text",
                text: { body: "mas opciones" },
            }),
        );
        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-booking-final-choice",
                from: "573001234567",
                type: "text",
                text: { body: "Specialty 20" },
            }),
        );

        expect(mockAppointmentService.getAvailableDoctors).toHaveBeenCalledWith(20);
        expect(conversation.chatbot_state).toEqual(
            expect.objectContaining({ step: "booking_doctor", specialtyId: 20 }),
        );
    });

    test("does not accept a number for a choice hidden on the current page", async () => {
        const appointments = createChoiceValues(11, "Appointment").map((item) => ({
            id: item.id,
            doctorId: 9,
            specialtyId: 2,
        }));
        const conversation = createConversation({
            step: "reschedule_appointment",
            intent: "reschedule",
            choices: appointments,
            labels: appointments.map((item, index) => `Appointment ${index + 1}`),
            page: 0,
            pageSize: 9,
        });
        mockConversation.findOne.mockResolvedValue(conversation);
        mockModels.Patient.findByPk.mockResolvedValue({ user: { id: 42 } });

        await processMetaWhatsAppWebhook(
            createWebhook({
                id: "inbound-hidden-choice",
                from: "573001234567",
                type: "text",
                text: { body: "10" },
            }),
        );

        expect(conversation.chatbot_state.step).toBe("reschedule_appointment");
        expect(mockSendWhatsApp.sendWhatsAppReply.mock.lastCall[0].text).toContain(
            "Selecciona una cita de la lista",
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
                                    {
                                        id: "provider-message",
                                        status: "delivered",
                                        timestamp: "1793235025",
                                    },
                                    {
                                        id: "untrusted-message",
                                        status: "connected",
                                        timestamp: "1793235025",
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        });

        expect(mockMessage.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ provider_message_id: "provider-message" }),
                lock: "UPDATE",
            }),
        );
        expect(mockModels.Notification.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    channel: "WhatsApp",
                    provider_message_id: "provider-message",
                },
                lock: "UPDATE",
            }),
        );
        expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
        expect(mockModels.Notification.update).not.toHaveBeenCalled();
    });
});
