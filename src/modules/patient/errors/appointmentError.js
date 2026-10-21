/**
 * Represent an expected appointment business error with an HTTP status.
 */
export class AppointmentError extends Error {
    constructor(message, statusCode = 400) {
        super(message);

        // Identify this error type when handling appointment requests.
        this.name = "AppointmentError";
        this.statusCode = statusCode;
    }
}
