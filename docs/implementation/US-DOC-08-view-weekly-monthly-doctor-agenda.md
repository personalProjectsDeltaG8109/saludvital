# US-DOC-08 — View Weekly and Monthly Doctor Agenda

## Implementation

- Extended the authenticated doctor agenda with exactly three views: day, week, and month. The existing day view from US-DOC-07 remains available.
- Added a Monday-to-Sunday weekly view with confirmed appointments grouped by their Bogota calendar date and ordered by start time. Each appointment remains a separate keyboard-accessible link, so overlapping appointments are not hidden.
- Added a monthly calendar showing the number of confirmed appointments per day. Selecting a date opens its daily agenda.
- On small screens, date navigation and the three view selectors occupy separate grid rows. Weekly and monthly headings use distinct view titles so the selected date range appears only once.
- Previous and next navigation preserves the selected view; the selected view and date are also reflected in the URL and restored by browser history navigation.
- Backend queries derive the doctor from the authenticated account and use bounded date ranges in `America/Bogota`. The monthly view returns daily counts only; weekly and daily views show the appointment fields already used by the doctor agenda.
- Cancelled, attended, and in-progress appointments remain excluded in accordance with the approved agenda behavior. Schedule configuration remains administrator-managed.
- Added a protected, read-only appointment detail endpoint used by selectable appointments in the day and week views. The endpoint validates the identifier and scopes its database query to the doctor linked to the authenticated user; missing and unassigned appointments return the same not-found response.
- The detail dialog shows the patient's name and available profile photo, specialty, local date and time, and persisted status. It omits contact identifiers and clinical notes, renders returned strings as text, and supports keyboard dismissal, loading, and error feedback on small and large screens.
- No schema or dependency changes were required.

## Verification

- Focused Jest: 2 suites and 10 tests passed (agenda service and protected routes).
- Full Jest: 80 suites and 609 tests passed.
- Doctor agenda browser flow: passed for day, week, month selection, period navigation, date selection, empty/error states, keyboard focus, and mobile/tablet/desktop layouts with no horizontal overflow.
- Full Playwright E2E suite: passed.
- ESLint, Prettier check, and `git diff --check`: passed.
- Appointment detail service and HTTP authorization coverage: included in the full Jest run; 141 suites and 1105 tests passed.
- Appointment detail browser, keyboard dismissal, safe text rendering, responsive layout, and axe-core checks: passed in the full Playwright run.
- ESLint, Prettier, Tailwind CSS compilation to a temporary output file, and `git diff --check`: passed for this follow-up.
