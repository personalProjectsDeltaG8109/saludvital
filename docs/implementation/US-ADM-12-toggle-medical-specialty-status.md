# US-ADM-12 — Activate or Deactivate Medical Specialty

Issue [#131](https://github.com/personalProjectsDeltaG8109/saludvital/issues/131), assigned to Sprint 5 — Doctor Management (milestone ID 6).

## Acceptance criteria

- Only authenticated administrators can change specialty status.
- The catalog shows current status and requires explicit confirmation before deactivation.
- Deactivation preserves the specialty record, doctor assignments, and appointment history.
- Inactive specialties cannot be assigned to new doctors or used for new bookings; reactivation restores availability.
- Status changes are recorded through the existing audit log.
- Errors are handled safely and the interface works on mobile and desktop.

## Implementation

- Added a protected `PATCH /api/admin/specialties/:specialtyId/status` endpoint.
- Added a transactionally locked status update that validates boolean input, preserves all non-status fields and relationships, and records successful transitions in the existing audit table.
- Added activate/deactivate actions to the specialty catalog. Deactivation requires a browser confirmation explaining that existing relationships and appointments remain; activation is immediate.
- Confirmed existing rules already limit doctor creation and new doctor assignments to active specialties. Patient booking checks for an active specialty both when listing doctors and when creating the appointment. The story needed no changes to those existing business rules.
- No migration was required.

## Files

- `src/modules/admin/services/adminSpecialtyService.js`
- `src/modules/admin/routes/adminRoutes.js`
- `public/js/admin-specialties.js`
- `public/css/admin-specialties.css`
- `tests/unit/adminSpecialtyCreationService.test.js`
- `tests/unit/patient/appointmentNotificationScheduling.test.js`
- `tests/integration/app.test.js`
- `tests/e2e/admin-specialties.e2e.js`

## Verification

- `npm.cmd test -- --runInBand` — passed, 43 suites and 366 tests.
- `npm.cmd run test:e2e` — passed, including mobile doctor status, specialty confirmation/cancellation/reactivation, create, and edit flows.
- `npm.cmd run lint` — passed.
- `npm.cmd run format:check` — passed for the repository.
- Browser checks confirmed no horizontal overflow at 375×812, 768×1024, and 1440×900. The specialty status buttons were visible at each size, and the deactivation/reactivation interaction was exercised on mobile.
- Unit tests verified the status update is isolated to `is_active`, uses a transaction, writes an audit record, and rejects invalid or repeated transitions. Appointment tests verify inactive specialties are rejected before an appointment record is created.
- No live specialty record was changed during tests; database update behavior is exercised through mocked model/transaction unit tests.

## Dependency and integration order

This branch is based on `develop` at `eae7b7e`, which contains US-ADM-09, US-ADM-10, and US-ADM-11. No merge, push, or pull request has been made.
