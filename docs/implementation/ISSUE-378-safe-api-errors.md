# ISSUE-378 — Safe API Request Errors

- GitHub issue: [#378 — Handle API request errors with safe JSON responses](https://github.com/personalProjectsDeltaG8109/saludvital/issues/378).
- Branch: `fix/378-safe-api-errors`.

## Problem and Change

- The shared error handler previously rendered the HTML 500 page for malformed API JSON and oversized bodies, even when Express supplied 400 or 413. It also logged the raw error message and development stack; parser messages may contain submitted text.
- `/api` errors now return a generic Spanish JSON message with the applicable 4xx status or 500 for unexpected failures. Unknown `/api` paths return a JSON 404. These responses cannot be cached.
- Browser navigation still uses the existing HTML error page. The page displays the actual status and a generic heading for request errors; its existing 500 presentation remains for unexpected failures.
- Server diagnostics now contain only the HTTP method, API/page scope, status, and a controlled category. Request paths, error messages, bodies, and stacks are not logged by this handler.
- No database, dependency, authentication, or business-rule change was required.

## Verification

- Baseline: `tests/integration/errorHandler.http.test.js` passed 9 tests before adding regressions.
- The new malformed JSON, oversized body, and unexpected API error tests initially failed against the original handler.
- After the fix, the focused HTTP suite passed 14 tests, including unknown API 404 and browser request-error status cases.
- Full Jest run after rebasing on the latest `develop`: 124 suites and 992 tests passed. An earlier run found one older assertion that expected raw error text in the log; that assertion was updated to verify safe diagnostics.
- `npm run lint`: passed.
- `npm run format` and the repository's targeted Prettier write command: completed with files unchanged.
- `npm run format:check`: passed.
- `npm run css:build`: passed; generated CSS did not change.
- `npm run test:e2e`: exited 0; browser flows and accessibility checks reported PASS.
- `git diff --check`: passed; branch diff contains only this issue's error handling, tests, and documentation.

## Workflow Status

- Local implementation and review are complete; focused commits are recorded on the feature branch.
- Branch was rebased onto the latest remote `develop` before publication.
