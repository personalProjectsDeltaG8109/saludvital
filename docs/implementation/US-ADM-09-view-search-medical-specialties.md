# US-ADM-09 — View and Search Medical Specialties

Issue [#125](https://github.com/personalProjectsDeltaG8109/saludvital/issues/125), assigned to Sprint 5 — Doctor Management.

## Acceptance criteria

- Only authenticated administrators can open the page and specialty directory endpoint.
- The directory reads specialties and doctor assignments from the existing database models.
- Each row displays its name, optional description, current status, and assigned doctor count.
- Search by specialty name, status filtering, pagination, loading, empty, and error states are supported.
- The interface is in Spanish, reuses the existing administrative shell, and adapts to mobile, tablet, and desktop.
- Responses contain only the fields needed by the directory.

## Implementation

- Added `getAdminSpecialties` to query the existing `Specialities` and `Doctor` models. Summary figures and per-specialty doctor counts are calculated from database records; no schema change or sample data was added.
- Added administrator-protected `GET /admin/specialties` and `GET /api/admin/specialties` routes.
- Added a responsive directory page with the shared admin sidebar and header, live summary cards, search, status filter, pagination, and accessible feedback states.
- Kept creation, editing, and activation controls out of this story; those workflows belong to US-ADM-10 through US-ADM-12.

## Files

- `src/modules/admin/services/adminSpecialtyService.js`
- `src/modules/admin/routes/adminRoutes.js`
- `views/admin/specialties.pug`
- `views/admin/partials/admin-shell.pug`
- `public/css/admin-specialties.css`
- `public/js/admin-specialties.js`
- `tests/unit/adminSpecialtyService.test.js`
- `tests/integration/app.test.js`
- `tests/e2e/admin-specialties.e2e.js`
- `package.json`

## Verification

- `npm.cmd test -- --runInBand tests/unit/adminSpecialtyService.test.js tests/integration/app.test.js` — passed, 2 suites and 19 tests.
- `npm.cmd test -- --runInBand` — passed, 42 suites and 344 tests.
- `node tests/e2e/admin-specialties.e2e.js` — passed; no horizontal overflow at 375×812, 768×1024, or 1440×900; search/filter pagination, empty results, and safe error feedback passed.
- `npm.cmd run test:e2e` — passed, including the application, doctor status, and specialty directory browser flows.
- ESLint on changed JavaScript files — passed.
- Prettier check on changed files — passed.
- Pug render smoke check — passed.

The E2E directory test uses a mocked API response and validates responsive layout and browser interactions. It does not replace a database-backed visual review against production data.

## Dependencies and remaining work

US-ADM-10 through US-ADM-12 are not started. The existing `doctors.specialty_id` relationship and `specialties.is_active` field are reused as-is.
