# US-DOC-14 — Update Doctor Profile Photograph

## Implementation

- Added a camera control over the authenticated doctor's profile avatar. The page supports an initials fallback and a keyboard-accessible photo preview dialog.
- Added a doctor-only `POST /api/doctor/profile/photo` route. It derives the target from the authenticated user ID and rejects unexpected request fields; it cannot update identity, contact, specialty, or professional fields.
- Reused the existing doctor photo storage service. Browser and server validation allow JPG, PNG, and WebP files up to 2 MB; the server also checks image signatures before storage.
- The new file is stored and the doctor row is updated in a transaction. If persistence fails, the new file is removed and the previous photo remains. The previous stored image is removed only after the database update succeeds.
- The page updates the avatar and shared top-bar photo after success. Doctor pages that already load `doctors.profile_photo_url` display the new image on their next load.
- No database migration, dependency, photo removal control, or professional-signature workflow was added.
- Profile cards stack below 900 px so personal fields, address, and contact information remain readable on tablet widths.

## Verification

- `npm.cmd test -- --runInBand` — 87 suites and 653 tests passed.
- `npm.cmd run lint` — passed.
- `npm.cmd run format:check` — passed.
- `node tests/e2e/doctor-profile.e2e.js` — passed at 390, 760, 762, 768, 900, 1366, and 1920 px; profile cards stack through 900 px, read-only badges stay within their fields, and no horizontal overflow or axe violations were found.
- `npm.cmd run test:e2e` — passed.
- `git diff --check` — passed.

The browser check exercises preview, invalid file rejection, upload failure preservation, successful avatar updates, and responsive widths. Screenshots are generated from the local Pug page fixture; externally served brand assets are unavailable in that fixture.
