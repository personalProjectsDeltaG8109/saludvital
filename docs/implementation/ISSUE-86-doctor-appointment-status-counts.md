# Issue #86 — Doctor Appointment Status Counts

## Finding

The appointment service loaded status names without their database IDs, then used those IDs to map grouped appointment counts. As a result, the Confirmadas, Atendidas, and Canceladas cards could all show zero even when appointments existed.

## Changes

- Added the status ID to the existing status-catalog projection so grouped counts map to their persisted status records.
- Kept every count scoped to the doctor resolved from the authenticated user.
- Kept the All card as the sum of all persisted appointment statuses, including In Progress; the three status cards remain Confirmadas, Atendidas, and Canceladas. In Progress is not exposed as a filter or a separate card.
- Added regression tests for count-to-status mapping, doctor scoping, Spanish labels, and empty data.
- Reused the existing appointment API and page. No schema, route, or dependency changes were needed.

## Verification

- Focused Jest: 2 suites passed, 15 tests passed.
- Full Jest: 113 suites passed, 857 tests passed.
- Full Playwright E2E suite: passed. One consultation draft assertion failed in an earlier run, then passed when isolated and during the complete rerun.
- `npm run format`, the repository's explicit Prettier write command, and `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run css:build`: passed.
- `git diff --check`: passed.
