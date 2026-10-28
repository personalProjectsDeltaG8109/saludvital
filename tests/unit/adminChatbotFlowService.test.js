import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transactionLock = Symbol("update");
const transaction = { LOCK: { UPDATE: transactionLock } };
const databaseTransaction = jest.fn(async (callback) => callback(transaction));

jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: databaseTransaction },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({}));
jest.unstable_mockModule("../../src/models/ChatbotFlow.js", () => ({
    default: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/ChatbotFlowVersion.js", () => ({
    default: { findOne: jest.fn(), create: jest.fn() },
}));

const ChatbotFlow = (await import("../../src/models/ChatbotFlow.js")).default;
const ChatbotFlowVersion = (await import("../../src/models/ChatbotFlowVersion.js")).default;
const {
    getAdminChatbotFlows,
    getAdminChatbotFlow,
    saveAdminChatbotFlowDraft,
    validateChatbotFlowInput,
} = await import("../../src/modules/admin/services/adminChatbotFlowService.js");

const validInput = {
    name: "Solicitud de cita",
    description: "Flujo de borrador",
    definition: {
        startStepId: "welcome",
        steps: [
            { id: "welcome", type: "message", text: "Bienvenido", nextStepId: "choice" },
            {
                id: "choice",
                type: "question",
                text: "¿Qué necesitas?",
                options: [{ label: "Agendar", nextStepId: "finish" }],
            },
            { id: "finish", type: "message", text: "Gracias" },
        ],
    },
};

function modelRecord(record) {
    return { ...record, get: () => ({ ...record }) };
}

describe("administrator chatbot flow draft service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        databaseTransaction.mockImplementation(async (callback) => callback(transaction));
    });

    test("normalizes valid message, question, options, and transitions", () => {
        expect(validateChatbotFlowInput(validInput)).toMatchObject({
            ...validInput,
            definition: {
                ...validInput.definition,
                steps: [
                    ...validInput.definition.steps.slice(0, 2),
                    { ...validInput.definition.steps[2], nextStepId: null },
                ],
            },
        });
    });

    test("rejects duplicate step identifiers and missing transition targets", () => {
        const duplicate = structuredClone(validInput);
        duplicate.definition.steps[1].id = "welcome";
        expect(() => validateChatbotFlowInput(duplicate)).toThrow("identificador único");

        const missingTarget = structuredClone(validInput);
        missingTarget.definition.steps[0].nextStepId = "missing";
        expect(() => validateChatbotFlowInput(missingTarget)).toThrow("paso inexistente");
    });

    test("rejects unsupported executable actions and invalid questions", () => {
        const unsupported = structuredClone(validInput);
        unsupported.definition.steps[0].action = "create_appointment";
        expect(() => validateChatbotFlowInput(unsupported)).toThrow("campos no admitidos");

        const noOptions = structuredClone(validInput);
        noOptions.definition.steps[1].options = [];
        expect(() => validateChatbotFlowInput(noOptions)).toThrow(
            "debe tener entre 1 y 10 opciones",
        );
    });

    test("creates a first draft version and attributes it to the administrator", async () => {
        ChatbotFlow.create.mockResolvedValue({ id: 12, update: jest.fn() });
        ChatbotFlowVersion.create.mockResolvedValue(
            modelRecord({ id: 22, flow_id: 12, version_number: 1, ...validInput, status: "Draft" }),
        );

        const saved = await saveAdminChatbotFlowDraft(7, null, validInput);

        expect(ChatbotFlow.create).toHaveBeenCalledWith({}, { transaction });
        expect(ChatbotFlowVersion.create).toHaveBeenCalledWith(
            expect.objectContaining({
                flow_id: 12,
                version_number: 1,
                created_by: 7,
                status: "Draft",
            }),
            { transaction },
        );
        expect(saved).toMatchObject({ id: 12, versionId: 22, version: 1, status: "Draft" });
    });

    test("saves edits as a new version instead of replacing history", async () => {
        const flow = { id: 12, update: jest.fn().mockResolvedValue(undefined) };
        ChatbotFlow.findByPk.mockResolvedValue(flow);
        ChatbotFlowVersion.findOne.mockResolvedValue({ version_number: 3 });
        ChatbotFlowVersion.create.mockResolvedValue(
            modelRecord({ id: 24, flow_id: 12, version_number: 4, ...validInput, status: "Draft" }),
        );

        const saved = await saveAdminChatbotFlowDraft(7, "12", validInput);

        expect(ChatbotFlowVersion.create).toHaveBeenCalledWith(
            expect.objectContaining({ flow_id: 12, version_number: 4, created_by: 7 }),
            { transaction },
        );
        expect(flow.update).toHaveBeenCalledWith(
            expect.objectContaining({ updated_at: expect.any(Date) }),
            { transaction },
        );
        expect(saved.version).toBe(4);
    });

    test("lists the latest persisted version and returns version history", async () => {
        ChatbotFlow.findAll.mockResolvedValue([
            modelRecord({
                id: 12,
                versions: [{ id: 24, version_number: 4, ...validInput, status: "Draft" }],
            }),
        ]);
        ChatbotFlow.findByPk.mockResolvedValue(
            modelRecord({
                id: 12,
                versions: [
                    { id: 24, version_number: 4, ...validInput, status: "Draft" },
                    { id: 23, version_number: 3, ...validInput, status: "Draft" },
                ],
            }),
        );

        const list = await getAdminChatbotFlows();
        const detail = await getAdminChatbotFlow(12);

        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ id: 12, versionId: 24, version: 4, name: validInput.name });
        expect(detail.versions.map((version) => version.version)).toEqual([4, 3]);
    });

    test("invalid configuration is rejected before starting a transaction", async () => {
        await expect(
            saveAdminChatbotFlowDraft(7, null, { ...validInput, definition: {} }),
        ).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(databaseTransaction).not.toHaveBeenCalled();
    });
});
