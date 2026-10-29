import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    Patient,
    User,
    WhatsAppVerification,
    WhatsAppChatbotRuntimeSetting,
    ChatbotFlowVersion,
    Notification,
} from "../../../models/associations.js";
import WhatsAppConversation from "../../../models/WhatsAppConversation.js";
import WhatsAppMessage from "../../../models/WhatsAppMessage.js";
import {
    bookAppointment,
    cancelPatientAppointment,
    getAvailableDoctors,
    getAvailableSpecialties,
    getAvailableTimeSlots,
    getPatientAppointmentsForWhatsApp,
    getReschedulableAppointments,
    reschedulePatientAppointment,
} from "./appointmentService.js";
import { sendWhatsAppIdentityCode } from "./resendEmailService.js";
import { sendWhatsAppReply } from "./whatsappService.js";

const META_PROVIDER = "Meta WhatsApp Cloud API";
const DEFAULT_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 30;
const VERIFICATION_TTL_MS = 10 * 60 * 1000;
const VERIFIED_SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const SEND_CODE_COOLDOWN_MS = 2 * 60 * 1000;
const INTENT_BY_FLOW_STEP = {
    booking: "book",
    appointments: "consult",
    reschedule: "reschedule",
    cancel: "cancel",
};

function getPhoneNumberId() {
    return process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
}

function getAccountId() {
    return getPhoneNumberId();
}

function isChatbotEnabled() {
    return (
        process.env.NODE_ENV !== "production" && process.env.WHATSAPP_CHATBOT_ENABLED !== "false"
    );
}

function retentionDays() {
    const configured = Number(
        process.env.WHATSAPP_MESSAGE_RETENTION_DAYS || DEFAULT_RETENTION_DAYS,
    );
    if (!Number.isInteger(configured) || configured < 1 || configured > MAX_RETENTION_DAYS) {
        return DEFAULT_RETENTION_DAYS;
    }
    return configured;
}

export function messageExpiryDate(referenceDate = new Date()) {
    return new Date(referenceDate.getTime() + retentionDays() * 24 * 60 * 60 * 1000);
}

function configuredString(name) {
    return process.env[name]?.trim() || "";
}

function createVerificationHash(code) {
    const secret = configuredString("WHATSAPP_VERIFICATION_SECRET");
    if (!secret) throw new Error("WhatsApp identity verification is not configured.");
    return createHmac("sha256", secret).update(String(code)).digest("hex");
}

