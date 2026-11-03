# Issue #276 — Remove the Unused Administrator Global Search

## Scope

Remove the duplicate global search field from administrator page headers. Keep each supported page's local search and filters.

## Implementation

- Removed the shared search form from the administrator topbar and removed its unused page-specific copies from Dashboard and WhatsApp.
- Removed the CSS for the deleted control and aligned the notification control with the right side of the topbar.
- Removed JavaScript that copied text between the topbar search and local list filters. Local search forms and URL-provided search values remain in place.
- Updated browser-flow fixtures to use the revised header and assert that local search fields remain available.
- No database, dependency, or business-rule changes were needed.

## Verification

- `npm run format` — passed.
- The requested targeted Prettier write command — passed; targeted files were already formatted.
- `npm test -- --runInBand` — 113 suites and 858 tests passed.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `npm run css:build` — passed.
- `npm run test:e2e` — passed, including local appointment, specialty, and schedule searches and responsive checks. An initial run exposed a test-fixture-only width issue because its textual placeholder did not match the real icon button; the fixture was corrected and the full run then passed.
