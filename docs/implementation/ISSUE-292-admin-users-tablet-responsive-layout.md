# Issue #292 — Administrator Users Tablet Layout

## Problem

The administrator sidebar remains fixed above 760px, reducing the width available to the users page. The page previously kept its multi-column account cards until the sidebar switched to its mobile drawer at 760px, causing cards and controls to overflow around 761–762px.

## Implementation

- Added an intermediate tablet layout from 761px through 960px, matching the fixed-sidebar content width.
- Reflowed user cards into a readable two-column arrangement with identity and actions on separate rows.
- Kept the search field full-width and placed role and account-state filters in a two-column grid.
- Added a Playwright regression test at mobile, sidebar-transition, tablet, and desktop widths. The test checks document overflow, card clipping, and overlap.
- No route, data behavior, schema, or dependency changed.

## Verification

- Focused browser test: `node tests/e2e/admin-users-responsive.e2e.js`.
- Full project checks are listed in the linked pull request.
