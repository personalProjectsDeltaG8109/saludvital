# Issue #299 — Enable Live Search in the Administrator Specialty Catalog

## Implementation

- Added a 300 ms debounce to the existing specialty-name search field and reused the protected specialty catalog endpoint.
- Search resets pagination to page one and preserves the selected status and page size.
- Aborted superseded requests and guarded rendering by request ID so a delayed response cannot replace newer results.
- Kept the existing Buscar button in this change; removing redundant catalog search buttons remains a separate checklist item.
- Added browser coverage for live search, preserved filters, page reset, empty/error results, and out-of-order responses.

## Verification

- `npm run format` — passed; no unrelated formatting changes were produced.
- The repository's scoped Prettier write command — passed.
- `npm test -- --runInBand` — passed (113 suites, 866 tests).
- `npm run lint` — passed.
- `npm run css:build` — passed.
- `npm run format:check` — passed.
- `npm run test:e2e` — passed, including specialty live-search and available accessibility checks.
- `git diff --check` — passed.
