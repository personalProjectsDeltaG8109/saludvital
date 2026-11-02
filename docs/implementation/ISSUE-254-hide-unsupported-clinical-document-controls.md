# ISSUE-254 — Hide Unsupported Clinical Document Controls

## Scope

Remove the document metric and document detail tab from the patient clinical-history page while consultation document storage and associations are unavailable. Preserve all stored clinical data and keep supported clinical-order details visible under Treatments.

## Data Review

- The clinical-history service retrieves consultations, diagnoses, doctors, prescriptions, and prescription items.
- No consultation document model, storage relation, or query projection exists.
- `medical_orders` is persisted on consultations and is clinical information, not a stored document; it remains visible under Treatments.
- No schema or data migration is needed.

## Implementation

- Removed the unsupported documents summary card and detail tab/panel.
- Removed the unused document count and preview-only document labels.
- Kept persisted medical orders under the Treatments tab.
- Added unit and Playwright coverage for document-control absence, clinical search and filters, keyboard tabs, responsive layouts, and axe-core.
- Confirmed the existing US-PAT-05 criteria already limit documents to supported persisted data; no Wiki criteria change was needed.

## Verification

- `npm run format` — passed.
- Required targeted Prettier write command — passed.
- `npm run test -- --runInBand` — passed: 107 suites, 785 tests.
- `npm run lint` — passed.
- `npm run css:build` — passed; generated CSS output was restored because no Tailwind input changed.
- Targeted Prettier check for all changed implementation and test files — passed.
- `npm run format:check` — reports the pre-existing formatting issue in `docs/userStories/userStories.md`; that unrelated Wiki table was left unchanged.
- `npm run test:e2e` — passed, including search by doctor, specialty, and date; all three filters; keyboard tab interaction; responsive widths of 375, 760, 768, 1024, and 1440px; and axe-core with no violations.
- `git diff --check` — passed.
