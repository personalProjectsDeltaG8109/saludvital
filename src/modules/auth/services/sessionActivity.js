// Track the last activity and owner of each authenticated session.
const INACTIVITY_LIMIT_MS = 180 * 1000;
const activeSessions = new Map();

// Register a session and associate it with its user.
export function startSession(sessionId, userId) {
    activeSessions.set(sessionId, {
        userId: String(userId),
        lastActivity: Date.now(),
    });
}

// Update the last activity timestamp for an existing session.
export function refreshSession(sessionId) {
    const session = activeSessions.get(sessionId);

    if (!session) {
        return false;
    }

    session.lastActivity = Date.now();
    return true;
}

// Check whether a session has exceeded the inactivity limit.
export function isSessionExpired(sessionId) {
    const session = activeSessions.get(sessionId);

    if (!session) {
        return true;
    }

    if (Date.now() - session.lastActivity >= INACTIVITY_LIMIT_MS) {
        activeSessions.delete(sessionId);
        return true;
    }

    return false;
}

// Remove a session when the user signs out.
export function endSession(sessionId) {
    activeSessions.delete(sessionId);
}

// Revoke every active session belonging to a user.
export function endUserSessions(userId) {
    const normalizedUserId = String(userId);

    for (const [sessionId, session] of activeSessions.entries()) {
        if (session.userId === normalizedUserId) {
            activeSessions.delete(sessionId);
        }
    }
}
