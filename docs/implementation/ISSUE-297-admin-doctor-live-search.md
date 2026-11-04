# Issue #297 — Enable Live Search in the Administrator Doctor Directory

## Implementation

- Added a 300 ms debounce to the existing doctor-name and email search field. Search continues to use the protected directory endpoint and existing specialty and status filters.
- Changing the search resets pagination to page one. Search requests include the selected filters and use `AbortController` plus request IDs so slower responses cannot replace newer results.
- Removed the redundant search button and its form-submit handler. Search and filter changes are now the only triggers, with typing using the live-search debounce.
- Kept the shared administrator top bar used by Dashboard and Users and Roles; the doctor page already rendered the same `adminTopbar` component.
- Extended the doctor directory browser test to verify removal of manual submit controls, live search, filter preservation, page reset, and stale-response handling.

## Verification

- `npm run format` — passed; no unrelated formatting changes were produced.
- The repository's scoped Prettier write command — passed.
- `npm test -- --runInBand` — passed (113 suites, 866 tests).
- `npm run lint` — passed.
- `npm run css:build` — passed.
- `npm run format:check` — passed.
- `npm run test:e2e` — passed, including the administrator live-search regression, responsive layouts, and available axe-core checks.
- `git diff --check` — passed.
