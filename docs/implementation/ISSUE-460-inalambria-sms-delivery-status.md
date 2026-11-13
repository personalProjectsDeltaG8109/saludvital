# Issue #460 — Track Final SMS Delivery Status from Inalambria REST

## Implementation

- Replaced the SMS send adapter's Inalambria Express job API with the documented REST `POST /mtmessage` endpoint. Colombian numbers are sent in the provider's 57-prefixed format and the SMS body is limited to the provider's recommended 500 characters.
- Reused the existing notification queue and `Notification` fields. The provider transaction number is stored in `provider_message_id`; the existing notification ID is sent as `CustomMessageId` to correlate callbacks that arrive before the transaction number is saved. No migration or new table was needed.
- Added the public callback endpoint `/api/inalambria/sms/status`. It requires HTTP Basic credentials from the server environment, validates the provider's one-result payload, and accepts only `DELIVERED_TO_HANDSET` and `NO_SUCCESS` as final statuses.
- Callback processing matches the provider transaction and normalized destination, with the internal notification reference as a race-safe fallback. Updates run in a database transaction. Repeated callbacks are harmless, and an existing final result cannot be replaced by a later conflicting callback.
- Provider acceptance remains the existing application status `Sent`; only callback-confirmed results set `provider_delivery_status` to `delivered` or `failed`. The callback contract does not expose a provider event timestamp, so the app stores callback receipt time. Failure details use a fixed safe message; raw callback content and provider error text are not logged or persisted.
- The administrator settings and preflight now check for REST username/password without revealing their values. The test-send script reports the returned transaction reference instead of calling it a job ID.

## Configuration and external steps

- Set `INALAMBRIA_REST_USERNAME` and `INALAMBRIA_REST_PASSWORD` in the server environment. Do not put these credentials in source control or browser code.
- Ask Inalambria support to enable the account status webhook for the deployed public HTTPS URL ending in `/api/inalambria/sms/status`, authenticated with HTTP Basic using the account credentials. Inalambria documents that account callbacks for `/mtmessage` require provider-side enablement.
- After enablement, send a controlled development SMS to an authorized test recipient and verify that a provider callback updates that same notification to delivered or failed. This application test suite does not send live messages.
- Until callback setup is confirmed, a REST-accepted SMS remains pending for final delivery in SaludVital. Do not infer delivery from HTTP acceptance or a transaction number.

## Verification

- Focused Jest and Supertest: 9 suites passed, 150 tests passed.
- Full Jest: 144 suites passed, 1,128 tests passed.
- `npm run lint`: passed.
- `npm run format`: passed; the requested explicit Prettier write command and `npm run format:check` also passed.
- `npm run css:build`: passed. The pre-existing local `public/css/app.css` was restored after the build to preserve the user's change.
- `npm run test:e2e`: passed, including Playwright browser and axe-core accessibility checks.
- Provider account enablement and one real callback remain external manual checks; no live send was made during implementation.

## Provider contract

The integration follows Inalambria's published developer documentation for `POST /mtmessage`, `TransactionNumber`, `CustomMessageId`, account webhook authentication, callback retry behavior, idempotency key fields, and final status names. See [Inalambria SMS and RCS API documentation](https://www.inalambria.com/desarrolladores/).
