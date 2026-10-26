# US-ADM-13 — View and Search Medical Appointments

Issue [#133](https://github.com/personalProjectsDeltaG8109/saludvital/issues/133), assigned to Sprint 5 — Doctor Management (milestone ID 6).

## Acceptance criteria

- Only authenticated administrators can access the appointments page and data endpoint.
- The page reads persisted appointment records and shows patient, date/time, specialty, doctor, and status.
- Search covers patient name, document number, and phone; filters cover date range, status, specialty, and doctor.
- Results are paginated, and changing search/filter criteria returns to the first page.
- Summary counts use the supported lifecycle states: Confirmed, In Progress, Attended, and Cancelled.
- Loading, empty, and safe error states are available.
- The Spanish interface uses existing navigation and adapts to mobile, tablet, and desktop without horizontal overflow.
- API responses include only fields required by this directory, not appointment reasons or patient phone numbers.

## Implementation

- Added an administrator-only appointment directory API backed by the existing Sequelize appointment, patient, doctor, specialty, and status models.
- Added date boundaries in the existing Colombia timezone and validated search, identifiers, status, page, and page size.
- Used the existing supported appointment lifecycle values. The directory excludes records whose status is outside that set; existing migration standardizes historical names in the database.
- Added the Spanish responsive page, summary cards, filters, status tabs, table, mobile cards, and pagination. The existing admin sidebar, topbar, and authentication middleware are reused.
- No changes were made to appointment creation, editing, cancellation, rescheduling, or status transitions.
- No schema migration or new dependency was required.

## Files

- `src/modules/admin/services/adminAppointmentService.js`
- `src/modules/admin/routes/adminRoutes.js`
- `views/admin/appointments.pug`
- `views/admin/partials/admin-shell.pug`
- `public/css/admin-appointments.css`
- `public/js/admin-appointments.js`
- `tests/unit/adminAppointmentService.test.js`
- `tests/integration/adminAppointmentService.mysql.test.js`
- `tests/integration/app.test.js`
- `tests/e2e/admin-appointments.e2e.js`
- `package.json`

## Verification

- `npm.cmd test -- --runInBand` — passed, 45 suites and 378 tests, including the read-only MySQL service integration query.
- `npm.cmd run test:e2e` — passed for the application and specialty flows, plus the new appointments directory flow.
- `npm.cmd run lint` — passed after removing an unused frontend constant.
- `npm.cmd run format:check` — passed after formatting the new E2E and MySQL integration tests.
- Pug render smoke check — passed for the appointments page.
- Browser checks confirmed no horizontal overflow at 375×812, 768×1024, and 1440×900. The E2E test also verified the interface text uses only supported statuses, filters are sent to the API, empty/error states render, and pagination/filter requests start on page one.
- The MySQL integration test reads the test database and changes no records. The browser E2E uses mocked appointment results.

## Dependency and remaining work

The branch is based on `develop` at `31084eb`, which contains the specialties stories through US-ADM-12. Appointment detail, create, edit/reschedule, status-transition, and export behavior remain outside this story.
