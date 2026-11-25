# Issue #566 - Show the correct notification provider

## Problem

The administrator notification screens used Meta labels for delivery updates from every channel. SMS delivery updates come from Inalambria. Email does not currently provide a confirmed delivery status.

## What changed

- Added one shared provider-status helper for the notification dashboard and detail view.
- WhatsApp delivery states are attributed to Meta; SMS delivery and failure states are attributed to Inalambria.
- Email remains unconfirmed unless the application adds a reliable delivery source.
- Summary counts and the delivered/failed filters now use only delivery states supported by each channel.
- Added service and browser checks for SMS, WhatsApp, and email status display.
- No database, provider integration, or dependency changes were needed.

## Verification

- Focused Jest: 2 suites and 43 tests passed.
- Full Jest: 159 suites and 1,243 tests passed.
- Notification browser test with axe-core: passed; checked the SMS list and detail, and responsive widths from 320 to 1440 pixels.
- Full `npm run test:e2e`: passed, including the notification screen, responsive layouts, and available axe-core checks.
- `npm run format`: passed; no unrelated formatting changes were made.
- Repository Prettier write command: passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run css:build`: passed; generated CSS was restored because no style source changed.
- `git diff --check`: passed.

## Work status

- Issue: [#566](https://github.com/personalProjectsDeltaG8109/saludvital/issues/566)
- Branch: `fix/566-notification-provider-labels`
- Pull request: pending creation after commits are published.
