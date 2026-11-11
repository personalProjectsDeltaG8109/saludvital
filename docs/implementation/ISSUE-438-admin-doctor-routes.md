# Issue #438 — Separate Administrator Doctor Routes

## Scope

Moved administrator doctor pages and doctor API endpoints from the main administrator router into `adminDoctorRoutes.js`. The parent router supplies the existing authentication, administrator role, and header identity middleware in its original order.

Route paths, service calls, response handling, and templates are unchanged. Other administrator route groups remain in the original module for a later focused extraction.

## Verification

- `tests/integration/app.test.js`: 80 tests passed.
- Full Jest: 139 suites and 1,094 tests passed.
- ESLint and Prettier checks passed.
- Full Playwright browser and accessibility suite passed.
- No database schema or dependency changes.
