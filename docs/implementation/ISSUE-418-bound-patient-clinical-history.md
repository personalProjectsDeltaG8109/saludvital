# Issue #418 — Bound Patient Clinical History Retrieval

## Related user story

US-PAT-05 — View Diagnoses and Clinical History (#48).

## Implementation

- Added a newest-first clinical-history summary page with a default page size of 10 and supported sizes of 10, 20, and 50.
- The summary query selects only consultation dates, doctor/specialty identification, and correlated diagnosis/treatment counts. It does not load clinical notes, diagnosis text, or prescription content into the initial page.
- Added an authenticated patient detail endpoint. The query requires a completed consultation associated with the patient resolved from the signed-in account; inaccessible and missing records receive the same not-found response.
- Detail projections include only information rendered by the existing read-only clinical-history view. Documents and unrelated account/patient data remain excluded.
- The browser requests detail data only when the patient selects a summary card and inserts stored text with `textContent`.
- Added accessible pagination controls and preserved the existing search and diagnosis/treatment filtering for the currently loaded page.
- No migration or dependency was added.

## Verification

- Focused Jest service, view, and route tests cover bounded queries, stable ordering, selected fields, ownership constraints, identifier validation, and route authorization middleware.
- Playwright plus axe-core covers detail loading, existing search/filter controls, keyboard tabs, and viewport widths from 375px to 1440px.
- MySQL performance validation with a large synthetic history remains pending; unit tests mock Sequelize models.
