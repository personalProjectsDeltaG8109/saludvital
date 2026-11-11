# Issue 432 — Shared Location and Profile Validation

## Scope

Move the Colombia location catalog and profile text/phone validation helpers out of role-specific modules. Preserve all current routes, data, field rules, and role-specific validation behavior.

## Implementation

- Moved the Colombia location JSON catalog and its department, municipality, and location-resolution functions to `src/shared/`.
- Updated authentication registration, location endpoints, patient routes/profile, doctor profile, and administrator user management to use the shared location service.
- Moved shared profile text and phone normalization functions to `src/shared/services/profileFieldValidationService.js`; administrator and doctor services now import those helpers from the shared area.
- Kept email format validation in the administrator module because only administrator profile flows use that policy.
- Kept patient-specific profile validation in the patient module because its phone requirements and error responses are different.
- Kept location API paths, response shapes, catalog values, stored department/municipality names, and profile update behavior unchanged.
- No database schema or dependency changes were required.

## Verification

- Focused Jest and HTTP coverage: 6 suites, 39 tests passed.
- `npm test -- --runInBand`: 138 suites, 1,084 tests passed.
- `npm run lint`: passed.
- `npm run format`: completed.
- `npx prettier --write "app.js" "server.js" "package.json" "config/**/*.js" "tests/**/*.js" "views/**/*.pug" "src/styles/**/*.css" ".github/workflows/ci.yml" --plugin @prettier/plugin-pug`: completed.
- `npm run format:check`: passed.
- `npm run css:build`: passed; the existing local `public/css/app.css` change was restored and verified unchanged.
- `npm run test:e2e`: passed, including registration, location selection, responsive, and accessibility flows.
- Confirmed the relocated Colombia JSON parses to the same data as the original.
- `git diff --check`: passed.

## Limitations

Patient-specific email and phone validation was intentionally left in the patient module to preserve its distinct rules and messages.
