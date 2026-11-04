# Issue #307 — Enable Live Patient Search in Administrator Appointments

## Scope

Run the existing patient search automatically while administrators type in the appointment directory. Keep its current search fields and the submit control used by other date and directory filters.

## Implemented

- Added a 300 ms input debounce that reuses the protected appointment endpoint and existing name, document, and phone search.
- Search preserves the current date, status, specialty, and doctor filters and resets pagination to the first page.
- Explicit filter submission cancels pending search work.
- Added request sequencing so a late response from an older search cannot replace newer results or errors.
- Extended the appointment browser flow to cover debounce, combined filters, page reset, empty/error handling, and stale-response protection.
- No API projection, business rules, schema, or dependency changes were needed.

## Verification

- Focused Jest: 3 suites passed, 96 tests passed (`adminAppointmentService.test.js`, `adminAppointmentEditingService.test.js`, and `app.test.js`).
- Focused appointment Playwright flow passed, including debounce, combined filters, page reset, stale-response protection, and existing empty/error states.
- Full Jest: 113 suites passed, 871 tests passed.
- Full Playwright suite passed. The first run hit a transient timeout in the existing login visibility assertion; the isolated login flow passed, and a full rerun passed.
- `npm run format` and the required scoped Prettier write command passed.
- ESLint, `format:check`, Tailwind CSS build, and `git diff --check` passed.

## Limitations

Date, status, specialty, and doctor filters still use the existing explicit submit behavior. The search button remains useful for those filters and is not removed in this issue.
