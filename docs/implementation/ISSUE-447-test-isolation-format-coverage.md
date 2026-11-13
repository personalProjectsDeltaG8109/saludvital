# Issue #447 — Test Isolation and CI Formatting Coverage

## Implementation

- Added a scheduler startup boundary that skips email, notification, cleanup, retention, session, and no-show jobs when the application runs with `NODE_ENV=test`. Production and development still start the existing schedulers.
- Added unit coverage with mocked scheduler functions for test and development startup behavior. Existing worker, scheduler, and MySQL concurrency tests continue to cover their own behavior.
- Restricted the E2E server environment so provider credentials are explicitly blank and external notification delivery and the chatbot are disabled. The test database configuration remains available to the server.
- Expanded the CI Prettier check to include `src/**/*.js`, `public/js/**/*.js`, and maintained `public/css/**/*.css` stylesheets.
- Updated `.prettierignore` to exclude only generated `public/css/app.css`. Formatted the maintained CSS files without changing their declarations or visual rules.

## Verification

- Focused worker/scheduler tests: 4 suites, 18 tests passed.
- Full Jest: 140 suites, 1,096 tests passed.
- ESLint: passed.
- Expanded Prettier check: passed for application, module, test, view, browser, and hand-written CSS files.
- Tailwind CSS build: passed.
- Full Playwright E2E and axe-core flows: passed, exit code 0.
- `git diff --check`: passed.

No live provider request was made. No schema, provider behavior, or notification business rule changed.
