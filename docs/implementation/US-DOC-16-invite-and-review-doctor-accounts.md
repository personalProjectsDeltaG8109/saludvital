# US-DOC-16 — Invite and Review Doctor Accounts

## What changed

- Administrators can invite a doctor without creating or choosing the doctor's password. The existing email queue sends a time-limited invitation link.
- The doctor uses the link to confirm the email, complete required identity and professional details, set a personal password, and optionally add a profile photo.
- A submitted profile remains inactive until an administrator reviews it.
- An administrator can approve a complete profile or request corrections. Requested corrections are sent back through a new invitation link.
- Invitation, approval, correction, and cancellation actions use the existing audit and email systems.
- Doctor screens use structured profile fields. The former free-text professional information field was removed from the doctor form and database.

## Database changes

- `20261126100000-add-doctor-onboarding-review-fields.js` adds doctor identity, registration, and review fields, with a unique identity-document index.
- `20261126130000-remove-doctor-professional-information.js` removes the unused free-text professional information field. Its rollback recreates an empty field; deleted text values cannot be restored.
- Neither migration was run as part of this work.

## Verification results

- Focused Jest checks: 9 suites and 72 tests passed.
- Full Jest run: 147 suites passed. 16 MySQL-dependent suites could not connect because this isolated checkout has no test database credentials.
- ESLint: passed.
- Prettier formatting: passed, including the repository's requested file patterns.
- Tailwind CSS build: passed.
- Playwright E2E: could not start because the test server could not connect to MySQL. Browser behavior therefore still needs verification in an environment with the dedicated test database configured.
