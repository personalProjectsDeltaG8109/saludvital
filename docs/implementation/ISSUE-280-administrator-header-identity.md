# Issue #280 — Show the Administrator Name and Role in Headers

## User story

As an authenticated administrator, I want the header to show my saved name and the Administrator role so that I can identify which account is active.

## Acceptance criteria

1. Header identity comes only from the authenticated administrator account.
2. The saved display name is shown when present, with a safe Spanish fallback when absent.
3. The role is confirmed from the persisted role association before displaying “Administrador”.
4. The shared header and custom Dashboard and WhatsApp headers show the same identity.
5. Email, credentials, and unrelated personal details are not used as name fallbacks.
6. Header identity remains readable in responsive layouts.
7. Existing authorization and profile behavior are preserved; no schema or dependency change is needed.
8. Automated tests cover the safe projection, fallback, role validation, and header rendering.

## Implementation

- Reused the authenticated account ID and role authorization already applied by administrator routes.
- Added a small header identity query selecting only the account ID, display name, active state, profile photo URL, and role name. No email or credential field is selected.
- Replaced generic header labels in the shared shell, Dashboard, and WhatsApp page with the persisted display name and verified Spanish role label. The dashboard welcome heading also uses the saved name.
- Used “Administrador” when no display name is available and retained the existing photo fallback.
- No migration or dependency was required.

## Verification

- Focused Jest suites: 15 tests passed.
- Full Jest suite: 113 suites and 862 tests passed.
- Administrator profile E2E passed, including identity labels and responsive avatar checks.
- Full Playwright E2E suite passed, including available axe-core checks.
- `npm run format`, the required targeted Prettier command, `npm run lint`, `npm run format:check`, `npm run css:build`, and `git diff --check` passed.

## Limitations

Accounts without a saved `display_name` use the generic Spanish “Administrador” fallback. No email address is exposed as an alternate name.
