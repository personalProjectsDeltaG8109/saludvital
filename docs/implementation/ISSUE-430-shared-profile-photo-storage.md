# Issue 430 — Shared Profile Photo Storage

## Scope

Extract image decoding and file storage shared by patient, doctor, and administrator profile photos. Preserve each role's existing authorization, database updates, transactions, audit events, and user-facing validation behavior.

## Implementation

- Added `src/shared/services/profilePhotoStorageService.js` for JPG, PNG, and WEBP data URL validation, image signature checks, bounded file storage, and removal of files inside the managed profile-photo directory.
- Updated patient, doctor, and administrator profile services to use the shared storage functions.
- Removed the administrator-owned `doctorPhotoService.js`; doctor and patient services no longer depend on an administrator module for shared file handling.
- Kept role-specific persistence, authorization, transaction, audit, and patient-facing validation responsibilities in their existing modules.
- Added shared storage and patient profile photo service unit coverage; updated existing administrator and doctor tests for the shared implementation.
- No database migration, dependency, or URL format change was required.

## Verification

- `npm test -- --runInBand`: 137 suites and 1,079 tests passed.
- `npm run lint`: passed.
- `npm run format`: completed.
- `npx prettier --write "app.js" "server.js" "package.json" "config/**/*.js" "tests/**/*.js" "views/**/*.pug" "src/styles/**/*.css" ".github/workflows/ci.yml" --plugin @prettier/plugin-pug`: completed; files were already formatted.
- `npm run format:check`: passed.
- `npm run css:build`: passed. The user's existing local edit to generated `public/css/app.css` was restored and verified unchanged after the build.
- `npm run test:e2e`: passed, including administrator profile photo interaction and the remaining browser and accessibility flows.

## Limitations

This extraction centralizes image decoding and storage only. Shared location and profile validation, public email base URL validation, administrative route splitting, and appointment-domain boundaries remain separate checklist items.
