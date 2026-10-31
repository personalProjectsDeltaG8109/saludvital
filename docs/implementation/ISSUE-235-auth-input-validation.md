# ISSUE-235 — Align Authentication Input Limits

## Scope

This implementation aligns account email limits across registration, login, password recovery, and account email editing. Notification-only contact addresses retain their separate limits.

New passwords use a shared policy of 10–50 characters and must fit bcrypt's 72-byte input limit. Login accepts passwords up to 50 characters and the same byte limit; existing hashes remain stored, but accounts with longer passwords must use password recovery to set a supported password.

The `users.email` column expands to 320 characters. Its rollback checks for addresses longer than 100 characters and refuses to narrow the column rather than truncating data.

## Wiki acceptance-criteria updates

- **US-AUTH-01 (Issue #39):** change the maximum account email length from 100 to 320 characters. Password creation must accept 10–50 characters and reject UTF-8 inputs exceeding bcrypt's 72-byte limit. Login must reject passwords longer than 50 characters or 72 UTF-8 bytes.
- **US-AUTH-03 (Issue #41):** use the same 320-character account email limit and 10–50 character new-password rule, including the bcrypt byte limit. Password recovery is the path for users whose existing password exceeds the login input limit.
- Apply the same account-email and new-password rules to administrator-created doctor accounts and self-service account email edits. These are implementation consistency requirements; notification contact emails are out of scope.
