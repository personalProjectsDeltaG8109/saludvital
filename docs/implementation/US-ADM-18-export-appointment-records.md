# US-ADM-18 — Export Medical Appointment Records

Issue [#143](https://github.com/personalProjectsDeltaG8109/saludvital/issues/143), assigned to Milestone 5 — Sprint 5: Doctor Management (milestone ID 6).

## Acceptance criteria

- Export persisted appointment records using the authorized CSV format.
- Apply the appointment directory's date, supported status, specialty, doctor, and patient search filters.
- Restrict the endpoint to authenticated administrators and validate filters on the server.
- Include only appointment identity, local date/time, patient name, specialty, doctor, and Spanish status label.
- Exclude contact details, documents, clinical reason/history, credentials, and authentication data.
- Use existing statuses only, handle empty results and errors, and protect spreadsheet consumers from formula injection.

## Implementation

- Added an administrator-only `GET /api/admin/appointments/export` endpoint that uses the existing appointment search/filter rules and returns a `text/csv` attachment.
- Export queries include all matching records, without the directory page limit. Colombia-local date/time formatting is used in the generated file.
- Added a CSV serializer with a UTF-8 BOM, CRLF record endings, quoted fields, doubled embedded quotes, and apostrophe-prefix protection for formula-like input.
- Empty matches return HTTP 204; the interface reports the empty state and download failures in Spanish.
- Added an `Exportar CSV` control that sends the active filters and starts a browser download.
- No export dependency or database migration was needed.

## Files

- `src/modules/admin/services/adminAppointmentService.js`
- `src/modules/admin/services/adminAppointmentCsvService.js`
- `src/modules/admin/routes/adminRoutes.js`
- `views/admin/appointments.pug`
- `public/css/admin-appointments.css`
- `public/js/admin-appointments.js`
- `tests/unit/adminAppointmentService.test.js`
- `tests/unit/adminAppointmentCsvService.test.js`
- `tests/integration/app.test.js`
- `tests/integration/adminAppointmentService.mysql.test.js`
- `tests/e2e/admin-appointments.e2e.js`

## Verification

- Full Jest suite: `npm test -- --runInBand` — 50 suites and 418 tests passed, including MySQL query integration.
- Full browser suite: `npm run test:e2e` — passed, including CSV download filename, active filters, empty result, error messaging, and responsive appointment views.
- ESLint passed on changed JavaScript files.
- Prettier checks passed for changed JavaScript, CSS, test files, and the Pug template.
- Browser download verification uses a mocked export response; database query behavior and CSV generation are covered by unit tests.

## Remaining work

No known work remains for US-ADM-18. No merge, push, or pull request was performed.
