# US-ADM-31 — Edit Administrator Personal Information

## Implementation

- Added a self-service editor for the administrator's persisted full name, email, and phone. The server accepts only those fields and always uses the authenticated user ID.
- Added a nullable `users.phone` column with a reversible migration because the administrator account had no contact phone field. Reused the shared profile field validation for names, email, and phone.
- Email changes check uniqueness, clear prior verification state, and enqueue the existing verification message in the same transaction as the account update and audit event.
- Profile updates are audited using the existing audit table. The event records changed field names and whether email verification is required, without storing the submitted personal values.
- Validation and persistence errors stay on the form in Spanish without discarding entered values. Role, account status, and other system-managed fields are not accepted.

## Validation

- Unit tests cover successful updates, supported fields, duplicate email, invalid values, protected fields, role checks, no-op saves, and transaction failure handling.
- Browser tests cover editor submission, error recovery, mobile layout, and keyboard focus.
- Apply pending migrations with `npm run db:migrate` before using the phone field.
