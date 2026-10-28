# US-ADM-34 — Manage Administrator Profile Preferences

## Implementation

- Added a persisted, per-administrator preference to show or hide the existing recent patient-notification delivery feed and failure badge on the administrator dashboard. It is enabled for existing accounts by default.
- The preference does not change notification delivery to patients or WhatsApp monitoring metrics. Patient notification preferences remain patient-scoped.
- Added an authenticated profile endpoint with strict field and boolean validation. Updates and their audit events share a database transaction; unchanged values do not create duplicate audit events.
- Added an accessible Spanish control to the existing profile Preferences section, with success and error feedback. The selected value remains in place when saving fails.
- Added a reversible migration for `users.admin_notifications_enabled`; no new model or dependency was needed.

## Validation

- Unit tests cover valid updates, invalid payloads, role checks, unchanged values, audit failure propagation, and migration rollback.
- Browser tests cover the preference control's error and success behavior.
- Apply migrations with `npm run db:migrate` before enabling the preference in a deployed database.

## Supported-feature boundary

This preference affects the existing dashboard notification feed and its failure badge only. It does not create administrator email, SMS, WhatsApp, or new notification event types.
