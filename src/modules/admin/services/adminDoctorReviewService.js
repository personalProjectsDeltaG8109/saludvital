import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    AccountInvitation,
    AuditLog,
    Doctor,
    EmailOutbox,
    Rol,
    User,
} from "../../../models/associations.js";

const REVIEWABLE_STATUS = "pending";
const APPROVED_STATUS = "approved";
const CHANGES_REQUESTED_STATUS = "changes_requested";

function reviewError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parsePositiveId(value, label) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw reviewError(`El dato de ${label} no es válido.`);
    }
    return id;
}

function normalizeReviewDecision(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw reviewError("La decisión de revisión no es válida.");
    }
    if (payload.decision === "approve") return { decision: "approve", note: null };
    if (payload.decision !== "request_changes") {
        throw reviewError("Selecciona aprobar el perfil o solicitar correcciones.");
    }

    const note = typeof payload.note === "string" ? payload.note.trim() : "";
    if (note.length < 10 || note.length > 500) {
        throw reviewError("Explica las correcciones necesarias en 10 a 500 caracteres.");
    }
    return { decision: "request_changes", note };
}

async function recordReviewAction(actor, doctor, decision, transaction) {
    const approved = decision === "approve";
    await AuditLog.create(
        {
            actor_user_id: actor.id,
            actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
            action: approved ? "AdminDoctorProfileApproved" : "AdminDoctorProfileChangesRequested",
            target_type: "Doctor",
            target_id: String(doctor.id),
            target_description: doctor.user.email,
            changes: {
                profileReviewStatus: approved ? APPROVED_STATUS : CHANGES_REQUESTED_STATUS,
            },
            reason: approved
                ? "Administrator approved the doctor's submitted profile."
                : "Administrator requested corrections to the doctor's submitted profile.",
            result: "Success",
            occurred_at: new Date(),
        },
        { transaction },
    );
}

async function queueCorrectionInvitation(actor, doctor, transaction) {
    const processingEmail = await EmailOutbox.findOne({
        where: {
            user_id: doctor.user.id,
            event_type: "account_invitation",
            status: "processing",
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (processingEmail) {
        throw reviewError("El correo de invitación se está enviando. Inténtalo nuevamente.", 409);
    }

    await EmailOutbox.update(
        { status: "failed", locked_at: null },
        {
            where: {
                user_id: doctor.user.id,
                event_type: "account_invitation",
                status: { [Op.in]: ["pending", "failed"] },
            },
            transaction,
        },
    );

    let invitation = await AccountInvitation.findOne({
        where: { user_id: doctor.user.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    const invitationValues = {
        invited_by_user_id: actor.id,
        accepted_at: null,
        cancelled_at: null,
        token_hash: null,
        expires_at: null,
    };
    if (invitation) {
        await invitation.update(invitationValues, { transaction });
    } else {
        invitation = await AccountInvitation.create(
            { user_id: doctor.user.id, ...invitationValues },
            { transaction },
        );
    }

    await EmailOutbox.create(
        {
            user_id: doctor.user.id,
            event_type: "account_invitation",
            status: "pending",
            attempts: 0,
            next_attempt_at: new Date(),
        },
        { transaction },
    );
}

/** Approve a complete doctor profile or send it back for corrections atomically. */
export async function reviewAdminDoctorProfile(actorUserId, rawDoctorId, payload) {
    const actorId = parsePositiveId(actorUserId, "administrador");
    const doctorId = parsePositiveId(rawDoctorId, "médico");
    const decision = normalizeReviewDecision(payload);

    return database.transaction(async (transaction) => {
        const doctor = await Doctor.findByPk(doctorId, {
            attributes: [
                "id",
                "user_id",
                "first_name",
                "last_name",
                "document_type",
                "document_number",
                "professional_registration_number",
                "profile_review_status",
            ],
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "email", "role_id", "email_verified_at", "is_active"],
                    required: true,
                },
            ],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!doctor) throw reviewError("No encontramos ese médico.", 404);
        if (doctor.profile_review_status !== REVIEWABLE_STATUS) {
            throw reviewError("Este perfil no está pendiente de revisión.", 409);
        }

        const role = await Rol.findByPk(doctor.user.role_id, {
            attributes: ["name"],
            transaction,
        });
        if (role?.name !== "Doctor") {
            throw reviewError("La cuenta asociada ya no tiene el rol de médico.", 409);
        }

        const actor = await User.findByPk(actorId, {
            attributes: ["id", "email"],
            transaction,
        });
        if (!actor) throw reviewError("No encontramos la sesión del administrador.", 401);

        if (decision.decision === "approve") {
            const profileComplete = [
                doctor.first_name,
                doctor.last_name,
                doctor.document_type,
                doctor.document_number,
                doctor.professional_registration_number,
            ].every((value) => typeof value === "string" && value.trim());
            if (!profileComplete || !doctor.user.email_verified_at) {
                throw reviewError(
                    "No se puede aprobar: faltan datos obligatorios o el correo no está confirmado.",
                    409,
                );
            }
            await doctor.update(
                { profile_review_status: APPROVED_STATUS, profile_review_note: null },
                { transaction },
            );
            await doctor.user.update({ is_active: true }, { transaction });
            await recordReviewAction(actor, doctor, "approve", transaction);
            return {
                message: "Perfil aprobado. La cuenta del médico ya está activa.",
                status: APPROVED_STATUS,
            };
        }

        await doctor.update(
            {
                profile_review_status: CHANGES_REQUESTED_STATUS,
                profile_review_note: decision.note,
            },
            { transaction },
        );
        await doctor.user.update({ is_active: false }, { transaction });
        await queueCorrectionInvitation(actor, doctor, transaction);
        await recordReviewAction(actor, doctor, "request_changes", transaction);
        return {
            message: "Enviamos al médico un enlace para corregir el perfil.",
            status: CHANGES_REQUESTED_STATUS,
        };
    });
}
