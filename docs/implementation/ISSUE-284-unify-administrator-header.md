# Issue #284 — Unify the Administrator Header Across Admin Pages

## Implementation

- Reused the shared `adminTopbar` mixin on all administrator pages, including Dashboard, WhatsApp, and Audit, removing the duplicated Dashboard and WhatsApp header markup.
- Added optional notification destination, accessible label, and unread-count parameters to the shared mixin. Existing pages retain their notification-page link; Dashboard and WhatsApp preserve their existing destinations and counts.
- Kept account identity, saved profile photo, mobile brand, and sidebar control in the shared component. No database or dependency changes were needed.
- Added view and browser assertions for the shared topbar, notification links, and alert counts.

## Verification

- Focused Jest: 2 suites, 8 tests passed.
- Full Jest: 113 suites, 862 tests passed.
- Targeted administrator profile and WhatsApp Playwright flows passed; shared header and preserved notification destinations were verified.
- Full `npm run test:e2e` passed, including available responsive and axe-core checks.
- `npm run format`, the required targeted Prettier command, `npm run lint`, `npm run format:check`, `npm run css:build`, and `git diff --check` passed.

## Limitations

Notification counts remain available only on Dashboard and WhatsApp, where the existing services provide those aggregates. Other admin pages continue to link to the notification dashboard without an invented count.
