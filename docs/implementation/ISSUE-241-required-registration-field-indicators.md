# Issue 241 — Required Patient Registration Field Indicators

- Added a visible asterisk to every required patient registration label, including health-data consent.
- Added a Spanish note explaining that the asterisk marks a mandatory field.
- Kept optional address and health-information fields unmarked; existing optional labels remain intact.
- Server-side validation, form submission, and database behavior are unchanged.
- Added a Pug view test covering all required and optional field labels.
- Verification: `npm test -- --runInBand tests/unit/patientRegistrationView.test.js`, ESLint on the test, Prettier check on the test, and `git diff --check`.
- No schema or dependency changes were needed.
