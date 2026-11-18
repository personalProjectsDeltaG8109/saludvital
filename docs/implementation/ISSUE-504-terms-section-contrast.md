# Issue #504 — Improve Terms Number Contrast

## Change

- Darkened the section number text on the terms page while keeping the existing badge background and icons.
- The text and background now have a 5.05:1 contrast ratio, above the 4.5:1 minimum.
- Added a browser check that confirms all eight section numbers pass axe-core's color contrast rule.

## Verification

- Formatting, lint, and CSS build passed.
- Jest passed: 154 suites and 1,187 tests.
- Playwright passed, including the terms contrast check and responsive and accessibility flows.