function hashMatches(code, expectedHash) {
    const actual = Buffer.from(createVerificationHash(code), "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseInboundMessage(message) {
    if (!message || typeof message.id !== "string" || typeof message.from !== "string") {
        return null;
    }
    const interactiveId =
        message.interactive?.list_reply?.id || message.interactive?.button_reply?.id || "";
    const text = message.text?.body || interactiveId || "";
    return {
        providerMessageId: message.id,
        contactId: message.from.replace(/\D/g, "").slice(0, 32),
        type: typeof message.type === "string" ? message.type.slice(0, 40) : "unknown",
        text: typeof text === "string" ? text.trim().slice(0, 4000) : "",
        receivedAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
    };
}

function safeText(value) {
    return String(value ?? "")
        .replace(/[\r\n\t]+/g, " ")
        .trim()
        .slice(0, 200);
}

function createChoiceList(labels, values, page = 0, pageSize = 10) {
    const start = page * pageSize;
    const options = labels.slice(start, start + pageSize).map((title, index) => ({
        id: `choice:${start + index + 1}`,
        title: safeText(title).slice(0, 24) || `Opción ${start + index + 1}`,
    }));
    const hasNextPage = start + pageSize < labels.length;
    if (hasNextPage) options.push({ id: "choice:next", title: "Ver más opciones" });
    return {
        options,
        choices: values,
        page,
        pageSize,
        hasNextPage,
        labels,
    };
}

function parseChoice(text, state) {
    const match = /^(?:choice:)?(\d+)$/.exec(text.trim());
    if (match) {
        const choice = state.choices?.[Number(match[1]) - 1];
        return choice === undefined ? null : choice;
    }
    const normalizedText = text.trim().toLocaleLowerCase("es-CO");
    const matchingIndexes = (state.labels || []).flatMap((label, index) =>
        String(label).trim().toLocaleLowerCase("es-CO") === normalizedText ? [index] : [],
    );
    return matchingIndexes.length === 1 ? state.choices[matchingIndexes[0]] : null;
}

async function sendResponse(conversation, contactId, text, options = []) {
    const payloadText = options.length
        ? `${text}\n\n${options
              .filter((option) => option.id !== "choice:next")
              .map((option, index) => {
                  const optionNumber = option.id.match(/^(?:choice|menu):(\d+)$/)?.[1];
                  return `${optionNumber || index + 1}. ${option.title}`;
              })
              .join("\n")}\n\nTambién puedes responder con el número de la opción.`
        : text;
    const result = await sendWhatsAppReply({ to: `+${contactId}`, text: payloadText, options });
    const now = new Date();
    await WhatsAppMessage.create({
        conversation_id: conversation.id,
        provider_message_id: result.id,
        direction: "Outbound",
        message_type: options.length ? "interactive" : "text",
        content: payloadText,
        processing_status: "Processed",
        delivery_status: result.status,
        received_at: null,
        processed_at: now,
        content_expires_at: messageExpiryDate(now),
        created_at: now,
        provider_name: META_PROVIDER,
        provider_account_id: getAccountId(),
    });
    await conversation.update({ last_activity_at: now });
}

async function loadPublishedFlowMenu() {
    const runtimeSettings = await WhatsAppChatbotRuntimeSetting.findByPk(1, {
        include: [
            {
                model: ChatbotFlowVersion,
                as: "activeFlowVersion",
                attributes: ["id", "status", "definition"],
            },
        ],
    });
    const version = runtimeSettings?.activeFlowVersion;
    if (!version || version.status !== "Published") return null;
    const steps = version.definition?.steps;
    if (!Array.isArray(steps)) return null;
    const menuStep = steps.find((step) => step.id === "menu" && step.type === "question");
    if (!menuStep || !Array.isArray(menuStep.options)) return null;
    return { version, menuStep };
}

async function showMainMenu(conversation, contactId, greeting = "") {
    const activeFlow = await loadPublishedFlowMenu();
    if (!activeFlow) {
        await sendResponse(
            conversation,
            contactId,
            "El asistente no tiene un flujo publicado disponible. Inténtalo más tarde.",
        );
        return;
    }
    const menuOptions = activeFlow.menuStep.options.slice(0, 10);
    await conversation.update({
        chatbot_flow_version_id: activeFlow.version.id,
        chatbot_state: { step: "menu", menuOptions },
    });
    const numberedOptions = menuOptions
        .map((option, index) => `${index + 1}. ${option.label}`)
        .join("\n");
    await sendResponse(
        conversation,
        contactId,
        `${greeting ? `${greeting}\n\n` : ""}${activeFlow.menuStep.text}\n${numberedOptions}\n\nEscribe *menu* para volver en cualquier momento.`,
        menuOptions.map((option, index) => ({ id: `menu:${index + 1}`, title: option.label })),
    );
}

async function findPatientForVerification(documentNumber) {
    const normalized = documentNumber.replace(/\D/g, "");
    if (normalized.length < 5 || normalized.length > 15) return null;
    const matches = await Patient.findAll({
        where: { document_number: normalized },
        include: [
            {
                model: User,
                as: "user",
                required: true,
                where: { is_active: true },
                attributes: ["id", "email", "email_verified_at"],
            },
        ],
        limit: 2,
    });
    if (matches.length !== 1 || !matches[0].user?.email_verified_at) return null;
    return matches[0];
}

async function issueVerificationCode(patient) {
    const cutoff = new Date(Date.now() - SEND_CODE_COOLDOWN_MS);
    const recentCode = await WhatsAppVerification.findOne({
        where: {
            patient_id: patient.id,
            created_at: { [Op.gte]: cutoff },
            invalidated_at: null,
        },
        order: [["created_at", "DESC"]],
    });
    if (recentCode) return false;

    const code = String(randomInt(100000, 1000000));
    const verification = await WhatsAppVerification.create({
        patient_id: patient.id,
        code_hash: createVerificationHash(code),
        expires_at: new Date(Date.now() + VERIFICATION_TTL_MS),
        attempt_count: 0,
        verified_at: null,
        invalidated_at: null,
        created_at: new Date(),
    });
    try {
        await sendWhatsAppIdentityCode({ to: patient.user.email, code });
    } catch (error) {
        await verification.update({ invalidated_at: new Date() });
        throw error;
    }
    return true;
}

async function verifyCode(conversation, code) {
    const patientId = conversation.chatbot_state?.verificationPatientId;
    if (!patientId || !/^\d{6}$/.test(code)) return null;
    const verification = await WhatsAppVerification.findOne({
        where: {
            patient_id: patientId,
            verified_at: null,
            invalidated_at: null,
            expires_at: { [Op.gt]: new Date() },
        },
        order: [["created_at", "DESC"]],
    });
    if (!verification || verification.attempt_count >= MAX_CODE_ATTEMPTS) return null;
    if (!hashMatches(code, verification.code_hash)) {
        const attemptCount = verification.attempt_count + 1;
        await verification.update({
            attempt_count: attemptCount,
            ...(attemptCount >= MAX_CODE_ATTEMPTS ? { invalidated_at: new Date() } : {}),
        });
        return null;
    }
    const now = new Date();
    await verification.update({ verified_at: now, invalidated_at: now });
    return Patient.findByPk(patientId, {
        include: [
            {
                model: User,
                as: "user",
                required: true,
                where: { is_active: true, email_verified_at: { [Op.ne]: null } },
                attributes: ["id"],
            },
        ],
    });
}

async function requireVerifiedPatient(conversation, contactId, intent) {
    if (
        conversation.patient_id &&
        conversation.identity_verified_until &&
        new Date(conversation.identity_verified_until) > new Date()
    ) {
        return continueIntent(conversation, contactId, intent);
    }
    await conversation.update({
        chatbot_state: { step: "identity_document", intent },
        identity_verified_until: null,
    });
    await sendResponse(
        conversation,
        contactId,
        "Para proteger tu información, escribe tu número de documento. Después enviaremos un código al correo verificado de tu cuenta.",
    );
}

async function showPagedChoices(conversation, contactId, text, labels, values, step, state = {}) {
    if (!values.length) {
        await showMainMenu(
            conversation,
            contactId,
            "No encontramos opciones disponibles en este momento.",
        );
        return;
    }
    const page = 0;
    const list = createChoiceList(labels, values, page);
    await conversation.update({
        chatbot_state: {
            ...state,
            step,
            choices: list.choices,
            labels: list.labels,
            page,
            pageSize: list.pageSize,
        },
    });
    await sendResponse(conversation, contactId, text, list.options);
}

async function continueIntent(conversation, contactId, intent) {
    const patient = await Patient.findByPk(conversation.patient_id, {
        include: [
            {
                model: User,
                as: "user",
                required: true,
                where: { is_active: true, email_verified_at: { [Op.ne]: null } },
                attributes: ["id"],
            },
        ],
    });
    if (!patient?.user?.id) {
        await showMainMenu(
            conversation,
            contactId,
            "No pudimos validar tu cuenta. Inicia de nuevo.",
        );
        return;
    }
    const userId = patient.user.id;

    if (intent === "book") {
        const specialties = await getAvailableSpecialties();
        const items = specialties.map((item) => ({ id: Number(item.id), name: item.name }));
        return showPagedChoices(
            conversation,
            contactId,
            "Selecciona una especialidad disponible:",
            items.map((item) => item.name),
            items,
            "booking_specialty",
            { intent },
        );
    }
    if (intent === "consult") {
        const appointments = await getPatientAppointmentsForWhatsApp(userId);
        if (!appointments.length) {
            return showMainMenu(conversation, contactId, "No tienes citas registradas.");
        }
        const summary = appointments
            .map((item) => {
                const date = new Intl.DateTimeFormat("es-CO", {
                    dateStyle: "medium",
                    timeZone: "America/Bogota",
                }).format(new Date(item.start_at));
                const time = new Intl.DateTimeFormat("es-CO", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "America/Bogota",
                }).format(new Date(item.start_at));
                return `• ${date}, ${time} — ${item.specialty.name} — ${item.status.name}`;
            })
            .join("\n");
        await showMainMenu(
            conversation,
            contactId,
            `Estas son tus citas más recientes:\n${summary}`,
        );
        return;
    }
    if (intent === "reschedule") {
        const appointments = await getReschedulableAppointments(userId);
        const items = appointments.map((item) => ({
            id: Number(item.id),
            doctorId: Number(item.doctor_id),
            specialtyId: Number(item.specialty_id),
            label: `${item.specialty.name} — ${new Intl.DateTimeFormat("es-CO", {
                dateStyle: "medium",
                timeZone: "America/Bogota",
            }).format(new Date(item.start_at))}`,
        }));
        return showPagedChoices(
            conversation,
            contactId,
            "Selecciona la cita que deseas reprogramar:",
            items.map((item) => item.label),
            items,
            "reschedule_appointment",
            { intent },
        );
    }
    if (intent === "cancel") {
        const appointments = await getPatientAppointmentsForWhatsApp(userId);
        const confirmed = appointments.filter((item) => item.status.name === "Confirmed");
        const items = confirmed.map((item) => ({
            id: Number(item.id),
            label: `${item.specialty.name} — ${new Intl.DateTimeFormat("es-CO", {
                dateStyle: "medium",
                timeZone: "America/Bogota",
            }).format(new Date(item.start_at))}`,
        }));
        return showPagedChoices(
            conversation,
            contactId,
            "Selecciona la cita confirmada que deseas cancelar:",
            items.map((item) => item.label),
            items,
            "cancel_appointment",
            { intent },
        );
    }
    return showMainMenu(conversation, contactId);
}

