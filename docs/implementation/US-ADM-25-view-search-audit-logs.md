# US-ADM-25 — View and Search Audit Logs

Issue: [#156](https://github.com/personalProjectsDeltaG8109/saludvital/issues/156)

Milestone: #6 — Sprint 5 - Administration

Branch: `feature/us-adm-25-view-search-audit-logs`

## Implementation

- Added an administrator-only audit page and API using the existing `AuditLog` model and `audit_logs` table.
- Added date, action, and module filters that apply when a control changes; the page has no filter Search button.
- The API returns the ten most recent matching records and the total matching count. Pagination controls are left to US-ADM-26.
- The response excludes actor snapshots, target descriptions, reasons, and raw change JSON. It identifies an available actor by role and internal user ID, and builds event summaries from mapped actions and target IDs.
- Reused the shared administrator sidebar, topbar, authentication middleware, and database schema. No dependencies or migrations were added.
- The responsive page uses a desktop table and mobile cards with loading, empty, and error states.

## Files

- `src/modules/admin/services/adminAuditService.js`: filtered audit query, safe labels, and summaries.
- `src/modules/admin/routes/adminRoutes.js`: administrator-protected page and API routes.
- `views/admin/audit.pug`, `views/admin/partials/admin-shell.pug`, `public/css/admin-audit.css`, `public/js/admin-audit.js`: shared navigation, page structure, responsive layout, and automatic filters.
- `tests/unit/adminAuditService.test.js`, `tests/integration/app.test.js`, `tests/e2e/admin-audit.e2e.js`: safe projection, filters, authorization, loading/empty/error behavior, and responsive UI coverage.

## Verification

- Targeted Jest unit and integration checks: 2 suites passed, 50 tests passed.
- `node tests/e2e/admin-audit.e2e.js`: passed filter behavior, safe text rendering, empty/error states, and no horizontal overflow at 375 × 812, 768 × 1024, and 1440 × 900.
- `npm run lint`: passed.
- Prettier checks for JavaScript, tests, package metadata, and Pug templates: passed.
- Pug compilation and `git diff --check`: passed.

## Limitations

- Only the ten most recent matching records are displayed in this story; backend pagination and navigation are deferred to US-ADM-26.
- Unknown action or target types use generic Spanish labels until a mapping is added.
- No audit event detail screen or new audit recording coverage was added.
