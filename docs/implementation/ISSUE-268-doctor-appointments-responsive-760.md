# Issue #268 — Doctor Appointment Cards at Tablet Widths

## Finding

Between 761 and 1100 CSS pixels, the desktop sidebar remains visible and reduces the appointment page's content width. The summary continued to use four columns, leaving too little room for each card and its label.

## Changes

- Changed the doctor appointment summary to two columns at the existing tablet breakpoint.
- Reduced card spacing and padding at that breakpoint while preserving the four-column desktop layout and the mobile layout.
- Added a Playwright browser check for 390, 760, 762, 768, 1024, and 1366 pixels. It checks card bounds, label clipping, page overflow, keyboard focus, and axe-core within the summary cards.
- Added the browser check to the existing `npm run test:e2e` command.
- No database, migration, dependency, or business-rule changes were needed.

## Verification

- Focused Playwright check: passed at all six viewport widths; summary-card axe-core and keyboard-focus checks passed.
- Full Jest: 113 suites passed, 857 tests passed.
- Full Playwright E2E suite: passed.
- `npm run format` and the explicit repository Prettier write command: passed with files unchanged.
- `npm run lint`: passed.
- `npm run css:build`: passed.
- `npm run format:check`: passed.
- `git diff --check`: passed.

## Known Existing Accessibility Findings

A full-page axe scan also reports low contrast in the patient initials and pagination button, and a non-focusable scrollable appointment table wrapper. These findings are outside the summary-card layout change and were not modified in this issue. The targeted summary-card axe scan passes.
