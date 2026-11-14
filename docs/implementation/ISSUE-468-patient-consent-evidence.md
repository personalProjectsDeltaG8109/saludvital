# Issue #468 — Patient Registration Consent Evidence

## Decision

On 2026-11-13, the project owner approved a minimal consent record linked to the patient account. It stores only the consent scope, privacy notice version, and server-recorded acceptance time. The current notice version is `1.1`.

Verified-account evidence has no separate expiration timer and is kept while the account exists. The existing cleanup removes evidence in the same transaction when it deletes an unverified registration after 30 minutes. The application has no separate verified-account deletion flow; any future deletion flow needs its own retention review.

The record does not copy medical form values, contact details, IP addresses, device details, or submitted free text. The existing consent checkbox and its wording remain unchanged.

## Implementation

- Added the `patient_consents` table with an account reference, consent scope, notice version, and acceptance timestamp. The additive migration is reversible and does not alter existing data.
- Registration validates consent in both the controller and service, then creates the evidence record inside the existing user, patient, and verification-email transaction.
- Added a link beside the registration checkbox to the current privacy notice and its version.
- The consent model is not included in registration responses or other user-facing data. The foreign key prevents an account from being deleted implicitly while evidence remains.
- The existing 30-minute cleanup explicitly removes evidence before deleting an eligible unverified account, within the same transaction.

## Verification

- `npm.cmd test -- --runInBand` — passed: 145 suites and 1,136 tests.
- Focused MySQL integration checks — passed: 3 suites and 13 tests, including registration rollback and the 30-minute unverified-account cleanup.
- `npm.cmd run lint` — passed.
- `npm.cmd run format:check` — passed. The repository's requested Prettier write command also completed successfully.
- `npm.cmd run css:build` — passed. The pre-existing local `public/css/app.css` content was restored and verified against its SHA-256 backup; it is unrelated and excluded from this change.
- `npm.cmd run test:e2e` — passed: the full Playwright run completed with exit code 0, including registration, responsive layout, and accessibility checks.
- `git diff --check` — passed.

## Files

- `database/migrations/20261113100000-create-patient-consents.js`
- `src/models/PatientConsent.js`
- `src/models/associations.js`
- `src/modules/auth/services/patientRegistrationConsent.js`
- `src/modules/auth/services/registrationService.js`
- `src/modules/auth/services/unverifiedRegistrationCleanupService.js`
- `src/modules/auth/controllers/authController.js`
- `views/auth/register.pug`
- Related registration, cleanup, model registry, and migration tests.
