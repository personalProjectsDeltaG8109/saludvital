# US-ADM-04 — Create Doctor

## Scope and acceptance criteria

Implements administrator-protected access to the doctors directory and dedicated registration page. The backend validates required fields and active specialty, rejects duplicate email addresses, assigns the existing Doctor role, hashes the initial password, creates the user, doctor profile, and standard email-verification job in one transaction, records the existing audit event, and returns success feedback. The interface reuses the shared admin shell and adapts to narrow screens.

## Files and decisions

- `src/modules/admin/services/adminDoctorService.js`: uses existing User, Doctor, Rol, Specialities, EmailOutbox, and AuditLog models; no migration is needed because the current schema already supports this profile.
- `src/modules/admin/routes/adminRoutes.js`: registration and directory routes reuse the existing administrator authentication middleware.
- `views/admin/partials/admin-shell.pug`: shared admin sidebar used by the dashboard, user management, doctor directory, and registration page; the shared topbar is used by user management and both doctor screens.
- `views/admin/doctors.pug`, `views/admin/doctor-form.pug`, `public/js/admin-doctors.js`, `public/js/admin-doctor-form.js`, and `public/css/admin-doctors.css`: responsive directory and dedicated registration flow. The directory has no detail, edit, or activation actions because those remain outside US-ADM-04.
- `tests/unit/adminDoctorService.test.js`: registration validation, duplicate handling, transaction persistence, password hashing, audit, and actual directory aggregates.

## Verification

- `node --experimental-vm-modules node_modules/jest/bin/jest.js tests/unit/adminDoctorService.test.js --runInBand`: 6 tests passed.
- `npm test -- --runInBand`: 38 suites and 316 tests passed.
- Pug compilation for the doctor, user-management, and dashboard templates passed.
- Targeted ESLint for the service, routes, frontend scripts, and service tests passed.
- Playwright confirmed the admin directory and create form render at 320 px without horizontal overflow; form validation preserves entered values and success displays the confirmation state.
- An anonymous request redirects to login; a doctor account receives HTTP 403 from the protected directory API.
- The local server started successfully and served the directory and registration views.
- `git diff --check` passed.

## Dependencies and remaining work

The current doctor schema supports one specialty per profile and has no doctor document or telephone fields, so the form does not invent those fields. The initial password is supplied by an administrator and stored only as a bcrypt hash. Details, editing, status changes, and broader specialty management belong to their separate user stories and must be completed on their specified branches.

## Follow-up: profile photo and mobile layout

- Acceptance criteria covered: administrators can add a profile photo while creating a doctor; unsupported, mismatched, and oversized images are rejected; the photo appears in the directory; the registration form and shared mobile header fit narrow screens; the doctors page continues to use the shared admin sidebar with the Users and Roles link.
- `src/modules/admin/services/doctorPhotoService.js` validates JPEG, PNG, and WebP content, limits uploads to 2 MB, stores generated filenames under the existing public profile-photo directory, and supports cleanup if the database transaction fails.
- `views/admin/doctor-form.pug`, `public/js/admin-doctor-form.js`, and `public/css/admin-doctors.css` add a preview, file selection/removal, and responsive form controls. `public/js/admin-doctors.js` displays the saved photo in the directory. `views/admin/partials/admin-shell.pug` adds the dashboard-style notification bell to the shared mobile header.
- Tests: `npm.cmd test -- --runInBand` passed (39 suites, 320 tests); targeted ESLint passed; doctor Pug templates compiled; `git diff --check` passed. The local server started and protected doctor routes redirected unauthenticated requests to `/login` (HTTP 303).
- Limitations: photo files use the same local public upload storage as existing profile photos; production environments with ephemeral disks will need durable file storage when that infrastructure is introduced.
