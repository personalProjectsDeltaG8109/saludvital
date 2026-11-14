export const PATIENT_REGISTRATION_CONSENT = Object.freeze({
    acceptedValue: "accepted",
    scope: "personal_and_sensitive_health_data",
    noticeVersion: "1.1",
});

// Use the same accepted value in the HTTP controller and registration service.
export function hasPatientRegistrationConsent(value) {
    return value === PATIENT_REGISTRATION_CONSENT.acceptedValue;
}
