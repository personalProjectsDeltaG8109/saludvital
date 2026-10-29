# US-ADM-41 — View WhatsApp and Chatbot Overview

## Implementation

- Reused the existing administrator WhatsApp routes and protected both the page and JSON endpoint with the shared administrator authorization middleware.
- Reused the shared administrator sidebar and menu controller so WhatsApp navigation, active-page styling, and mobile open/close behavior match the Dashboard and other administrator pages.
- Added a responsive Spanish overview with six keyboard-navigable sections, daily conversation activity for 7 or 30 calendar days, WhatsApp request statuses, recent requests, persisted notification delivery events, and a limited message metadata preview.
- Activity, request, and delivery metrics come from persisted `WhatsAppConversation`, `WhatsAppAppointmentRequest`, and WhatsApp-channel `Notification` records. Date ranges use inclusive `America/Bogota` calendar days. The interface does not show comparison percentages because no comparable historical calculation was defined.
- Configuration completeness uses the existing environment-presence check and is labeled separately from the unverified operational connection state; no provider health-check result is available.
- Queries use bounded recent-record limits and explicit projections. Message content, notification payloads, recipient addresses, provider identifiers, credentials, and error details are excluded from the response.
- Provider configuration is represented only by safe presence checks. The summary labels the operational connection as unverified and shows local configuration completeness separately; the sidebar also distinguishes unknown status from a successful or failed connection.
- Added loading, empty, unavailable, retry, and error feedback. On wide screens, the dashboard places charts and lists in the main column and keeps chatbot status and the safe conversation preview in a dedicated side column; these sections stack on smaller screens.

## Existing limitations

- The project has no chatbot runtime health check, flow-definition model, or persisted flow catalog. The interface reports chatbot status and flow availability as unknown or unavailable rather than supplying sample values.
- WhatsApp template data consists of configured Meta template names for existing notification categories. The application cannot retrieve provider approval or delivery status, and this view does not reveal identifiers or allow editing.
- WhatsApp message records contain message content, but this overview intentionally returns only direction, message type, processing status, timestamp, and the linked patient's display name. Full conversation review is outside this story.
- The provider configuration status reports whether local required settings are present; it does not verify that Meta is reachable or that the credentials work.
- No database schema or dependency changes were needed.

## Verification

- `npm test -- --runInBand tests/unit` — passed, 57 suites and 434 tests.
- `node tests/e2e/admin-whatsapp.e2e.js` — passed. The flow verified loading and error/retry states, changed the activity period, navigated tabs by keyboard, toggled the mobile sidebar, and checked the full summary at widths from 320 to 1440 pixels.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `git diff --check` — passed.
- `npm test -- --runInBand tests/integration/app.test.js` — unable to run in this environment: Supertest could not open its local listener and returned `EACCES` for the existing integration suite. Administrator middleware remains applied to both WhatsApp routes; the HTTP authorization assertions were added to that suite but could not execute here.
