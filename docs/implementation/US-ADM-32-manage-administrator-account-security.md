# US-ADM-32 — Manage Administrator Account Security

## Implementation

- Reused the existing email-based password recovery flow from the profile Security section. The current application does not provide an authenticated current-password change operation, so this story does not add a second password workflow or unsupported controls.
- Added a safe verified/unverified email indicator to the administrator profile projection. Only a boolean is returned; verification timestamps and tokens remain private.
- Administrator password resets now create an audit event in the same transaction as the password hash update and reset-token consumption. The event contains no password, hash, reset token, or submitted values; audit persistence failure prevents the reset transaction from committing. Other account roles keep their existing reset behavior.
- Kept the existing bcrypt policy, one-time reset token validation, session revocation, and sign-out behavior.

## Validation

- Unit tests cover safe profile security information, successful password-reset auditing, sensitive-data exclusion, audit failure propagation, and session revocation behavior.
- Apply no database migration; the existing schema and password-reset infrastructure support this story.

## Supported-feature limitation

The application supports password recovery by verified email but has no in-session password change or multi-factor authentication. The Security section exposes the existing recovery action and does not invent those features. The current acceptance criteria already describe this conditional behavior and need no change.
