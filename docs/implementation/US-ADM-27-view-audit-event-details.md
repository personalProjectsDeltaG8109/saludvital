# US-ADM-27 — View Audit Event Details

Issue: [#161](https://github.com/personalProjectsDeltaG8109/saludvital/issues/161)

Milestone: #5 — Sprint 5: Doctor Management

Branch: `feature/us-adm-27-view-audit-event-details`

## Implementation

- Added the administrator-protected `GET /api/admin/audit-logs/:auditLogId` endpoint using the existing audit model and service. Event IDs are validated; invalid IDs return a Spanish 400 response, and missing records return a safe 404 response.
- Added a “Ver detalle” action to desktop rows and mobile cards. It opens an accessible dialog with loading and error states and displays the stored timestamp, responsible user's profile name when available, module, action, safe description, a human-readable associated record, and persisted result. Numeric actor and target IDs are not shown in the interface.
- Included before-and-after values only through an allowlist of recognized fields and safe value formats. Free-text reasons, actor snapshots, target descriptions, credentials, clinical data, unknown fields, and nonnumeric target identifiers are omitted.
- For appointment events, the detail view resolves the patient's name, doctor's display name, and specialty name from the linked appointment. Schedule and account changes resolve doctor, specialty, and role IDs to their Spanish names before rendering. Schedule-triggered cancellations identify the responsible administrator by account email when no profile name is available.
- Reused existing administrator authorization and the current audit page. No audit event recording, schema migration, or dependency changes were made.

## Files

- `src/modules/admin/services/adminAuditService.js`: identifier validation, event lookup, safe response projection, and allowlisted change formatting.
- `src/modules/admin/routes/adminRoutes.js`: protected event-detail endpoint.
- `views/admin/audit.pug`, `public/js/admin-audit.js`, `public/css/admin-audit.css`: responsive detail action and accessible dialog.
- `tests/unit/adminAuditService.test.js`, `tests/integration/app.test.js`, `tests/e2e/admin-audit.e2e.js`: sensitive-data exclusion, valid/missing/invalid records, authorization, and detail interaction coverage.

## Verification

- `npm.cmd test -- --runInBand tests/unit/adminAuditService.test.js tests/integration/app.test.js`: 2 suites passed, 57 tests passed, including the schedule-triggered cancellation description and sensitive-data exclusion.
- Follow-up verification: `npm.cmd test -- --runInBand` passed all 57 suites and 484 tests; `node tests/e2e/admin-audit.e2e.js` passed the audit display and responsive checks.
- `node tests/e2e/admin-audit.e2e.js`: passed detail opening, audit list interactions, loading/empty/error states, safe text rendering, and mobile/tablet/desktop overflow checks.
- ESLint on changed JavaScript and test files: passed.
- Prettier check on changed source, styles, Pug, and test files: passed.
- Pug template compilation and `git diff --check`: passed.

## Limitations

- Only recognized, allowlisted before-and-after fields are displayed. Existing audit values outside that safe set remain hidden.
- Event details are read-only. No event history or audit recording behavior was changed.
- The user model has no administrator first or last name fields. Until an administrator display name is modeled, audit displays the account email as the identifiable fallback. Name resolution uses current linked records, so renamed profiles display their current names in historical events.

## Story alignment

US-ADM-27 should replace “associated record identifier” as the visible event detail with a human-readable associated record name when available. It should require responsible-user names when profiles provide them, names for patients, doctors, and specialties related to appointments, and Spanish names instead of numeric role, doctor, and specialty IDs in change details. A safe account identifier is the fallback when a user name is not stored.
