# US-ADM-10 — Create Medical Specialty

Issue [#127](https://github.com/personalProjectsDeltaG8109/saludvital/issues/127), assigned to Sprint 5 — Doctor Management.

## Acceptance criteria

- Only authenticated administrators can open the creation page and use the creation endpoint.
- The form accepts the existing model's specialty name and optional description.
- The server validates required fields and model length limits, normalizes whitespace, and rejects duplicate names.
- Valid records are persisted through the existing `Specialities` model and created active, matching its default and the existing doctor selection rules.
- Failed submissions keep the entered values and display a clear error. Successful submissions return to the catalog with the created name selected.
- The form and return path work at mobile, tablet, and desktop sizes.

## Implementation

- Added `createAdminSpecialty` to the existing specialty service. It checks for duplicates before insertion and maps database uniqueness conflicts to a safe `409` response.
- Added the protected `/admin/specialties/new` page and `POST /api/admin/specialties` endpoint.
- Added a responsive creation form for name and description. The status is set to active by the existing model's business rule; activation controls remain in US-ADM-12.
- Added a catalog entry point and a success return that filters the catalog to the new specialty.
- No migration was needed. The existing `specialties` table already has the required name, description, and active status fields.

## Files

- `src/modules/admin/services/adminSpecialtyService.js`
- `src/modules/admin/routes/adminRoutes.js`
- `views/admin/specialties.pug`
- `views/admin/specialty-form.pug`
- `public/css/admin-specialties.css`
- `public/js/admin-specialties.js`
- `public/js/admin-specialty-form.js`
- `tests/unit/adminSpecialtyCreationService.test.js`
- `tests/integration/app.test.js`
- `tests/e2e/admin-specialty-create.e2e.js`
- `package.json`

## Verification

- `npm.cmd test -- --runInBand` — passed, 43 suites and 354 tests.
- `npm.cmd run test:e2e` — passed, including the application, doctor status, specialty directory, and specialty creation flows.
- ESLint — passed.
- Prettier check on changed files — passed.
- Pug render smoke check — passed for the directory and creation views.
- Browser checks confirmed no horizontal overflow at 375×812, 768×1024, and 1440×900. The creation flow preserved values after a duplicate-name response and returned to the catalog after success.

The creation E2E uses a mocked API response. Unit tests assert the model create call; no live-database insertion was used during browser checks.

## Dependency and remaining work

US-ADM-09 was present in the `develop` base used for this branch. US-ADM-11 and US-ADM-12 have not been started.
