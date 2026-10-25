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
