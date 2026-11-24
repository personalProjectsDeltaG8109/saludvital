import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    AccountInvitation,
    AuditLog,
    EmailOutbox,
    Rol,
    User,
} from "../../../models/associations.js";

const INVITABLE_ROLES = Object.freeze({
    patient: { name: "Patient", label: "Paciente" },
    administrator: { name: "Administrator", label: "Administrador" },
});

function invitationError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeInvitePayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw invitationError("Los datos de la invitación no son válidos.");
    }

    const accountType = payload.accountType;
    const role = INVITABLE_ROLES[accountType];
    if (!role) throw invitationError("Selecciona un tipo de cuenta válido.");

    const displayName =
        typeof payload.displayName === "string"
            ? payload.displayName.trim().replace(/\s+/gu, " ")
            : "";
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (
        !displayName ||
        displayName.length > 120 ||
        !/^\p{L}[\p{L}\p{M} .'-]*$/u.test(displayName)
    ) {
        throw invitationError("Escribe un nombre válido de hasta 120 caracteres.");
    }
    if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw invitationError("Escribe un correo electrónico válido.");
    }

    return { accountType, displayName, email, role };
}

async function writeInvitationAudit(actorUserId, action, invitation, user, transaction) {
    const actor = await User.findByPk(actorUserId, {
        attributes: ["id", "email"],
        transaction,
    });
    if (!actor) throw invitationError("No se encontró la sesión del administrador.", 401);

    await AuditLog.create(
        {
            actor_user_id: actor.id,
            actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
            action,
            target_type: "AccountInvitation",
            target_id: String(invitation.id),
            target_description: `${user.rol?.name || user.roleName}: ${user.email}`.slice(0, 255),
            changes: { email: user.email, role: user.rol?.name || user.roleName },
            reason:
                action === "AdminAccountInvitationCancelled"
                    ? "Administrator cancelled an account invitation."
                    : "Administrator managed an account invitation.",
            result: "Success",
            occurred_at: new Date(),
        },
        { transaction },
    );
}

