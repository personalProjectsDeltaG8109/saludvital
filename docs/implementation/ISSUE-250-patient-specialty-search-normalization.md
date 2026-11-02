# ISSUE-250 — Normalize Patient Specialty Search

## Scope

Fix specialty search in the patient appointment booking flow so users can find real active specialties despite differences in accents, letter case, or harmless whitespace.

## Acceptance Criteria

1. Search matches persisted specialty names and descriptions without case or diacritic sensitivity.
2. Leading, trailing, and repeated whitespace does not prevent an otherwise valid match.
3. Search results continue to come only from the protected specialty endpoint; no example specialties are added to production code.
4. Selecting a filtered specialty continues the existing booking flow.
5. Empty results retain the existing Spanish feedback, and specialty text remains safely escaped.
6. Browser tests cover accent normalization, whitespace normalization, empty results, and selection.
7. No database, endpoint, or dependency changes are introduced.

## Verification

Pending implementation and project checks.
