# PAT-01 and PAT-03 — Appointment Eligibility Rules

## Implementation

- Updated GitHub issues [#44 — Book Medical Appointment](https://github.com/personalProjectsDeltaG8109/saludvital/issues/44) and [#46 — Reschedule Medical Appointment](https://github.com/personalProjectsDeltaG8109/saludvital/issues/46) with the approved eligibility and notice criteria. Both issues were reopened because these acceptance criteria were not implemented before.
- Pediatrics bookings and reschedules now calculate the patient's age from the persisted date of birth and the appointment's local calendar date in `America/Bogota`. Patients may use Pediatrics through age 17; an appointment on or after their 18th birthday is rejected.
- The eligibility check runs when listing available appointment times and again in the transactional booking or rescheduling service. It recognizes the persisted specialty names `Pediatría` and `Pediatrics`; missing or invalid birth dates fail safely.
- Patient rescheduling is available only when the original appointment is at least 24 hours away. The list and protected endpoint enforce this rule. The replacement appointment must also start at least five hours after the request; this boundary applies to available-time results and the protected endpoint used by web and WhatsApp rescheduling. New bookings and administrator edits retain their existing 30-minute minimum.
- No schema or dependency change was needed. Existing patient birth dates, specialty records, appointment transactions, and schedule services are reused.

## Verification

- `npm test -- --runInBand`: 102 suites and 769 tests passed.
- `npm run lint`: passed.
- Prettier check for changed files: passed.
