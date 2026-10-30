# US-DOC-09 — View Next Appointment and Start Consultation

## Implementation

- Added a “Próxima cita” card to the day, week, and month doctor agenda views, backed by the next eligible persisted appointment assigned to the authenticated doctor.
- Reused the existing appointment status rules and `startDoctorConsultation` endpoint from US-DOC-03. The agenda offers “Iniciar consulta” only for a confirmed appointment when the doctor has no active consultation; in-progress appointments link to the existing consultation only when its ID belongs to that appointment.
- The card displays the patient's name, specialty when available, date, and time. It does not return a patient phone number, document number, photo, or free-text appointment reason.
- Added a “Ver todas” link to the existing doctor appointments page and a Spanish empty state when no upcoming eligible appointment exists.
- Kept the card visible for all calendar views. Daily schedule and exception details remain limited to the day view.
- Reused the existing accessible consultation confirmation dialog and protected consultation-start flow. No new route, model, schema, or dependency was added.

## Branch dependency

This branch is stacked on `feature/doc-agenda-calendar-views` because the agenda page and its day/week/month views are introduced by US-DOC-08. Review and integrate US-DOC-08 before this branch; do not open a pull request against `develop` with the DOC-08 changes duplicated.

## Verification

- `npm.cmd test -- --runInBand`: passed, 82 suites and 618 tests.
- `node tests/e2e/doctor-agenda.e2e.js`: passed for day/week/month and mobile, tablet, and desktop viewports; the agenda card, “Ver todas” link, and consultation dialog were exercised.
- `npm.cmd run lint`: passed.
- `npm.cmd run format:check`: passed.
- Pug compilation and `git diff --check`: passed.
