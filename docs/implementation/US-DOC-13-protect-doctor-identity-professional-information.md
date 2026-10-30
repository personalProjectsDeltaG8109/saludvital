# US-DOC-13 — Protect Doctor Identity and Professional Information

## Implementation

- Marked identity, email, specialty, and professional fields as protected read-only values in the existing profile view, with an accessible explanation and visual treatment.
- Added a strict backend field allowlist for the future doctor self-service update flow. Protected fields and mixed allowed/protected payloads are rejected before any persistence call.
- Confirmed there is currently no doctor self-service profile update endpoint. Existing doctor creation and protected-record updates remain in the administrator module behind administrator authorization.
- No migration or dependency was added. Structured identity fields are not present in the current doctor/user schema and continue to display as unavailable.
- The allowlist is groundwork for US-DOC-12; the update endpoint and editable contact/address fields remain in that story's scope.

## Verification

- Focused Jest and Supertest: `npm test -- --runInBand tests/unit/doctorProfileService.test.js tests/integration/app.test.js` — 2 suites and 78 tests passed.
- Browser checks: `node tests/e2e/doctor-profile.e2e.js` — passed at mobile, tablet, laptop, and desktop widths, with axe accessibility checks.
- Full Jest: `npm test -- --runInBand` — 84 suites and 640 tests passed.
- Lint: `npm run lint` — passed.
- Formatting: `npm run format:check` — passed.
- Complete E2E suite: `npm run test:e2e` — passed, including the doctor profile responsive/accessibility checks.
- `git diff --check` — passed.

## Tracking

- GitHub Issue: [#213](https://github.com/personalProjectsDeltaG8109/saludvital/issues/213)
- Branch: `feature/doc-profile-protected-fields`
