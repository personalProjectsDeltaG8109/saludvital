# US-ADM-27 — View Audit Event Details

Issue: [#161](https://github.com/personalProjectsDeltaG8109/saludvital/issues/161)

Milestone: #5 — Sprint 5: Doctor Management

Branch: `feature/us-adm-27-view-audit-event-details`

## Implementation

- Added the administrator-protected `GET /api/admin/audit-logs/:auditLogId` endpoint using the existing audit model and service. Event IDs are validated; invalid IDs return a Spanish 400 response, and missing records return a safe 404 response.
- Added a “Ver detalle” action to desktop rows and mobile cards. It opens an accessible dialog with loading and error states and displays the stored timestamp, responsible-user role and ID when available, module, action, safe description, numeric target ID, and persisted result.
- Included before-and-after values only through an allowlist of recognized fields and safe value formats. Free-text reasons, actor snapshots, target descriptions, credentials, clinical data, unknown fields, and nonnumeric target identifiers are omitted.
- For appointment cancellation events explicitly marked as caused by deactivating additional availability, the detail view resolves only the patient's first and last name from the linked appointment and explains that the administrator deactivated that availability. The stored cancellation-cause code is shown in the safe change list.
- Reused existing administrator authorization and the current audit page. No audit event recording, schema migration, or dependency changes were made.

## Files

- `src/modules/admin/services/adminAuditService.js`: identifier validation, event lookup, safe response projection, and allowlisted change formatting.
- `src/modules/admin/routes/adminRoutes.js`: protected event-detail endpoint.
- `views/admin/audit.pug`, `public/js/admin-audit.js`, `public/css/admin-audit.css`: responsive detail action and accessible dialog.
- `tests/unit/adminAuditService.test.js`, `tests/integration/app.test.js`, `tests/e2e/admin-audit.e2e.js`: sensitive-data exclusion, valid/missing/invalid records, authorization, and detail interaction coverage.

## Verification

- `npm.cmd test -- --runInBand tests/unit/adminAuditService.test.js tests/integration/app.test.js`: 2 suites passed, 57 tests passed, including the schedule-triggered cancellation description and sensitive-data exclusion.
- `node tests/e2e/admin-audit.e2e.js`: passed detail opening, audit list interactions, loading/empty/error states, safe text rendering, and mobile/tablet/desktop overflow checks.
- ESLint on changed JavaScript and test files: passed.
- Prettier check on changed source, styles, Pug, and test files: passed.
- Pug template compilation and `git diff --check`: passed.

## Limitations

- Only recognized, allowlisted before-and-after fields are displayed. Existing audit values outside that safe set remain hidden.
- Event details are read-only. No event history or audit recording behavior was changed.
- The current user model does not store an administrator's display name; the detail uses the existing safe label `Administrador #<id>` rather than exposing the account email.
