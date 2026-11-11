import { createHash } from "node:crypto";
import { Op } from "sequelize";
import AuthSession from "../../../models/AuthSession.js";

// Preserve the existing three-minute inactivity policy.
const INACTIVITY_LIMIT_MS = 180 * 1000;

function hashSessionId(sessionId) {
    if (typeof sessionId !== "string" || !sessionId) {
        throw new TypeError("A valid session identifier is required.");
    }

    return createHash("sha256").update(sessionId).digest("hex");
}

// Persist the session before issuing the authentication cookie.
export async function startSession(sessionId, userId) {
    await AuthSession.create({
        session_id_hash: hashSessionId(sessionId),
        user_id: userId,
        last_activity_at: new Date(),
    });
}

// Atomically extend activity only when the persisted session is still valid.
// A conditional update prevents simultaneous requests from reviving expired sessions.
export async function refreshSession(sessionId, userId, now = new Date()) {
    const cutoff = new Date(now.getTime() - INACTIVITY_LIMIT_MS);
    const [updated] = await AuthSession.update(
        { last_activity_at: now },
        {
            where: {
                session_id_hash: hashSessionId(sessionId),
                user_id: userId,
                last_activity_at: { [Op.gt]: cutoff },
            },
        },
    );

    if (updated === 1) {
        return true;
    }

    // MySQL may report no changed rows when concurrent requests write the same timestamp.
    return hasActiveSession(sessionId, userId, now);
}

// Check validity without extending activity for background or read-only requests.
export async function hasActiveSession(sessionId, userId, now = new Date()) {
    const cutoff = new Date(now.getTime() - INACTIVITY_LIMIT_MS);
    const session = await AuthSession.findOne({
        where: {
            user_id: userId,
            session_id_hash: hashSessionId(sessionId),
            last_activity_at: { [Op.gt]: cutoff },
        },
        attributes: ["session_id_hash"],
    });

    return Boolean(session);
}

// Delete at most one ordered batch so cleanup work stays bounded.
export async function cleanupExpiredSessions({ batchSize = 100, now = new Date() } = {}) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
        throw new TypeError("The session cleanup batch size must be between 1 and 500.");
    }

    const cutoff = new Date(now.getTime() - INACTIVITY_LIMIT_MS);
    const expiredSessions = await AuthSession.findAll({
        where: { last_activity_at: { [Op.lte]: cutoff } },
        attributes: ["session_id_hash"],
        order: [
            ["last_activity_at", "ASC"],
            ["session_id_hash", "ASC"],
        ],
        limit: batchSize,
    });
    const sessionHashes = expiredSessions.map((session) => session.session_id_hash);

    if (sessionHashes.length === 0) {
        return 0;
    }

    return AuthSession.destroy({
        where: {
            session_id_hash: { [Op.in]: sessionHashes },
            last_activity_at: { [Op.lte]: cutoff },
        },
    });
}

// Revoke the current session across every application instance.
export async function endSession(sessionId) {
    await AuthSession.destroy({
        where: { session_id_hash: hashSessionId(sessionId) },
    });
}

// Password resets revoke every session belonging to the account.
export async function endUserSessions(userId) {
    await AuthSession.destroy({ where: { user_id: userId } });
}
