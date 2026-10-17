// Configure automatic logout after three minutes without user activity.
const INACTIVITY_LIMIT_MS = 180 * 1000;
const ACTIVITY_REPORT_INTERVAL_MS = 30 * 1000;

let inactivityTimer;
let lastActivityReport = 0;
let requestInProgress = false;
let sessionEnded = false;

// End the session through the server and return to the login page.
async function endInactiveSession() {
    if (sessionEnded) {
        return;
    }

    sessionEnded = true;

    try {
        await fetch("/logout", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "",
        });
    } finally {
        window.location.replace("/login?reason=inactivity");
    }
}

// Reset the browser timer after meaningful user activity.
function resetInactivityTimer() {
    if (sessionEnded) {
        return;
    }

    window.clearTimeout(inactivityTimer);

    inactivityTimer = window.setTimeout(
        endInactiveSession,
        INACTIVITY_LIMIT_MS,
    );

    // Report activity periodically instead of sending a request per event.
    const now = Date.now();

    if (
        now - lastActivityReport >= ACTIVITY_REPORT_INTERVAL_MS &&
        !requestInProgress
    ) {
        lastActivityReport = now;
        requestInProgress = true;

        fetch("/session/activity", {
            method: "POST",
            credentials: "same-origin",
        })
            .then((response) => {
                if (response.redirected || response.status === 401) {
                    sessionEnded = true;
                    window.location.replace("/login");
                }
            })
            .catch(() => {
                // A failed activity report is handled by server validation.
            })
            .finally(() => {
                requestInProgress = false;
            });
    }
}

// Listen for common mouse, keyboard, scroll, and touch interactions.
[
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "touchstart",
    "click",
].forEach((eventName) => {
    document.addEventListener(eventName, resetInactivityTimer, {
        passive: true,
    });
});

// Start the inactivity countdown when the dashboard loads.
resetInactivityTimer();