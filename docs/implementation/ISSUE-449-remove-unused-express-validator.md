# Issue #449 — Remove Unused `express-validator`

## Implementation

- Confirmed the package had no imports or references in application source, tests, scripts, or build configuration.
- Removed the direct dependency from `package.json` and its package entry from `package-lock.json` with `npm uninstall`.
- No validation code or behavior changed; the project continues using its existing validation functions.

## Verification

- `rg` confirmed there are no remaining source, test, script, or configuration references to `express-validator`.
- `npm ls express-validator --depth=0` reports the dependency tree as empty.
- `npm ci --no-audit --no-fund` completed successfully from the updated lockfile. npm reported that install scripts for three packages were blocked by the local `allowScripts` policy; the full test suite still passed after installation.
- `git diff --check` passed.
- Prettier passed for `package.json`, `package-lock.json`, and this implementation note.
- `npm test -- --runInBand` passed: 140 suites and 1,096 tests.
- `npm run lint` passed.
- `npm run format:check` passed.
- `npm run test:e2e` passed, including the browser and axe-core flows.
- Tailwind compiled successfully to a temporary output file so the pre-existing `public/css/app.css` working-tree change would not be overwritten.

The generated Tailwind file `public/css/app.css` was already modified in the working tree and was preserved.
