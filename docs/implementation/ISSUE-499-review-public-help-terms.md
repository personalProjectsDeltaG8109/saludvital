# Issue #499 — Review Public Help and Terms

## What changed

- Updated the public help page to explain the account, email-verification, password-recovery, and appointment flows that are present in SaludVital.
- Updated the terms to describe the academic demo, appropriate test data, and the appointment cancellation and rescheduling limits enforced by the application.
- Removed a fixed WhatsApp number from public error-page links. Public WhatsApp links now use `LOGIN_WHATSAPP_CONTACT_NUMBER` and are hidden when that setting is missing or invalid.
- Removed an appointment shortcut from the sign-in version of the not-found page so an unauthenticated visitor is not sent to a protected patient page.
- Added tests for the help and terms pages, optional WhatsApp contact links, and safe not-found navigation.

## Verification

- `npm.cmd run lint` — passed.
- `npm.cmd run format:check` — passed.
- Explicit Prettier write command for application, test, Pug, CSS source, and CI files — passed.
- `npm.cmd test -- --runInBand` — passed: 154 suites and 1,187 tests.
- `npm.cmd run css:build` — passed. The generated CSS was restored because this task did not change CSS source.
- `npm.cmd run test:e2e` — passed, including responsive browser flows and axe-core checks.
- `git diff --check` — passed; Git reported only line-ending notices.

## Limitations

- WhatsApp contact links appear only after the project owner configures the approved public number. This change does not test the provider connection or send a message.
- The help and terms pages describe the current demonstration behavior; a project owner should review legal wording before using the application beyond an academic demo.
