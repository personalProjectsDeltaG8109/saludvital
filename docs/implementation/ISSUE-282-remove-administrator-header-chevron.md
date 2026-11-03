# Issue #282 — Remove the Decorative Chevron from Administrator Headers

## User story

As an authenticated administrator, I want decorative header controls removed when they do not perform an action so that the interface does not imply unavailable functionality.

## Acceptance criteria

1. The decorative chevron is removed from the shared administrator header and custom Dashboard and WhatsApp headers.
2. The persisted profile photo, name, and role remain visible.
3. CSS used only by the chevron is removed, including its mobile selector.
4. Header alignment remains correct across responsive widths.
5. No menu behavior or unrelated navigation is introduced.
6. Tests verify the chevron is absent and identity remains rendered.
7. No schema or dependency change is needed.

## Implementation

- Removed the non-interactive chevron from the shared shell and custom Dashboard and WhatsApp header markup.
- Removed the chevron-only CSS rule and simplified the mobile selector.
- Kept the account photo, saved name, verified role label, and existing layout behavior.
- Added rendered-view and responsive browser assertions. No database or dependency change was needed.

## Verification

- Focused Jest suites: 2 suites and 8 tests passed.
- Full Jest suite: 113 suites and 862 tests passed.
- Administrator profile browser flow passed at mobile, tablet, and desktop widths, including the chevron absence assertion.
- Full Playwright E2E suite passed, including available axe-core checks.
- `npm run format`, the required targeted Prettier command, `npm run lint`, `npm run format:check`, `npm run css:build`, and `git diff --check` passed.

## Limitations

The account identity chip remains informational; no account dropdown behavior was added.
