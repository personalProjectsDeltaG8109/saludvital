# Issue #436 — Consolidate Account Email Base URL Validation

## Scope

The email outbox worker previously repeated `APP_BASE_URL` validation for verification and password reset links. Both links now use one validation function. Their paths and token query parameters remain unchanged.

The validator rejects missing or malformed URLs, unsupported protocols, embedded credentials, query strings, and fragments. Production still requires HTTPS. Password reset configuration is checked before existing reset tokens are changed.

No database schema, provider integration, or dependency changed.

## Verification

- Focused worker tests cover valid verification and reset links and reject invalid base URLs before changing reset tokens.
- Full project checks and their results are recorded in the related pull request when run.
