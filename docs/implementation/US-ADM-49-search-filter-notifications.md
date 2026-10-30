# US-ADM-49 — Search and Filter Notifications

## Implementation

- Reused the protected administrator notification dashboard, persisted `Notification` and `Patient` records, and existing page-size and response conventions. No table or dependency was added.
- Combined channel, processing/provider status, search, date range, and page filters in parameterized Sequelize conditions. The summary metrics and result count use the same active filters.
- Search covers a patient's linked name, stored recipient address, supported notification type labels/keys, and persisted appointment date/time fields when available. It does not search or return message payloads or clinical free text.
- Added preset 7/30/90-day ranges and custom inclusive calendar dates using `America/Bogota`; custom ranges are limited to 366 days. Invalid, partial, reversed, and oversized ranges are rejected.
- Added the “Aceptada por el proveedor” status for application `Sent` records without final Meta delivery confirmation. Delivery, failure, and pending filters retain the persisted application/provider distinction.
- Search and filter changes return to page one. Pagination requests retain the channel, status, search, and selected date range. The existing UI renders message previews as text.
- The “Sistema” tab remains visibly unavailable because the persisted notification channel enum contains only Email, WhatsApp, and SMS. Subject text and full message content are not persisted for reliable safe searching.

## Acceptance Criteria Notes

Criteria 1–2 and 6–20 are supported by the existing administrator guard, validated filters, bounded pagination, accessible Spanish controls, and tests. Criterion 3 is limited by the existing schema: the System channel is shown as unavailable and cannot produce records. Search uses only persisted, safe fields; unsupported subject/body searches are not fabricated.

## Verification

- Jest: `tests/unit/adminNotificationDashboardService.test.js` and `tests/integration/app.test.js` passed (2 suites, 88 tests).
- Playwright with axe-core: `node tests/e2e/admin-notifications.e2e.js` passed, including filter combinations, custom dates, pagination preservation, error/empty states, accessibility, and widths from 320px to 1440px.
- ESLint: `npm run lint` passed.
- Prettier: `npm run format:check` passed.
- A direct MySQL-backed service query using a combined custom range, channel, status, and search completed successfully with the current database (0 matching records).