async function handleSelection(conversation, contactId, text, userId, state) {
    if (text.toLowerCase() === "menu" || text.toLowerCase() === "menú" || text === "0") {
        await conversation.update({ chatbot_state: null });
        return showMainMenu(conversation, contactId);
    }
    if (state.step === "menu") {
        const menuValue = text.match(/^menu:(\d+)$/)?.[1] || text.trim();
        const selectedIndex = Number(menuValue) - 1;
        const menuOption =
            state.menuOptions?.[selectedIndex] ||
            state.menuOptions?.find(
                (option) =>
                    option.label.toLocaleLowerCase("es-CO") ===
                    text.trim().toLocaleLowerCase("es-CO"),
            );
        const intent = INTENT_BY_FLOW_STEP[menuOption?.nextStepId];
        if (!intent) return showMainMenu(conversation, contactId, "No reconocí esa opción.");
        return requireVerifiedPatient(conversation, contactId, intent);
    }

    if (state.step === "identity_document") {
        const previousRequestAt = new Date(conversation.identity_code_sent_at || 0).getTime();
        if (
            Number.isFinite(previousRequestAt) &&
            Date.now() - previousRequestAt < SEND_CODE_COOLDOWN_MS
        ) {
            await sendResponse(
                conversation,
                contactId,
                "Ya enviamos un código recientemente. Revisa tu correo y vuelve a intentarlo en unos minutos.",
            );
            return;
        }
        const patient = await findPatientForVerification(text);
        if (!patient) {
            await sendResponse(
                conversation,
                contactId,
                "No pudimos validar la cuenta con esos datos. Revisa el documento o contacta a un asesor.",
            );
            return;
        }
        const sent = await issueVerificationCode(patient);
        if (!sent) {
            await sendResponse(
                conversation,
                contactId,
                "Ya enviamos un código recientemente. Revisa tu correo y vuelve a intentarlo en unos minutos.",
            );
            return;
        }
        await conversation.update({
            chatbot_state: {
                step: "identity_code",
                intent: state.intent,
                verificationPatientId: patient.id,
            },
            identity_code_sent_at: new Date(),
        });
        await sendResponse(
            conversation,
            contactId,
            "Enviamos un código de 6 dígitos a tu correo verificado. Escríbelo aquí; vence en 10 minutos.",
        );
        return;
    }

    if (state.step === "identity_code") {
        const patient = await verifyCode(conversation, text.trim());
        if (!patient) {
            await sendResponse(
                conversation,
                contactId,
                "El código no es válido o venció. Revisa el mensaje o vuelve a empezar escribiendo *menu*.",
            );
            return;
        }
        await conversation.update({
            patient_id: patient.id,
            identity_verified_until: new Date(Date.now() + VERIFIED_SESSION_TTL_MS),
            chatbot_state: { step: "menu", intent: state.intent },
        });
        return continueIntent(conversation, contactId, state.intent);
    }

    const choice = parseChoice(text.replace(/^choice:/, "choice:"), state);
    if (
        ["choice:next", "ver más opciones", "mas opciones", "más opciones"].includes(
            text.toLocaleLowerCase("es-CO"),
        ) &&
        state.pageSize &&
        state.choices?.length > (state.page + 1) * state.pageSize
    ) {
        const start = (state.page + 1) * state.pageSize;
        const options = state.choices.slice(start, start + state.pageSize).map((item, index) => ({
            id: `choice:${start + index + 1}`,
            title:
                safeText(state.labels?.[start + index]).slice(0, 24) ||
                `Opción ${start + index + 1}`,
        }));
        if (start + state.pageSize < state.choices.length)
            options.push({ id: "choice:next", title: "Ver más opciones" });
        await conversation.update({ chatbot_state: { ...state, page: state.page + 1 } });
        await sendResponse(conversation, contactId, "Selecciona una opción:", options);
        return;
    }

    if (state.step === "booking_specialty") {
        if (!choice)
            return sendResponse(
                conversation,
                contactId,
                "Responde con el número de una especialidad disponible.",
            );
        const doctors = await getAvailableDoctors(choice.id);
        const items = doctors.map((doctor) => ({
            id: Number(doctor.id),
            name: doctor.display_name || "Médico",
        }));
        return showPagedChoices(
            conversation,
            contactId,
            "Selecciona un médico:",
            items.map((item) => item.name),
            items,
            "booking_doctor",
            { intent: "book", specialtyId: choice.id },
        );
    }
    if (state.step === "booking_doctor") {
        if (!choice)
            return sendResponse(
                conversation,
                contactId,
                "Responde con el número de un médico disponible.",
            );
        await conversation.update({
            chatbot_state: {
                step: "booking_date",
                intent: "book",
                specialtyId: state.specialtyId,
                doctorId: choice.id,
            },
        });
        return sendResponse(
            conversation,
            contactId,
            "Escribe la fecha que prefieres en formato AAAA-MM-DD.",
        );
    }
    if (state.step === "booking_date" || state.step === "reschedule_date") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text))
            return sendResponse(
                conversation,
                contactId,
                "Escribe una fecha válida con formato AAAA-MM-DD.",
            );
        const doctorId = state.doctorId;
        const slots = await getAvailableTimeSlots(doctorId, text, userId);
        if (!slots.length)
            return sendResponse(
                conversation,
                contactId,
                "No hay horarios disponibles para esa fecha. Prueba otra fecha en formato AAAA-MM-DD.",
            );
        const labels = slots.map((time) => time.slice(0, 5));
        return showPagedChoices(
            conversation,
            contactId,
            "Selecciona un horario disponible:",
            labels,
            labels,
            state.step === "booking_date" ? "booking_time" : "reschedule_time",
            { ...state, date: text },
        );
    }
    if (state.step === "booking_time") {
        if (!choice || !state.date)
            return sendResponse(
                conversation,
                contactId,
                "Selecciona uno de los horarios disponibles.",
            );
        await conversation.update({
            chatbot_state: { ...state, step: "confirm_booking", pendingTime: choice },
        });
        return sendResponse(
            conversation,
            contactId,
            `¿Confirmas la cita para el ${state.date} a las ${String(choice).slice(0, 5)}?`,
            [
                { id: "confirm:yes", title: "Sí, reservar" },
                { id: "confirm:no", title: "No, volver" },
            ],
        );
    }
    if (state.step === "confirm_booking") {
        if (!/^(?:confirm:yes|sí|si|1)$/i.test(text.trim()))
            return showMainMenu(conversation, contactId, "No reservamos la cita.");
        try {
            const appointment = await bookAppointment({
                userId,
                actorUserId: userId,
                actorSnapshot: `WhatsApp patient ${conversation.patient_id}`,
                source: "WhatsApp",
                specialtyId: state.specialtyId,
                doctorId: state.doctorId,
                date: state.date,
                time: String(state.pendingTime),
            });
            await showMainMenu(
                conversation,
                contactId,
                `Tu cita quedó reservada para el ${new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "America/Bogota" }).format(new Date(appointment.start_at))} a las ${String(state.pendingTime).slice(0, 5)}.`,
            );
        } catch (error) {
            await showMainMenu(
                conversation,
                contactId,
                error.message || "No pudimos reservar la cita.",
            );
        }
        return;
    }
    if (state.step === "reschedule_appointment") {
        if (!choice)
            return sendResponse(conversation, contactId, "Selecciona una cita de la lista.");
        await conversation.update({
            chatbot_state: {
                step: "reschedule_date",
                intent: "reschedule",
                appointmentId: choice.id,
                doctorId: choice.doctorId,
                specialtyId: choice.specialtyId,
            },
        });
        return sendResponse(
            conversation,
            contactId,
            "Escribe la nueva fecha en formato AAAA-MM-DD.",
        );
    }
    if (state.step === "reschedule_time") {
        if (!choice || !state.date)
            return sendResponse(
                conversation,
                contactId,
                "Selecciona uno de los horarios disponibles.",
            );
        await conversation.update({
            chatbot_state: { ...state, step: "confirm_reschedule", pendingTime: choice },
        });
        return sendResponse(
            conversation,
            contactId,
            `¿Confirmas reprogramar la cita para el ${state.date} a las ${String(choice).slice(0, 5)}?`,
            [
                { id: "confirm:yes", title: "Sí, reprogramar" },
                { id: "confirm:no", title: "No, volver" },
            ],
        );
    }
    if (state.step === "confirm_reschedule") {
        if (!/^(?:confirm:yes|sí|si|1)$/i.test(text.trim()))
            return showMainMenu(conversation, contactId, "La cita no se modificó.");
        try {
            const appointment = await reschedulePatientAppointment({
                userId,
                actorUserId: userId,
                actorSnapshot: `WhatsApp patient ${conversation.patient_id}`,
                appointmentId: state.appointmentId,
                doctorId: state.doctorId,
                specialtyId: state.specialtyId,
                date: state.date,
                time: String(state.pendingTime),
            });
            await showMainMenu(
                conversation,
                contactId,
                `Tu cita se reprogramó para el ${new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "America/Bogota" }).format(new Date(appointment.start_at))} a las ${String(state.pendingTime).slice(0, 5)}.`,
            );
        } catch (error) {
            await showMainMenu(
                conversation,
                contactId,
                error.message || "No pudimos reprogramar la cita.",
            );
        }
        return;
    }
    if (state.step === "cancel_appointment") {
        if (!choice)
            return sendResponse(
                conversation,
                contactId,
                "Selecciona una cita confirmada de la lista.",
            );
        await conversation.update({
            chatbot_state: { ...state, step: "confirm_cancel", pendingAppointmentId: choice.id },
        });
        return sendResponse(
            conversation,
            contactId,
            "¿Confirmas que deseas cancelar esta cita? La regla de 24 horas seguirá aplicando.",
            [
                { id: "confirm:yes", title: "Sí, cancelar" },
                { id: "confirm:no", title: "No, volver" },
            ],
        );
    }
    if (state.step === "confirm_cancel") {
        if (!/^(?:confirm:yes|sí|si|1)$/i.test(text.trim()))
            return showMainMenu(conversation, contactId, "La cita no se canceló.");
        try {
            await cancelPatientAppointment({ userId, appointmentId: state.pendingAppointmentId });
            await showMainMenu(
                conversation,
                contactId,
                "Tu solicitud de cancelación se procesó correctamente.",
            );
        } catch (error) {
            await showMainMenu(
                conversation,
                contactId,
                error.message || "No pudimos cancelar la cita.",
            );
        }
        return;
    }
    if (["confirm_booking", "confirm_reschedule", "confirm_cancel"].includes(state.step))
        return sendResponse(conversation, contactId, "Elige Sí o No para continuar.");
    return showMainMenu(conversation, contactId, "No reconocí esa respuesta.");
}

