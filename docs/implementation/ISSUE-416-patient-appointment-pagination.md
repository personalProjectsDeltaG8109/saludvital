# Issue #416 — Bound Patient Appointment History Retrieval

## Scope

Add server-side search, filtering, and pagination to the authenticated patient appointment list. Keep the existing patient ownership boundary, summary totals, appointment action rules, visual layout, and persisted records. This issue does not change clinical-history retrieval.

## Implementation

- Added `patientAppointmentListService.js` to validate list parameters and retrieve only the authenticated patient's selected page.
- Limited page sizes to 10, 20, or 50 records. Search supports the linked doctor's display name and specialty name; filters support the persisted appointment statuses and specialties.
- Preserved the existing order: upcoming confirmed appointments first by start time, followed by the remaining appointments newest first. Date comparisons use the application's `America/Bogota` convention.
- Kept summary status totals independent of the selected page. Page links retain active filters, while changed search/filter values submit without a page number and therefore start at page one.
- Added accurate filtered result counts, page controls, empty-filter messaging, and responsive filter controls. Appointment cancellation, rescheduling, and detail dialogs continue to use existing routes and rules.
- Explicit projections keep the list limited to fields used by the existing appointment cards and detail dialogs. No schema, migration, or dependency change was required.

## Verification

- `npm.cmd test -- --runInBand` — passed: 132 suites, 1,059 tests.
- Focused appointment-list tests after the final ordering adjustment — passed: 2 suites, 12 tests.
- `npm.cmd run lint` — passed.
- `npm.cmd run format:check` — passed.
- `npm.cmd run css:build` — passed. The pre-existing working-tree `public/css/app.css` was restored byte-for-byte after this generated build check.
- `npm.cmd run test:e2e` — passed across the repository; the patient appointment responsive/accessibility flow also passed again after the final ordering adjustment.
- `git diff --check` — passed.

## Limitations

- The database-backed pagination query is covered by service mocks; this repository has no dedicated MySQL integration test for the patient appointment list query. A test-database check with a larger fixture set remains useful before release.
- Patient clinical-history retrieval remains a separate unchecked checklist item.
