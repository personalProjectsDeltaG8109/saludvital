# US-ADM-26 — Filter and Paginate Audit Logs

Issue: [#159](https://github.com/personalProjectsDeltaG8109/saludvital/issues/159)

Milestone: #5 — Sprint 5: Doctor Management

Branch: `feature/us-adm-26-filter-paginate-audit-logs`

## Implementation

- Extended the existing administrator audit endpoint to validate and combine start date, end date, action, and module filters. Date boundaries use the application's America/Bogota convention; unsupported action and module values and reversed or invalid date ranges return Spanish validation errors.
- Added server-side pagination with a fixed page size of 10, `findAndCountAll`, newest-first ordering with an ID tie-breaker, matching record totals, and correction to the last available page when a requested page is out of range.
- Kept the existing safe audit projection and administrator authorization. The query returns only fields used by the audit list and does not expose raw changes, reasons, or patient details.
- Added accessible page controls and matching record ranges. Changing any filter automatically reloads the results and returns to page one; no Search button was added.
- Kept the existing desktop table and mobile cards and styled pagination to fit both layouts. No migration or dependency change was needed.

## Files

- `src/modules/admin/services/adminAuditService.js`: filter validation, paginated database query, page correction, and pagination metadata.
- `views/admin/audit.pug`, `public/js/admin-audit.js`, `public/css/admin-audit.css`: pagination markup, interactions, and responsive styles.
- `tests/unit/adminAuditService.test.js`, `tests/e2e/admin-audit.e2e.js`: filter validation, database pagination, out-of-range correction, page navigation, and filter reset coverage.

## Verification

- `npm.cmd test -- --runInBand tests/unit/adminAuditService.test.js tests/integration/app.test.js`: 2 suites passed, 53 tests passed.
- `node tests/e2e/admin-audit.e2e.js`: passed audit list rendering, automatic filters, pagination navigation and reset, empty/error states, safe text rendering, and responsive overflow checks.
- ESLint on the changed JavaScript and test files: passed.
- Prettier check on changed source, styles, Pug, and test files: passed.
- `git diff --check`: passed before the implementation commit.

## Limitations

- Page size is fixed at 10 records per request.
- Pagination counts and filter options reflect the database at query time; records can change between page requests.
- Audit event details and additional event recording remain outside this story.
