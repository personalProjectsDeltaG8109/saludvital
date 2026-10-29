import database from "../../../../config/database.js";
import "../../../models/associations.js";
import ChatbotFlow from "../../../models/ChatbotFlow.js";
import ChatbotFlowVersion from "../../../models/ChatbotFlowVersion.js";

const MAX_FLOW_COUNT = 100;
const MAX_STEP_COUNT = 50;
const MAX_OPTION_COUNT = 10;
const STEP_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,49}$/;

function serviceError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseFlowId(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw serviceError("El identificador del flujo no es válido.");
    }
    return id;
}

function requireText(value, label, maximumLength) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > maximumLength) {
        throw serviceError(`Escribe ${label} (máximo ${maximumLength} caracteres).`);
    }
    return value.trim();
}

function normalizeStep(step, index) {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
        throw serviceError(`El paso ${index + 1} no tiene un formato válido.`);
    }

    const allowedKeys =
        step.type === "message"
            ? ["id", "type", "text", "nextStepId"]
            : ["id", "type", "text", "options"];
    if (Object.keys(step).some((key) => !allowedKeys.includes(key))) {
        throw serviceError(`El paso ${index + 1} contiene campos no admitidos.`);
    }

    const id = requireText(step.id, `el identificador del paso ${index + 1}`, 50);
    if (!STEP_ID_PATTERN.test(id)) {
        throw serviceError(
            `El identificador “${id}” solo puede usar letras, números, guiones y guiones bajos; debe iniciar con una letra.`,
        );
    }
    if (!["message", "question"].includes(step.type)) {
        throw serviceError(`El tipo del paso “${id}” no está admitido.`);
    }

    const text = requireText(step.text, `el texto del paso “${id}”`, 2000);
    if (step.type === "message") {
        const nextStepId =
            step.nextStepId === undefined || step.nextStepId === null
                ? null
                : requireText(step.nextStepId, `el siguiente paso de “${id}”`, 50);
        return { id, type: step.type, text, nextStepId };
    }

    if (
        !Array.isArray(step.options) ||
        step.options.length < 1 ||
        step.options.length > MAX_OPTION_COUNT
    ) {
        throw serviceError(
            `La pregunta “${id}” debe tener entre 1 y ${MAX_OPTION_COUNT} opciones.`,
        );
    }
    const options = step.options.map((option, optionIndex) => {
        if (!option || typeof option !== "object" || Array.isArray(option)) {
            throw serviceError(`La opción ${optionIndex + 1} de “${id}” no es válida.`);
        }
        if (Object.keys(option).some((key) => !["label", "nextStepId"].includes(key))) {
            throw serviceError(
                `La opción ${optionIndex + 1} de “${id}” contiene campos no admitidos.`,
            );
        }
        return {
            label: requireText(
                option.label,
                `el texto de la opción ${optionIndex + 1} de “${id}”`,
                200,
            ),
            nextStepId: requireText(
                option.nextStepId,
                `el destino de la opción ${optionIndex + 1} de “${id}”`,
                50,
            ),
        };
    });
    return { id, type: step.type, text, options };
}

export function validateChatbotFlowInput(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw serviceError("La información del flujo no es válida.");
    }
    if (Object.keys(input).some((key) => !["name", "description", "definition"].includes(key))) {
        throw serviceError("La información del flujo contiene campos no admitidos.");
    }

    const name = requireText(input.name, "un nombre para el flujo", 100);
    const description = input.description === undefined ? "" : input.description;
    if (typeof description !== "string" || description.length > 500) {
        throw serviceError("La descripción no puede superar 500 caracteres.");
    }
    const definition = input.definition;
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
        throw serviceError("La definición del flujo debe ser un objeto válido.");
    }
    if (Object.keys(definition).some((key) => !["startStepId", "steps"].includes(key))) {
        throw serviceError("La definición contiene campos no admitidos.");
    }
    if (
        !Array.isArray(definition.steps) ||
        definition.steps.length < 1 ||
        definition.steps.length > MAX_STEP_COUNT
    ) {
        throw serviceError(`El flujo debe tener entre 1 y ${MAX_STEP_COUNT} pasos.`);
    }

    const steps = definition.steps.map(normalizeStep);
    const stepIds = new Set(steps.map((step) => step.id));
    if (stepIds.size !== steps.length) {
        throw serviceError("Cada paso debe tener un identificador único.");
    }
    const startStepId = requireText(definition.startStepId, "un paso inicial", 50);
    if (!stepIds.has(startStepId)) {
        throw serviceError("El paso inicial debe existir en la definición.");
    }
    for (const step of steps) {
        const targets =
            step.type === "message"
                ? step.nextStepId
                    ? [step.nextStepId]
                    : []
                : step.options.map((option) => option.nextStepId);
        if (targets.some((target) => !stepIds.has(target))) {
            throw serviceError(
                `El paso “${step.id}” contiene una transición a un paso inexistente.`,
            );
        }
    }

    return { name, description: description.trim(), definition: { startStepId, steps } };
}

