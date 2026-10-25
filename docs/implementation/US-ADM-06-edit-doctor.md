# US-ADM-06 — Edit Doctor Information

## Story and acceptance criteria

Issue #116 (Sprint 5). An administrator can open a doctor's existing profile editor from the directory or detail page, update supported profile fields and specialty, replace or remove the doctor's photo, and see saved changes in the directory and profile. Updates are validated, unique email addresses are enforced, changes are audited, and the current profile photo remains intact if a save fails.

## Implementation notes

- `src/modules/admin/services/adminUserManagementService.js` reuses the protected profile update flow, validates the doctor's name and specialty, accepts only active specialties or the doctor's existing specialty, stores an optional uploaded photo, and removes superseded photo files only after the database transaction commits. Failed updates clean up the newly stored file.
- `src/modules/admin/services/adminDoctorService.js` includes the account ID in directory results so the edit action can open the corresponding account profile.
- `public/js/admin-doctors.js` adds a pencil action beside the doctor's photo and details action. `views/admin/doctor-details.pug` adds an Edit action. Both link to the existing “Usuarios y roles” editor and deep-link to the selected doctor.
- `public/js/admin-users.js` opens the existing profile modal from the deep link and provides photo preview, upload, and removal. `public/css/admin-users.css` and `public/css/admin-doctors.css` style the edit control and responsive layout.
- Tests cover profile updates, photo replacement and cleanup, photo removal, inactive specialty rejection, duplicate email rejection, directory identity, and protected access. No migration was needed; document and telephone fields are not present in the current doctor schema.

## Verification

- `npm.cmd test -- --runInBand` — 40 suites and 330 tests passed.
- `npm.cmd run test:e2e` — existing login and registration responsive/accessibility checks passed.
- Targeted ESLint passed; doctor, users, and details Pug templates compiled.
- Playwright confirmed direct edit opening, image preview and upload payload, the directory's photo/details/edit links, and no horizontal overflow at 320 px.
- `git diff --check` passed.

## Dependencies and remaining work

This story depends on US-ADM-05, integrated into `develop`. It reuses the existing administrator profile editor and audit flow. Account activation/deactivation behavior remains in US-ADM-07. Photo files use the repository's existing local profile-photo storage; deployments with ephemeral disks will need durable storage when introduced.
