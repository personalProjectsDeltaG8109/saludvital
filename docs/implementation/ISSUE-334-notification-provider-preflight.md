# Issue #334 — Notification Provider Readiness Preflight

## Implementation

- Corrected the administrator settings service so Meta WhatsApp send readiness includes the confirmation, reminder, reschedule, and cancellation template names, in addition to its API and sender settings.
- Separated local webhook prerequisites (Meta app secret and verification token) from outbound WhatsApp send readiness. The UI continues to call provider connectivity unverified because environment values alone do not establish a live connection.
- Placeholder values such as `your_*`, `replace_with_*`, and `@example.*` are now treated as unconfigured.
- Added chatbot runtime and identity verification readiness to preflight; the bot requires a real `WHATSAPP_VERIFICATION_SECRET` for identity-gated patient actions and remains disabled in production by the existing runtime rule.
- Added `npm run notifications:preflight`, a local read-only check that reports provider readiness, missing environment variable names, the chatbot state, the global delivery switch, and external setup steps. It does not print environment values, contact providers, or send messages.
- Preserved `NOTIFICATION_DELIVERY_ENABLED=false` as the example/default state. Preflight does not enable delivery.
- No schema or dependency change was required.

## Current local readiness review

The local `.env` was inspected only for presence/placeholder state; secret values were not displayed. At the time of review, the four Meta appointment template names were missing, Meta webhook values were absent or placeholders, and the chatbot identity secret was a placeholder. Resend's required environment values were present. The Inalambria API key was absent or a placeholder. Automated delivery was disabled. These checks cannot verify whether credentials are valid, whether a sender/domain is approved, whether the Meta webhook is publicly reachable/subscribed, or whether the SMS account has Colombian routing/credit.

The WABA ID is optional metadata for this implementation and is not required to send messages. It is not a blocker for provider sending.

## Manual validation still required

- Confirm Meta templates are approved and match each event's expected variable ordering and language.
- Configure the public HTTPS webhook in Meta, subscribe to `messages`, and verify inbound messages and delivery callbacks in development.
- Verify the Resend sender domain/address and perform a controlled test to an authorized recipient.
- Confirm Inalambria Express credentials, account access, balance, and Colombia SMS enablement. The code sends asynchronously and saves the returned provider job/message reference, but does not poll the Express job-status endpoint; the app therefore does not know final handset delivery for SMS yet.
- Configure a non-placeholder `WHATSAPP_VERIFICATION_SECRET` before testing chatbot identity-gated booking, viewing, rescheduling, or cancellation.
- Enable automated delivery only in a controlled development environment after configuration and explicit test validation. Production activation remains a separate rollout decision.

## Verification

Run the focused provider settings unit test, provider preflight command, notification settings browser/accessibility check, project lint/format/test commands, and CSS build. Record the actual outcomes with the PR.
