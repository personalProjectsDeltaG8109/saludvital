# Issue #560 — Keep the administrator user editor on the selected account

## Problem

When an administrator opened one account and then quickly opened another, the first request could finish last and replace the current form. Municipality results could also belong to a department that was no longer selected.

## What changed

- The editor now ignores account details and errors from requests that are no longer current.
- Closing or reopening the editor invalidates its older requests.
- Municipality results are applied only when they match the selected account, editor, and department.
- Added browser checks that deliberately delay responses and complete them out of order.
- Stabilized the consultation browser test by releasing its delayed response only after confirming the loading state. This removes a timing-based test failure without changing consultation behavior.
- No database change or new dependency was needed.

## Verification

- `npm run format` passed.
- The repository Prettier write command passed without unrelated formatting changes.
- `npm test -- --runInBand` passed: 158 suites and 1,229 tests.
- `npm run lint` passed.
- `npm run format:check` passed.
- `npm run css:build` passed; generated CSS was restored because no style source changed.
- `npm run test:e2e` passed, including administrator user editing, delayed-response handling, consultation loading, and accessibility checks.
- `git diff --check` passed.

## Work status

Implemented on `fix/560-admin-user-editor-response-race`, based on the latest verified `develop`. The pull request targets `develop`.
