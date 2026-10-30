# US-ADM-51 — Configure Administrative Notification Settings

## Implementation

- Added an administrator-protected settings page linked from the notification dashboard.
- Reused the existing notification delivery switch and Meta WhatsApp Cloud API, Resend, and Inalambria Express environment configuration. The page reports configured and missing requirements without returning environment variable names or values.
- Distinguished delivery being disabled, provider configuration being incomplete, and provider connectivity being unverified. Credential presence is never labeled as a successful connection.
- Kept this page read-only because provider credentials are deployment environment settings and the application has no supported operational-settings persistence or reliable shared provider health checks.
- Kept patient-specific channel preferences separate. The page does not read or update those preferences, change notification rules, or modify historical notification records.
- Added Spanish responsive channel cards, safe status text, and a clear note explaining how operators change deployment configuration.
- No schema or dependency changes were required.

## Acceptance Criteria Notes

- Configuration retrieval, administrator protection, responsive rendering, and secret-value exclusion are implemented.
- Configuration editing and connection testing remain unavailable because the current architecture has no safe settings editor or reliable provider health-check APIs. The UI does not simulate these operations.
- Patient preference invariants remain enforced by the existing patient preference service and are not modified by this read-only feature.

## Verification

Automated service and authorization tests, the settings Playwright/axe-core flow, ESLint, and Prettier checks are recorded in the implementation report after execution.
