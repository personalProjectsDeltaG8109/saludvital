# US-ADM-44 — Monitor WhatsApp Messages and Delivery Status

## Acceptance criteria

1. Only authenticated administrators can view WhatsApp delivery records.
2. Records and statuses come from persisted notification data.
3. The page summarizes the persisted WhatsApp notification counts by status.
4. Rows show the event type, masked recipient, status, and recorded activity time.
5. Administrators can combine inclusive Bogotá date filters with a supported persisted status.
6. Results use bounded server-side pagination and stable ordering.
7. Failed records show a safe diagnostic category and numeric provider code when available.
8. Credentials, payloads, raw errors, provider identifiers, and unmasked phone numbers are excluded from the response.
9. The interface does not claim final handset delivery without provider confirmation.
10. The Spanish interface follows the existing responsive SaludVital WhatsApp layout.
11. Existing notification models, associations, authorization, and dependencies are reused.

## Implementation

- Added a protected `deliveries` tab to the existing WhatsApp page and API.
- Reused persisted `Notification` records filtered to the WhatsApp channel. Status totals and the filtered list are queried from the database; list retrieval is paginated and ordered by update time and ID.
- Added date and status validation and combined filters using the existing Sequelize query layer and `America/Bogota` calendar boundaries.
- Added a minimal record projection and maps raw errors to safe Spanish diagnostic categories. Only a numeric provider error code may be included.
- Reused the existing notification status enum. `Sent` is presented as “Aceptado por proveedor” because the current integration has no delivery-status callback.
- No schema, dependency, or provider integration change was needed.

## Limitations

- The current Twilio integration stores a successful API submission as `Sent`; it does not persist provider delivery callbacks. Final recipient delivery therefore cannot be reported.
- The `WhatsAppMessage` model has no message-ingestion or status-callback producer in the current code. This monitor covers persisted WhatsApp appointment notifications and cannot report chatbot conversation message delivery.
- The supplied image depicts chatbot flow editing rather than message delivery monitoring. This implementation follows the written US-ADM-44 scope and the shared WhatsApp design.

## Verification

- `npm test -- --runInBand tests/unit/adminWhatsAppService.test.js tests/unit/adminWhatsAppView.test.js tests/integration/app.test.js` — passed: 3 suites, 70 tests.
- `npm test -- --runInBand tests/unit` — passed: 58 suites, 446 tests.
- `node tests/e2e/admin-whatsapp.e2e.js` — passed: WhatsApp navigation, delivery filters, masked recipient, and responsive widths from 320 to 1440 pixels.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `git diff --check` — passed.
