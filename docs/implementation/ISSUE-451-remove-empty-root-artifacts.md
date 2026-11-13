# Issue #451 — Remove Empty Tracked Root Artifacts

## Implementation

- Verified that the root files `eslint`, `node`, `tailwindcss`, and `saludvital@1.0.0` are tracked and contain zero bytes.
- Confirmed the application scripts and actual development tools are declared in `package.json`; the empty files contain no executable configuration.
- Removed only those four empty files. No application behavior, dependency, or database schema was changed.

## Verification

- `npm test -- --runInBand` passed: 140 suites and 1,096 tests.
- `npm run lint` passed.
- `npm run format:check` passed.
- `npm run test:e2e` passed, including the browser and axe-core flows.
- Tailwind CSS compiled successfully to a temporary output file; the pre-existing `public/css/app.css` change was preserved.
- `git diff --check` passed.
- No database, application code, package, or runtime configuration changed.
