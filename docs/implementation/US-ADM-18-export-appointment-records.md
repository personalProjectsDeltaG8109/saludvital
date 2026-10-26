# US-ADM-18 — Export Medical Appointment Records

Issue [#143](https://github.com/personalProjectsDeltaG8109/saludvital/issues/143), assigned to Sprint 5 - Administration (Milestone 5).

## Acceptance criteria

- Export persisted appointment records as CSV and as a printable report that can be saved to PDF.
- Apply the appointment directory's date, supported status, specialty, doctor, and patient search filters.
- Restrict both endpoints to authenticated administrators and validate filters on the server.
- Include only appointment identity, local date/time, patient name, specialty, doctor, and Spanish status label.
- Exclude contact details, documents, clinical reason/history, credentials, and authentication data.
- Use existing statuses only, handle empty results and errors, and protect spreadsheet consumers from formula injection.
- Show a report title, generation time, active filters, appointment rows, and page numbers where supported by the browser.

## Implementation

- Added an administrator-only `GET /api/admin/appointments/export` endpoint that uses the existing appointment search/filter rules and returns a `text/csv` attachment.
- Export queries include all matching records, without the directory page limit. Colombia-local date/time formatting is used in each format.
- Added a CSV serializer with a UTF-8 BOM, CRLF record endings, quoted fields, doubled embedded quotes, and apostrophe-prefix protection for formula-like input.
- Empty CSV matches return HTTP 204; the interface reports empty results and download failures in Spanish.
- Added an `Exportar CSV` control that sends the active filters and starts a browser download.
- Added a protected `GET /admin/appointments/export/pdf` report using the same appointment query and filters as CSV. It displays the generation time in Colombia, readable filter names, and a print-optimized appointment table.
- Added an `Exportar PDF` action that opens the report in a separate tab and launches the browser print dialog; administrators can select “Guardar como PDF”. Print CSS repeats table headings, avoids splitting rows, and requests page numbers where supported.
- Reused the browser's built-in print-to-PDF support. The project has no PDF-generation library, and no new dependency was added.
- No database migration was needed.

## Files

- `src/modules/admin/services/adminAppointmentService.js`
- `src/modules/admin/services/adminAppointmentCsvService.js`
- `src/modules/admin/routes/adminRoutes.js`
- `views/admin/appointments.pug`
- `views/admin/appointment-export-report.pug`
- `public/css/admin-appointments.css`
- `public/css/admin-appointment-report.css`
- `public/js/admin-appointments.js`
- `tests/unit/adminAppointmentService.test.js`
- `tests/unit/adminAppointmentCsvService.test.js`
- `tests/integration/app.test.js`
- `tests/integration/adminAppointmentService.mysql.test.js`
- `tests/e2e/admin-appointments.e2e.js`
- `tests/e2e/admin-appointment-export.e2e.js`
- `package.json`

## Verification

- Full Jest suite: `npm.cmd test -- --runInBand` — 50 suites and 420 tests passed, including the MySQL query integration suite.
- Full browser suite: `npm.cmd run test:e2e` — passed, including CSV download filename and filters, PDF report filters, empty states, errors, and responsive layouts.
- `npm.cmd run lint` passed.
- Prettier checks passed for changed JavaScript, CSS, JSON, and Markdown files. The installed Prettier has no Pug parser; Pug rendering and report behavior were exercised in the browser test.
- Browser CSV download verification uses a mocked response; database query behavior and CSV serialization are covered by unit tests.
- The browser E2E also renders the printable report through Chromium's PDF renderer and checks for a valid `%PDF-` document signature. Interactive Save as PDF remains controlled by the browser's print dialog.

## Remaining work

No known work remains for US-ADM-18. No merge, push, or pull request was performed.