async function processInboundMessage(message, accountId) {
    const parsed = parseInboundMessage(message);
    if (!parsed || !parsed.contactId) return;
    const now = new Date();
    let conversation = await WhatsAppConversation.findOne({
        where: {
            provider_name: META_PROVIDER,
            provider_account_id: accountId,
            wa_contact_id: parsed.contactId,
        },
    });
    if (!conversation) {
        try {
            conversation = await WhatsAppConversation.create({
                patient_id: null,
                provider_name: META_PROVIDER,
                provider_account_id: accountId,
                provider_conversation_id: null,
                wa_contact_id: parsed.contactId,
                chatbot_state: null,
                identity_verified_until: null,
                chatbot_flow_version_id: null,
                status: "Active",
                started_at: now,
                last_activity_at: now,
            });
        } catch (error) {
            if (error.name !== "SequelizeUniqueConstraintError") throw error;
            conversation = await WhatsAppConversation.findOne({
                where: {
                    provider_name: META_PROVIDER,
                    provider_account_id: accountId,
                    wa_contact_id: parsed.contactId,
                },
            });
            if (!conversation) throw error;
        }
    } else if (conversation.status !== "Active") {
        await conversation.update({
            patient_id: null,
            chatbot_state: null,
            identity_verified_until: null,
            status: "Active",
            ended_at: null,
        });
    }

    try {
        const isIdentityInput = ["identity_document", "identity_code"].includes(
            conversation.chatbot_state?.step,
        );
        const numericInput = (parsed.text || "").replace(/\D/g, "");
        const redactedContent =
            isIdentityInput || (numericInput.length >= 5 && numericInput.length <= 15)
                ? "[Dato de verificación omitido]"
                : parsed.text || null;
        await WhatsAppMessage.create({
            conversation_id: conversation.id,
            provider_message_id: parsed.providerMessageId,
            direction: "Inbound",
            message_type: parsed.type,
            content: redactedContent,
            processing_status: "Processing",
            delivery_status: null,
            received_at: parsed.receivedAt,
            processed_at: null,
            content_expires_at: messageExpiryDate(now),
            created_at: now,
            provider_name: META_PROVIDER,
            provider_account_id: accountId,
        });
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") return;
        throw error;
    }

    await conversation.update({ last_activity_at: now });
    const runtimeSettings = await WhatsAppChatbotRuntimeSetting.findByPk(1, {
        include: [
            { model: ChatbotFlowVersion, as: "activeFlowVersion", attributes: ["id", "status"] },
        ],
    });
    const activeFlow = runtimeSettings?.activeFlowVersion;
    if (!activeFlow || activeFlow.status !== "Published" || !isChatbotEnabled()) {
        await WhatsAppMessage.update(
            { processing_status: "Processed", processed_at: new Date() },
            {
                where: {
                    provider_message_id: parsed.providerMessageId,
                    provider_account_id: accountId,
                },
            },
        );
        return;
    }

    if (conversation.chatbot_flow_version_id !== activeFlow.id) {
        await conversation.update({ chatbot_flow_version_id: activeFlow.id });
    }

    try {
        const text = parsed.text;
        const state = conversation.chatbot_state;
        const patient = conversation.patient_id
            ? await Patient.findByPk(conversation.patient_id, {
                  include: [
                      {
                          model: User,
                          as: "user",
                          required: true,
                          where: { is_active: true },
                          attributes: ["id"],
                      },
                  ],
              })
            : null;
        const userId = patient?.user?.id || null;
        if (!state) {
            await showMainMenu(
                conversation,
                parsed.contactId,
                "Hola. Soy el asistente de SaludVital.",
            );
        } else if (
            state.step === "identity_document" ||
            state.step === "identity_code" ||
            state.step === "menu"
        ) {
            await handleSelection(conversation, parsed.contactId, text, userId, state);
        } else if (
            userId &&
            conversation.identity_verified_until &&
            new Date(conversation.identity_verified_until) > now
        ) {
            await handleSelection(conversation, parsed.contactId, text, userId, state);
        } else {
            await requireVerifiedPatient(conversation, parsed.contactId, state.intent);
        }
        await WhatsAppMessage.update(
            { processing_status: "Processed", processed_at: new Date() },
            {
                where: {
                    provider_message_id: parsed.providerMessageId,
                    provider_account_id: accountId,
                },
            },
        );
    } catch (error) {
        await WhatsAppMessage.update(
            { processing_status: "Failed", processed_at: new Date() },
            {
                where: {
                    provider_message_id: parsed.providerMessageId,
                    provider_account_id: accountId,
                },
            },
        );
        // Do not log webhook content, identity data, provider payloads, or credentials.
        console.error("WhatsApp chatbot message processing failed.", {
            conversationId: conversation.id,
            errorName: error?.name || "Error",
        });
    }
}

