# US-ADM-28 — Record Relevant System Activity

Issue: [#165](https://github.com/personalProjectsDeltaG8109/saludvital/issues/165)

Milestone: #5 — Sprint 5: Doctor Management

Branch: `feature/us-adm-28-record-relevant-system-activity`

## Existing audit coverage

The existing `audit_logs` table and `AuditLog` model support actor ID and snapshot, action, target type and ID, safe target description, JSON changes, reason, result, and event timestamp. Before this change, audit events were already written for administrator appointment cancellations, doctor creation and status changes, schedule changes/deletions, schedule exceptions, specialty edits/status changes, and user profile/account changes. These writes are awaited; transactional operations roll back when the audit write fails. No duplicate event path was found for the actions added here: appointment history records are separate domain history, not `AuditLog` records.

## Implementation

- Added audit records for patient and administrator appointment creation/rescheduling, and patient appointment cancellation through the shared appointment service. Events use the acting account, appointment target ID, action, timestamp, status, times, and doctor/specialty IDs where applicable.
- Added an audit record for administrator specialty creation. Specialty creation and event persistence now share a transaction and identify the administrator from the authenticated route.
- Added Spanish labels and descriptions for the new event types in the existing audit interface service.
- Excluded free-text appointment reasons and patient names from new event data. Fixed system descriptions are stored in the existing `reason` field.
- Audit persistence failures propagate through the transaction so the appointment or specialty operation is not committed without its required audit event.

## Verification

- `npm.cmd test -- --runInBand tests/unit/adminSpecialtyCreationService.test.js tests/unit/patient/appointmentNotificationScheduling.test.js tests/unit/patient/appointmentRescheduling.test.js tests/unit/adminAuditService.test.js`: 4 suites passed, 38 tests passed.
- `npm.cmd test -- --runInBand`: 57 suites passed, 482 tests passed.
- ESLint on changed JavaScript files, Prettier check on changed files, and `git diff --check`: passed.

## Limitations

- Existing unaudited historical operations are not backfilled; only future successful operations create these events.
- The GitHub Issue and requested milestone are recorded above. No schema migration or dependency change was required.
