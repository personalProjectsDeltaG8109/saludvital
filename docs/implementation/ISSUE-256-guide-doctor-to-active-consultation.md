# Issue #256 — Guide the Doctor to an Active Consultation

## Implementation

- Reused the authenticated doctor's `Doctor` profile and persisted `Consultation` state. Added a protected read-only endpoint that returns only the active consultation ID for the signed-in doctor.
- Before opening the existing start-confirmation dialog, the browser checks whether the doctor already has an active consultation. It opens an accessible Spanish dialog with **Ir a la consulta abierta** and **Permanecer en la agenda** when one exists.
- The agenda, dashboard, and appointment list expose a path to that dialog when their persisted data indicates another consultation is active. A failed status check does not send a start request.
- The destination uses the authenticated doctor's active consultation. Existing consultation routes continue to enforce ownership; no client-provided ID is trusted for authorization.
- No appointment or consultation is changed by the status check or by remaining in the agenda. The existing transactional one-active-consultation guard remains authoritative.
- No schema or dependency change was needed.

## Verification

- `npm.cmd test -- --runInBand` — passed: 107 suites and 788 tests.
- `npm.cmd run lint` — passed.
- `npm.cmd run css:build` — passed.
- `npm.cmd run test:e2e` — passed, including the active-consultation dialog, stay/navigation choices, responsive doctor agenda checks, and axe-core.
- `git diff --check` — passed.
- `npm.cmd run format` and the targeted Prettier write command — passed.
- `npm.cmd run format:check` still reports the unchanged baseline `docs/userStories/userStories.md`; all changed files are formatted.
