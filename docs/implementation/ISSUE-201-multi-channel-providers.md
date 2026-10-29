# Issue 201 — Integrate Independent WhatsApp, Email, and SMS Providers

## Implementation

- Replaced appointment-notification Twilio adapters with independent Meta WhatsApp Cloud API, Resend transactional email, and Inalambria Express SMS adapters. The existing queue, preference routing, retries, and appointment notification history remain in use.
- Provider adapters use bounded request timeouts and provider-specific retry signals/error codes where available; raw provider error bodies are not stored.
- Added Meta webhook challenge and raw-body HMAC verification, provider-scoped message idempotency, incoming/outgoing message persistence, and delivery callback recording. Provider acceptance remains distinct from `sent`, `delivered`, `read`, and `failed` callback states.
- Added a development chatbot runtime using a versioned, published default flow. It supports appointment booking, viewing, rescheduling, and cancellation through existing appointment services. Interactive lists and equivalent numbered/text replies are accepted.
- Before patient-specific actions, the bot sends a one-time code to the patient's already verified email. Codes are HMAC-hashed in the existing verification table, expire after 10 minutes, have attempt limits and per-patient/per-conversation cooldowns, and are not persisted in WhatsApp message content. Appointment writes retain existing business checks, transactions, duplicate prevention, and audit events.
- Added configurable WhatsApp message-content retention with a 30-day maximum and a separate hourly cleanup of expired identity sessions and verification codes. Historical audit records are not removed by this policy.
- Added bounded network timeouts, server-only credentials, safe provider errors, and manual test scripts that refuse to send in production.
- Added a reversible migration for conversation runtime state, callback delivery status, and the singleton runtime flow pointer; the migration seeds one published default menu flow. Existing drafts remain non-executable, and no administrator draft activation UI was added.

## Configuration and rollout

- Copy the provider placeholders from `.env.example` into deployment secret storage. Do not commit real values.
- Configure Meta phone number ID, access token, app secret, webhook verification token, Graph API version, and the three approved appointment template names/language. Subscribe the Meta app to the `messages` webhook field and use the public `/api/whatsapp/webhook` HTTPS endpoint.
- Configure Resend API key and a verified sender address. Resend handles appointment-notification emails and chatbot identity codes; existing authentication and account emails still use the existing SMTP outbox.
- Configure Inalambria API key for Colombian `+57` mobile recipients.
- Required environment names are `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_API_VERSION`, `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `META_WHATSAPP_TEMPLATE_LANGUAGE`, and the three `META_WHATSAPP_*_TEMPLATE_NAME` values; `RESEND_API_KEY` and `RESEND_FROM_EMAIL`; and `INALAMBRIA_API_KEY`. `META_WHATSAPP_BUSINESS_ACCOUNT_ID` is optional metadata and is not used to send messages.
- Chatbot identity verification also requires `WHATSAPP_VERIFICATION_SECRET`. The bot can be disabled with `WHATSAPP_CHATBOT_ENABLED=false`; message retention is set by `WHATSAPP_MESSAGE_RETENTION_DAYS` and is capped at 30 days.
- Run migrations and test sends only in development. `NOTIFICATION_DELIVERY_ENABLED` remains `false` by default, and the chatbot refuses to auto-respond in production. Do not enable production delivery until the owner has verified each provider's sandbox/test recipient, templates, and webhook callbacks.

## Verification and limitations

- Jest provider, webhook, chatbot safeguard, admin WhatsApp, worker retry, and HTTP authorization tests are included. Validate actual Meta callbacks and vendor delivery in provider-owned test environments; no live provider request is made by the application test suite.
- The Meta status callbacks update notification delivery state. Inalambria's current asynchronous response supplies a job identifier but this implementation does not yet consume its completion callbacks. Resend acceptance is not equivalent to inbox delivery.
- The chatbot executes only the seeded supported default booking workflow. Administrator-authored flow drafts remain inactive until a separately reviewed runtime/activation design exists.
- A verified patient email is required for identity verification. The integration does not collect clinical history and deletes/empties message content after the configured period, capped at 30 days.
- Automated notification delivery is globally disabled until explicitly enabled. Provider secrets, IDs, and live service health are never rendered in the administrator browser.
