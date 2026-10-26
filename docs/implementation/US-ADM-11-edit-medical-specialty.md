# US-ADM-11 — Edit Medical Specialty

Issue [#129](https://github.com/personalProjectsDeltaG8109/saludvital/issues/129), assigned to Sprint 5 — Doctor Management.

## Acceptance criteria

- Only authenticated administrators can edit a specialty.
- The edit form loads the selected specialty's current name and description.
- The server validates supported fields and prevents duplicate names.
- Saved changes appear in the catalog without changing doctor relationships or specialty status.
- Validation and missing-record errors are presented safely.
- Relevant edits are recorded through the existing audit log.
- The form is usable on mobile, tablet, and desktop screens.

## Implementation

- Added a protected edit page and `PATCH /api/admin/specialties/:specialtyId` endpoint.
- Reused the existing specialty form and server-side input validation from US-ADM-10.
- The update runs in a transaction, locks the target row, checks name uniqueness, and updates only the name and description. Existing status and doctor-specialty relationships remain intact.
- Changed values are written to the existing audit log in the same transaction. A no-op submission does not create an audit record.
- Added an edit link to each catalog record and a success return that selects the updated specialty.
- No schema migration was required.

## Files

- `src/modules/admin/services/adminSpecialtyService.js`
- `src/modules/admin/routes/adminRoutes.js`
- `views/admin/specialties.pug`
- `views/admin/specialty-form.pug`
- `public/css/admin-specialties.css`
- `public/js/admin-specialties.js`
- `public/js/admin-specialty-form.js`
- `tests/unit/adminSpecialtyCreationService.test.js`
- `tests/unit/adminSpecialtyService.test.js`
- `tests/integration/app.test.js`
- `tests/e2e/admin-specialties.e2e.js`
- `tests/e2e/admin-specialty-edit.e2e.js`
- `package.json`

## Verification

- `npm.cmd test -- --runInBand` — passed, 43 suites and 361 tests.
- `npm.cmd test -- --runInBand tests/integration/models.mysql.test.js` — passed, 25 tests; this verifies the MySQL model schema. No specialty data was changed by this check.
- `npm.cmd run test:e2e` — passed, including edit form error handling, successful update flow, and no horizontal overflow at 375×812, 768×1024, and 1440×900.
- `npm.cmd run lint` — passed.
- `npm.cmd run format:check` — passed repository-wide after formatting the new E2E test.
- `git diff --check` — passed before the commits were created.

The browser E2E test uses a mocked API response. The service update and transaction behavior are covered with unit mocks; no live specialty record was edited during verification.

## Dependency and remaining work

This branch is based on `feature/us-adm-10-create-specialty`, so US-ADM-10 must be integrated before US-ADM-11. No branches were merged or rebased. US-ADM-12 has not been started.
