# US-ADM-15 — Create Medical Appointments

Issue [#137](https://github.com/personalProjectsDeltaG8109/saludvital/issues/137), assigned to Sprint 5 — Doctor Management (milestone ID 6).

## Acceptance criteria

- Only administrators can open the appointment form and its protected endpoints.
- Patient, specialty, doctor, and scheduling choices come from active database records.
- The server validates the submitted patient, specialty, doctor, date, time, and optional reason.
- A selected doctor must be active, assigned to the chosen specialty, and available for the requested slot.
- Existing patient/doctor conflict checks, appointment rules, transaction, history, status, and reminder workflow are reused.
- New appointments use the existing `Confirmed` status. No additional status is introduced.
- Spanish success and validation messages are shown, and failed submissions retain form values.
- The form follows the SaludVital administrator interface and works at mobile, tablet, and desktop sizes.

## Implementation

- Added an administrator appointment form and protected option, doctor, availability, and create endpoints.
- Added a focused administrator service that loads active patient/specialty choices, checks doctor compatibility, and delegates creation to the existing transactional booking service.
- Extended the booking service to support a selected active patient while recording the administrator as the appointment history actor and setting the existing `Admin` source value. Patient self-booking continues to use its authenticated patient identity and `Web` source.
- Reused existing schedule, exception, conflict, status, history, and reminder behavior. No schema change or new dependency was needed.

## Verification

- `npm.cmd test -- --runInBand`: passed (46 suites, 393 tests).
- Focused booking, authorization, and administrator creation checks: passed (3 suites, 37 tests).
- `npm.cmd run test:e2e`: passed, including the creation form at 375×812, 768×1024, and 1440×900. The browser flow checked compatibility lookup, an availability conflict, retained form values, and successful confirmation.
- `npm.cmd run lint`: passed.
- `npm.cmd run format:check`: passed.
- `git diff --check`: passed.

## Dependency and integration order

This branch is based on the latest `develop` fetched at `6adce3d`, which includes US-ADM-14. US-ADM-16 has not been started.
