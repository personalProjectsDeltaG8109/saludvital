# Issue #472 — Protect Profile Photos and Remove Image Metadata

**Issue:** [#472 — Protect uploaded profile photos and image metadata](https://github.com/personalProjectsDeltaG8109/saludvital/issues/472)  
**Branch:** `feature/472-private-profile-photos`  
**State:** Implemented and verified; pull request pending

## Scope and approved access

Profile photos are private. An authenticated user can view their own photo. Patients can also view active doctor photos used by the patient-facing directory and booking flow. Doctors can view patient photos only when a persisted appointment links that patient to the authenticated doctor. Administrators can view photos referenced by profiles in the management area. Missing, malformed, and unauthorized photo requests use the same empty 404 response.

## Implementation

- New uploads are decoded and re-encoded as WebP outside the public static directory. The processing step applies image orientation, limits decoded pixel count and output size, and removes EXIF, GPS, and other embedded metadata.
- The existing `/uploads/profile-photos/<id>.<extension>` database and browser URL shape remains supported. A protected route intercepts it before Express static serving, verifies the authenticated role and existing profile/appointment relationship, and sends `private, no-store` responses.
- Legacy public files remain readable only through the protected route. They are sanitized in memory until migration is applied.
- `npm run photos:migrate-legacy` lists matching legacy files without changing them. `npm run photos:migrate-legacy -- --apply` writes and verifies private metadata-free copies before removing the public originals. Production changes require both `--apply` and the additional `--confirm-production` flag.
- No database schema change is required because the stored photo URL remains stable. No photo migration has been executed against existing project data.

## Verification

Tests cover supported image decoding, metadata removal, private storage, legacy migration dry-run/apply/failure behavior, role and relationship authorization, denied/missing responses, no-store headers, and direct/encoded legacy URL access before static serving.

## Verification results

- Focused profile photo and regression tests: **8 suites, 31 tests passed**.
- Full Jest suite: **149 suites, 1,147 tests passed**.
- `npm run format`: passed; the requested Prettier write command completed successfully.
- `npm run lint`: passed.
- `npm run css:build`: passed. The pre-existing local `public/css/app.css` was restored byte-for-byte and remains out of scope.
- `npm run test:e2e`: passed, including browser and axe-core accessibility checks.
- `npm run photos:migrate-legacy`: dry run reported 5 legacy files and made no changes. The apply mode was not run.
- `git diff --check`: passed.
