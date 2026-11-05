# Issue #328 — Restrict Schedule Weekdays by Validity

## Implementation

- The schedule form recalculates available weekdays whenever the validity start or end changes.
- A weekday is enabled only when that weekday occurs within the inclusive date range. An open-ended range permits all weekdays from its start date onward.
- Weekdays outside a bounded range are disabled, unchecked, and excluded from the submitted schedule. A Spanish live status message explains the available days or invalid date range.
- The schedule configuration service applies the same rule to submitted weekday blocks, preventing crafted requests from saving dates outside the selected period.
- Existing overlap checks, appointment-impact confirmation, and schedule lifecycle behavior remain in place. No schema or dependency change was needed.

## Verification

- `tests/unit/adminDoctorScheduleConfigurationService.test.js` covers one-day, two-day, full-week, and out-of-range weekday behavior.
- `tests/e2e/admin-doctor-schedule-configuration.e2e.js` checks open-ended, one-day, Thursday-to-Friday, full-week, and submitted weekday behavior at mobile, tablet, and desktop widths.
- `npm run test -- --runInBand tests/unit/adminDoctorScheduleConfigurationService.test.js`: passed (9 tests).
- `npm run test`: passed (116 suites, 916 tests).
- `npm run test:e2e`: passed, including schedule configuration and the other repository browser flows.
- `npm run lint`, `npm run format`, the required scoped Prettier write command, and `npm run format:check`: passed.
- `npm run css:build`: passed. Its generated `public/css/app.css` output was restored and is not part of this change.
- `git diff --check`: passed.

The initial full E2E attempt exposed that a separate schedule editor test fixture omitted the new optional weekday hint. The browser script now safely skips that status message when the optional element is absent; the editor E2E and full E2E suite then passed.
