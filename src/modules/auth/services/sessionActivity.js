// Track the last activity of authenticated sessions.
const INACTIVITY_LIMIT_MS = 180 * 1000;
const activeSessions = new Map();

// Register a new authenticated session.
export function startSession(sessionId) {
    activeSessions.set(sessionId, Date.now());
}

// Update the last activity timestamp.
export function refreshSession(sessionId) {
    if (!activeSessions.has(sessionId)) {
        return false;
    }

    activeSessions.set(sessionId, Date.now());
    return true;
}

// Check whether a session has exceeded the inactivity limit.
export function isSessionExpired(sessionId) {
    const lastActivity = activeSessions.get(sessionId);

    if (lastActivity === undefined) {
        return true;
    }

    if (Date.now() - lastActivity >= INACTIVITY_LIMIT_MS) {
        activeSessions.delete(sessionId);
        return true;
    }

    return false;
}

// Remove a session when the user signs out.
export function endSession(sessionId) {
    activeSessions.delete(sessionId);
}