async function processDeliveryStatus(status, accountId) {
    if (!status || typeof status.id !== "string") return;
    const allowedStatuses = new Set(["sent", "delivered", "read", "failed"]);
    if (!allowedStatuses.has(status.status)) return;
    await WhatsAppMessage.update(
        { delivery_status: status.status },
        {
            where: {
                provider_name: META_PROVIDER,
                provider_account_id: accountId,
                provider_message_id: status.id,
            },
        },
    );
    const providerErrorCode = Number(status.errors?.[0]?.code);
    await Notification.update(
        {
            provider_delivery_status: status.status,
            ...(status.status === "failed"
                ? {
                      last_error: Number.isSafeInteger(providerErrorCode)
                          ? `Meta WhatsApp delivery failed with provider code ${providerErrorCode}.`
                          : "Meta WhatsApp reported a delivery failure.",
                  }
                : {}),
        },
        {
            where: {
                channel: "WhatsApp",
                provider_message_id: status.id,
            },
        },
    );
}

export function verifyMetaWebhookSignature(rawBody, signature, appSecret) {
    if (!Buffer.isBuffer(rawBody) || typeof signature !== "string" || !appSecret) return false;
    const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return (
        receivedBuffer.length === expectedBuffer.length &&
        timingSafeEqual(receivedBuffer, expectedBuffer)
    );
}

