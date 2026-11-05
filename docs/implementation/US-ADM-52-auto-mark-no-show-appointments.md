# US-ADM-52 — Automatically Mark Missed Appointments

## Implementation

- Added a patient quick filter and status selector for missed appointments. The administrator directory exposes the persisted `No Show` status in its status tabs and selector, and its summary includes the corresponding database count.
- Added the persisted `No Show` appointment status through a reversible migration and the existing idempotent status seeder. Rollback refuses to delete a status referenced by an appointment.
- Added a bounded service that transitions only still-confirmed appointments whose persisted `start_at` is at least one hour before the current instant. It locks rows, rechecks the status during update, and records each successful transition through `AppointmentHistory` and `AuditLog` in the same transaction.
- Added a scheduler that runs at startup to recover eligible appointments after downtime, then processes batches every 60 seconds. It does not enqueue patient notifications or alter patient preferences.
- Updated relevant appointment labels, doctor/admin appointment filters and summaries, the administrator weekly chart, and report status totals to show `No asistió` where applicable.
- Doctors can start a consultation for a no-show appointment when the patient arrives late. The existing doctor ownership and active-consultation checks still apply; the correction from `No Show` to `In Progress` is recorded in history and audit.
- No patient, appointment, or audit records are deleted. No dependency was added.

## Data and operational rules

The grace period is exactly 60 minutes after `start_at`. Appointment timestamps are compared as instants, so UTC database values and `America/Bogota` display conventions refer to the same moment. The scheduler handles at most 50 records per run and continues on the next interval until caught up. It safely skips processing while the appointment status catalog is not yet seeded; if the new `No Show` status migration is missing, it reports a safe processing error instead.

## Verification

- `npm test -- --runInBand`: 115 suites and 890 tests passed.
- `npm run test:e2e`: all configured Playwright and axe-core flows passed; the startup flow confirmed there was no scheduler error after the status-catalog guard.
- `npm run db:test:prepare`: applied pending migrations to the dedicated `saludvital_test` database successfully.
- `npm run lint`, `npm run format:check`, and `npm run css:build`: passed.

## Limitations

The scheduler runs inside each application process rather than as a separate worker. Row locks and conditional updates protect transitions when multiple instances run concurrently. At high backlog volumes, processing is intentionally rate-bounded to one batch per scheduler interval.
