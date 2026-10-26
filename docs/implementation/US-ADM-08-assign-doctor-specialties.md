# US-ADM-08 — Assign Specialties to Doctors

## Story and acceptance criteria

Issue #118 (Sprint 5). Administrators can assign an eligible specialty to a doctor, the selected value is validated against the active specialty catalog, the assignment remains visible in doctor and booking flows, and relevant changes are audited.

## Implementation notes

- The existing registration form in `views/admin/doctor-form.pug` and the existing doctor profile editor in `public/js/admin-users.js` already provide the specialty selection controls. `src/modules/admin/services/adminDoctorService.js` validates active specialty IDs during registration. `src/modules/admin/services/adminUserManagementService.js` validates updates against active specialties while allowing a doctor's existing inactive specialty to remain assigned.
- The `doctors.specialty_id` column is a required foreign key to one specialty. The current schema supports one specialty per doctor and cannot represent multiple assignments; no join table or migration was added.
- Profile update audit records now include the previous and next specialty IDs when the assignment changes. Re-saving the same specialty does not add a specialty-change entry.
- `src/modules/patient/services/appointmentService.js` uses the same doctor-to-specialty relationship when offering doctors for appointment booking, so the assignment remains consistent with the booking flow.

## Verification

- `npm test -- --runInBand` — 40 suites and 330 tests passed.
- `npm run lint`, `npm run format:check`, and `git diff --check` passed.
- The existing doctor registration and profile update tests cover active specialty eligibility, inactive specialty rejection, and specialty change auditing.

## Dependencies and remaining work

This story reuses the doctor registration and profile editing flows established in US-ADM-04 and US-ADM-06. Supporting multiple specialties per doctor would require a separate schema change and is outside the current one-to-one relationship.
