# US-ADM-05 — View Doctor Details

## Story and acceptance criteria

Issue #115 (Sprint 5). An administrator can open a read-only doctor profile from the directory, review the information supported by the current schema, account status, and configured availability, return to the directory, and reach the existing account management actions. The backend protects both the page and detail API, returns not found for unknown doctors, and does not expose credentials or tokens.

## Implementation notes

- `src/modules/admin/services/adminDoctorService.js` reads doctor, account, specialty, and existing `DoctorAvailability` records and returns a limited response shape. The detail view reports only the profile fields currently stored by the schema; no document or telephone fields are invented.
- `src/modules/admin/routes/adminRoutes.js` adds administrator-protected page and JSON routes. The page renders the shared administrative shell and a not-found view for missing records.
- `views/admin/doctor-details.pug` and `public/css/admin-doctors.css` provide the responsive profile layout, schedule blocks, status, and return navigation.
- `public/js/admin-doctors.js` adds the directory action. `public/js/admin-users.js` reads the search query so the profile action leads to the existing user edit and account-status controls.
- No migration was needed. Schedule data is read from the existing availability model without implementing schedule-management rules in the Doctors module.

## Verification

- `node --experimental-vm-modules node_modules/jest/bin/jest.js tests/unit/adminDoctorService.test.js tests/integration/app.test.js --runInBand` — 20 tests passed.
- `npm.cmd test -- --runInBand` — 39 suites and 324 tests passed.
- `npm.cmd run test:e2e` — passed the existing login and registration responsive/accessibility checks; these do not exercise an authenticated doctor detail session.
- Targeted ESLint passed for the service, routes, and tests.
- Pug templates compiled.
- Playwright detail-page layout check passed at 320, 390, 768, and 1440 px with no horizontal overflow; the account link retained the encoded email filter.
- `git diff --check` passed.

## Dependencies and remaining work

This story depends on US-ADM-04, now integrated into `develop`. Editing and account activation controls are reused through “Usuarios y roles”. User stories US-ADM-06 through US-ADM-08 remain separate branches and are not implemented here.
