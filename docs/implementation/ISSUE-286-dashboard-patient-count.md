# Issue 286 — Show Patient Registration Metrics on the Admin Dashboard

## Scope

Replace the administrator dashboard's registered-user metric with counts based on persisted patient profiles.

## Implementation

- The total counts rows in the existing `patients` table.
- Active patients are patient profiles associated with an active user account. Profiles without an account are excluded from the active count because account activity cannot be determined reliably.
- The query returns aggregate counts only; it does not select patient identity, contact, or clinical fields.
- The dashboard card now reads “Pacientes registrados” and “pacientes activos”.
- No schema, migration, or dependency change was required.

## Acceptance Criteria

- [x] The dashboard label identifies registered patients, not users.
- [x] The total is calculated from persisted patient profiles.
- [x] The active total includes only profiles linked to active accounts.
- [x] Patient counts do not include doctors or administrators without patient profiles.
- [x] The existing dashboard presentation and Colombian number formatting are preserved.
- [x] Automated tests cover total and active patient counts and the empty result.
- [x] No personally identifying or clinical fields are returned for the metric.

## Verification

- Focused unit tests: `tests/unit/adminDashboardNotifications.test.js` and `tests/unit/adminProfileView.test.js`.
- Full repository checks are recorded in the associated pull request after execution.
