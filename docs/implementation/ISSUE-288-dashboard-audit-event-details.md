# Issue 288 — Open Audit Event Details from the Admin Dashboard

## Scope

Let administrators open one of the dashboard's recent persisted audit events in the existing Audit detail dialog.

## Implementation

- The dashboard query selects the audit event ID and returns it with the existing safe activity summary.
- Each activity row links to `/admin/audit?eventId=<id>` and remains keyboard accessible.
- The Audit page reads the requested event ID and opens its existing detail dialog through the existing protected API endpoint.
- Existing audit field filtering, safe error handling, and text-only rendering are reused. No detail API, schema, or dependency was added.

## Acceptance Criteria

- [x] Dashboard activity items with persisted IDs include an accessible detail link.
- [x] The link opens the existing Audit page and detail dialog for that event.
- [x] Event details come only from the existing administrator-protected endpoint.
- [x] Existing privacy filtering and safe errors remain in effect.
- [x] Invalid or missing records use the existing audit detail error handling.
- [x] The dashboard activity feed remains based on persisted audit records.
- [x] Tests cover ID selection, link rendering, deep-link dialog behavior, and existing authorization.
- [x] No schema or dependency change was introduced.

## Verification

- Focused Jest and integration tests: `adminDashboardNotifications.test.js`, `adminProfileView.test.js`, and `app.test.js`.
- Audit browser flow: `node tests/e2e/admin-audit.e2e.js`.
- Full repository checks are listed in the associated pull request.