export function verifyMetaWebhookChallenge(query) {
    const verifyToken = configuredString("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN");
    if (
        !verifyToken ||
        query["hub.mode"] !== "subscribe" ||
        query["hub.verify_token"] !== verifyToken ||
        typeof query["hub.challenge"] !== "string"
    ) {
        return null;
    }
    return query["hub.challenge"];
}

export async function processMetaWhatsAppWebhook(payload) {
    const accountId = getAccountId();
    if (!accountId || !Array.isArray(payload?.entry)) return;
    for (const entry of payload.entry) {
        for (const change of entry.changes || []) {
            const value = change.value || {};
            const phoneNumberId = value.metadata?.phone_number_id;
            if (phoneNumberId !== accountId || change.field !== "messages") continue;
            for (const status of value.statuses || [])
                await processDeliveryStatus(status, accountId);
            for (const message of value.messages || [])
                await processInboundMessage(message, accountId);
        }
    }
}

export async function purgeExpiredWhatsAppMessageContent(referenceDate = new Date()) {
    const [updatedCount] = await WhatsAppMessage.update(
        { content: null },
        {
            where: {
                content: { [Op.ne]: null },
                content_expires_at: { [Op.lte]: referenceDate },
            },
        },
    );
    return updatedCount;
}

export async function expireInactiveWhatsAppIdentitySessions(referenceDate = new Date()) {
    return database.transaction(async (transaction) => {
        const [updatedCount] = await WhatsAppConversation.update(
            { identity_verified_until: null, chatbot_state: null },
            {
                where: {
                    identity_verified_until: { [Op.lte]: referenceDate },
                    patient_id: { [Op.ne]: null },
                },
                transaction,
            },
        );
        return updatedCount;
    });
}

export async function purgeExpiredWhatsAppVerificationCodes(referenceDate = new Date()) {
    return WhatsAppVerification.destroy({ where: { expires_at: { [Op.lte]: referenceDate } } });
}
