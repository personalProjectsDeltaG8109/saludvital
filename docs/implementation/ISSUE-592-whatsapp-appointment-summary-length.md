# Issue #592 — Keep WhatsApp appointment summaries within the message limit

## Problem

When a patient had several upcoming appointments, SaludVital combined every appointment and the main menu into one WhatsApp message. Long, valid specialty names could make that message exceed WhatsApp's 1,024-character text limit, so the provider rejected the reply.

## What changed

- Reused the same 1,024-character limit in the WhatsApp sender and chatbot summary builder.
- Split appointment summaries into readable messages with a heading on the first message and continuation headings on later messages.
- Sent the main menu after the complete summary so patients can continue the conversation.
- Kept the existing empty-result response, Spanish confirmed status, appointment lookup, and identity verification.
- Added a test with ten appointments and long specialty names to check message size, appointment inclusion, and the final menu.
- No database or provider configuration changes were needed.

## Verification

- `npm.cmd test -- --runInBand tests/unit/whatsappChatbotRuntime.test.js` — passed: 1 suite and 25 tests.
- `npm.cmd test -- --runInBand` — passed: 163 suites and 1,295 tests.
- `npm.cmd run lint` — passed.
- `npx.cmd prettier --check` on the changed source, test, and note files — passed.
- No live WhatsApp message was sent; the test uses the existing mocked provider adapter.
- Playwright and the CSS build were not run because this change does not modify a page or stylesheet.

## Limitation

This check confirms that the application creates messages within the limit enforced by its sender. Actual delivery still depends on a configured Meta account and provider acceptance.
