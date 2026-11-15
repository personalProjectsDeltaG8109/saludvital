# Issue #476 — Clarify Emergency Contact Information

## Problem

The patient profile asked for an emergency contact without explaining how SaludVital uses that information. The privacy notice also did not name this data clearly or explain what happens to it when an account is deactivated.

## What changed

- Explained in the patient profile that the emergency contact is optional, should use fictional details in demonstrations, and is not contacted or messaged by SaludVital.
- Added the same guidance to the administrator's patient edit form.
- Updated the privacy notice to identify emergency-contact information, explain that it is not used for messages, and state that account deactivation does not automatically remove it.
- Added browser and HTTP checks for the guidance and protected profile routes.

## Existing behavior

The patient profile service reads and updates the contact for the patient linked to the authenticated account. The administrator user-management service can also view and update patient contact fields. Unverified-account cleanup removes dependent contacts when it deletes an eligible unverified patient. Deactivating a verified account does not automatically delete its contact record.

The inspected application code does not use emergency-contact details to send notifications. The field and existing data handling remain unchanged.

## Data and scope

No database table, field, dependency, or notification behavior changed. The existing retention behavior is now described in the privacy notice.

## Verification

- `npm.cmd run format` — passed; repository files were already formatted.
- `npx.cmd prettier --write "app.js" "server.js" "package.json" "config/**/*.js" "tests/**/*.js" "views/**/*.pug" "src/styles/**/*.css" ".github/workflows/ci.yml" --plugin @prettier/plugin-pug` — passed; listed files were unchanged.
- `npm.cmd run test -- --runInBand` — passed: 149 suites and 1,152 tests.
- Focused profile and legal tests — passed: 3 suites and 94 tests.
- `npm.cmd run lint` — passed.
- `npm.cmd run format:check` — passed.
- `npm.cmd run css:build` — passed. The pre-existing local `public/css/app.css` snapshot was restored and excluded from this change.
- `npm.cmd run test:e2e` — passed, including patient profile, administrator edit guidance, responsive layouts, and the repository's axe-core checks.
- `git diff --check` — passed.

## Limitations

This change clarifies the educational demonstration's behavior. It does not implement third-party consent capture, a data deletion request workflow, or automatic deletion when a verified account is deactivated.