function mapVersion(version) {
    const record = version.get ? version.get({ plain: true }) : version;
    return {
        versionId: Number(record.id),
        version: Number(record.version_number),
        name: record.name,
        description: record.description || "",
        status: record.status || "Draft",
        definition: record.definition,
        createdAt: record.created_at,
    };
}

export async function getAdminChatbotFlows() {
    const flows = await ChatbotFlow.findAll({
        attributes: ["id", "created_at", "updated_at"],
        include: [
            {
                model: ChatbotFlowVersion,
                as: "versions",
                attributes: [
                    "id",
                    "version_number",
                    "name",
                    "description",
                    "status",
                    "definition",
                    "created_at",
                ],
                separate: true,
                limit: 1,
                order: [["version_number", "DESC"]],
            },
        ],
        order: [
            ["updated_at", "DESC"],
            ["id", "DESC"],
        ],
        limit: MAX_FLOW_COUNT,
    });
    return flows.flatMap((flow) => {
        const record = flow.get({ plain: true });
        const latestVersion = record.versions?.[0];
        return latestVersion ? [{ ...mapVersion(latestVersion), id: Number(record.id) }] : [];
    });
}

export async function getAdminChatbotFlow(flowId) {
    const id = parseFlowId(flowId);
    const flow = await ChatbotFlow.findByPk(id, {
        include: [
            {
                model: ChatbotFlowVersion,
                as: "versions",
                attributes: [
                    "id",
                    "version_number",
                    "name",
                    "description",
                    "status",
                    "definition",
                    "created_at",
                ],
                separate: true,
                order: [["version_number", "DESC"]],
            },
        ],
    });
    if (!flow) throw serviceError("No encontramos ese flujo.", 404);
    const record = flow.get({ plain: true });
    return { id: Number(record.id), versions: (record.versions || []).map(mapVersion) };
}

export async function saveAdminChatbotFlowDraft(actorId, flowId, input) {
    const flowInput = validateChatbotFlowInput(input);
    if (!Number.isSafeInteger(Number(actorId)) || Number(actorId) < 1) {
        throw serviceError("La sesión del administrador no es válida.", 401);
    }
    const id = flowId === null || flowId === undefined ? null : parseFlowId(flowId);

    return database.transaction(async (transaction) => {
        let flow;
        let version = 1;
        if (id) {
            flow = await ChatbotFlow.findByPk(id, {
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!flow) throw serviceError("No encontramos ese flujo.", 404);
            const latestVersion = await ChatbotFlowVersion.findOne({
                where: { flow_id: id },
                order: [["version_number", "DESC"]],
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            version = Number(latestVersion?.version_number || 0) + 1;
        } else {
            flow = await ChatbotFlow.create({}, { transaction });
        }

        const savedVersion = await ChatbotFlowVersion.create(
            {
                flow_id: flow.id,
                version_number: version,
                name: flowInput.name,
                description: flowInput.description,
                status: "Draft",
                definition: flowInput.definition,
                created_by: Number(actorId),
            },
            { transaction },
        );
        await flow.update({ updated_at: new Date() }, { transaction });
        return { ...mapVersion(savedVersion), id: Number(flow.id) };
    });
}
