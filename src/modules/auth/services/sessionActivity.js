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
export async function refreshSession(sessionId, userId) {
    const now = new Date();
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

    return updated === 1;
}

// Retain the existing query interface for callers that need an expiry check.
export async function isSessionExpired(sessionId) {
    const cutoff = new Date(Date.now() - INACTIVITY_LIMIT_MS);
    const active = await AuthSession.count({
        where: {
            session_id_hash: hashSessionId(sessionId),
            last_activity_at: { [Op.gt]: cutoff },
        },
    });

    return active === 0;
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
