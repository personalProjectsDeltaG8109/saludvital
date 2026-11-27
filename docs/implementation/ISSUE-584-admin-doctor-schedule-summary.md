# Issue #584 — Make Doctor Schedules Easier to Read

## What changed

- The administrator doctor details page now groups active availability into one row per weekday and shows each work interval beside that day.
- Future schedules and inactive or expired schedules are shown in separate expandable sections.
- Schedule periods use the application's Colombia calendar date and keep their existing database records unchanged.
- The layout adapts to narrow screens, and the expandable sections work with the keyboard.

## Verification

- `npm run format` and the repository's Prettier write command completed; `npm run format:check` passed.
- `npm run lint` passed.
- `npm run css:build` passed. Its generated `public/css/app.css` output was restored because the feature uses the existing standalone administrator stylesheet.
- `npm.cmd test -- --runInBand tests/unit` passed: 131 suites and 1,052 tests.
- `node tests/e2e/admin-doctor-details-schedule.e2e.js` passed. It checked 320, 390, 760, 1,024, and 1,440 pixel widths, keyboard expansion, and axe WCAG A/AA checks for the schedule section.
- The full Jest run had 145 suites pass and 16 MySQL suites fail (76 tests). MySQL denied access to the empty test username in this isolated worktree.
- `npm run test:e2e` stopped at application startup because the same MySQL credentials were unavailable. The focused doctor schedule browser test passed independently.

## Scope

This change applies only to the schedule shown on an administrator's doctor details page. It does not change the doctor's own profile, appointment data, schedule creation, or the database schema.