/** Create a password-free account and queue its role-specific activation email. */
export async function createAdminAccountInvitation(actorUserId, payload) {
    const actorId = Number(actorUserId);
    if (!Number.isSafeInteger(actorId) || actorId < 1) {
        throw invitationError("La sesión del administrador no es válida.", 401);
    }
    const { accountType, displayName, email, role } = normalizeInvitePayload(payload);

    try {
        return await database.transaction(async (transaction) => {
            const existing = await User.findOne({
                where: { email },
                attributes: ["id"],
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (existing) {
                throw invitationError("Ya existe una cuenta registrada con ese correo.", 409);
            }

            const roleRecord = await Rol.findOne({
                where: { name: role.name },
                attributes: ["id", "name"],
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!roleRecord) {
                throw invitationError("Ese tipo de cuenta no está disponible.", 503);
            }

            const oneTimeSecret = randomBytes(48).toString("hex");
            const user = await User.create(
                {
                    role_id: roleRecord.id,
                    email,
                    display_name: displayName,
                    password_hash: await bcrypt.hash(oneTimeSecret, 12),
                    is_active: false,
                },
                { transaction },
            );
            const invitation = await AccountInvitation.create(
                { user_id: user.id, invited_by_user_id: actorId },
                { transaction },
            );
            await EmailOutbox.create(
                {
                    user_id: user.id,
                    event_type: "account_invitation",
                    status: "pending",
                    attempts: 0,
                    next_attempt_at: new Date(),
                },
                { transaction },
            );

            const actor = await User.findByPk(actorId, {
                attributes: ["id", "email"],
                transaction,
            });
            if (!actor) throw invitationError("No se encontró la sesión del administrador.", 401);
            await AuditLog.create(
                {
                    actor_user_id: actor.id,
                    actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                    action: "AdminAccountInvitationCreated",
                    target_type: "AccountInvitation",
                    target_id: String(invitation.id),
                    target_description: `${roleRecord.name}: ${email}`.slice(0, 255),
                    changes: { email, role: roleRecord.name },
                    reason: "Administrator invited a new account to SaludVital.",
                    result: "Success",
                    occurred_at: new Date(),
                },
                { transaction },
            );

            return {
                invitation: {
                    id: invitation.id,
                    displayName,
                    email,
                    accountType,
                    role: role.label,
                    status: "pending",
                },
                message: "Invitación creada. El correo se enviará en breve.",
            };
        });
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            throw invitationError("Ya existe una cuenta registrada con ese correo.", 409);
        }
        throw error;
    }
}

/** List active invitations and the delivery state of their latest email. */
export async function getAdminAccountInvitations() {
    const invitations = await AccountInvitation.findAll({
        where: { accepted_at: null, cancelled_at: null },
        include: [
            {
                model: User,
                as: "user",
                attributes: ["id", "email", "display_name", "role_id"],
                include: [{ model: Rol, as: "rol", attributes: ["name"] }],
            },
        ],
        order: [["created_at", "DESC"]],
        limit: 50,
    });
    if (!invitations.length) return { invitations: [] };

    const userIds = invitations.map((invitation) => invitation.user_id);
    const jobs = await EmailOutbox.findAll({
        where: { user_id: { [Op.in]: userIds }, event_type: "account_invitation" },
        attributes: ["id", "user_id", "status", "created_at"],
        order: [["created_at", "DESC"]],
    });
    const latestJobByUser = new Map();
    for (const job of jobs) {
        if (!latestJobByUser.has(job.user_id)) latestJobByUser.set(job.user_id, job);
    }

    const now = Date.now();
    return {
        invitations: invitations.map((invitation) => {
            const job = latestJobByUser.get(invitation.user_id);
            const expired =
                invitation.expires_at && new Date(invitation.expires_at).getTime() <= now;
            const status = expired
                ? "expired"
                : job?.status === "sent"
                  ? "sent"
                  : job?.status === "failed"
                    ? "failed"
                    : "pending";
            return {
                id: invitation.id,
                displayName: invitation.user?.display_name || invitation.user?.email,
                email: invitation.user?.email,
                accountType:
                    invitation.user?.rol?.name === "Administrator" ? "administrator" : "patient",
                role: invitation.user?.rol?.name === "Administrator" ? "Administrador" : "Paciente",
                status,
                createdAt: invitation.created_at,
                expiresAt: invitation.expires_at,
            };
        }),
    };
}

/** Queue a fresh, time-limited email for an invitation that has not been used. */
export async function resendAdminAccountInvitation(actorUserId, rawInvitationId) {
    const invitationId = Number(rawInvitationId);
    if (!Number.isSafeInteger(invitationId) || invitationId < 1) {
        throw invitationError("La invitación seleccionada no es válida.");
    }
    return database.transaction(async (transaction) => {
        const invitation = await AccountInvitation.findByPk(invitationId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!invitation || invitation.accepted_at || invitation.cancelled_at) {
            throw invitationError("La invitación ya no está disponible.", 404);
        }
        const processingJob = await EmailOutbox.findOne({
            where: {
                user_id: invitation.user_id,
                event_type: "account_invitation",
                status: "processing",
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (processingJob)
            throw invitationError("El correo se está enviando. Inténtalo en un momento.", 409);

        const user = await User.findByPk(invitation.user_id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!user || user.email_verified_at)
            throw invitationError("La cuenta ya fue activada.", 409);
        await EmailOutbox.update(
            { status: "failed", locked_at: null },
            {
                where: {
                    user_id: user.id,
                    event_type: "account_invitation",
                    status: { [Op.in]: ["pending", "failed"] },
                },
                transaction,
            },
        );
        await invitation.update({ token_hash: null, expires_at: null }, { transaction });
        await EmailOutbox.create(
            {
                user_id: user.id,
                event_type: "account_invitation",
                status: "pending",
                attempts: 0,
                next_attempt_at: new Date(),
            },
            { transaction },
        );
        await writeInvitationAudit(
            actorUserId,
            "AdminAccountInvitationResent",
            invitation,
            { email: user.email, roleName: "Account" },
            transaction,
        );
        return { message: "Enviamos una nueva invitación al correo registrado." };
    });
}

/** Cancel an unused invitation and prevent its account from signing in. */
export async function cancelAdminAccountInvitation(actorUserId, rawInvitationId) {
    const invitationId = Number(rawInvitationId);
    if (!Number.isSafeInteger(invitationId) || invitationId < 1) {
        throw invitationError("La invitación seleccionada no es válida.");
    }
    return database.transaction(async (transaction) => {
        const invitation = await AccountInvitation.findByPk(invitationId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!invitation || invitation.accepted_at || invitation.cancelled_at) {
            throw invitationError("La invitación ya no está disponible.", 404);
        }
        const user = await User.findByPk(invitation.user_id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!user || user.email_verified_at)
            throw invitationError("La cuenta ya fue activada.", 409);
        const processingJob = await EmailOutbox.findOne({
            where: { user_id: user.id, event_type: "account_invitation", status: "processing" },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (processingJob)
            throw invitationError("El correo se está enviando. Inténtalo en un momento.", 409);
        await invitation.update(
            { cancelled_at: new Date(), token_hash: null, expires_at: null },
            { transaction },
        );
        await writeInvitationAudit(
            actorUserId,
            "AdminAccountInvitationCancelled",
            invitation,
            { email: user.email, roleName: "Account" },
            transaction,
        );
        await EmailOutbox.destroy({
            where: { user_id: user.id, event_type: "account_invitation" },
            transaction,
        });
        await invitation.destroy({ transaction });
        await user.destroy({ transaction });
        return { message: "La invitación fue cancelada." };
    });
}
