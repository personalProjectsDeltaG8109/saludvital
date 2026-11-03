# Issue #290 — Prevent Unauthorized Administrator Role Assignment

## Scope

The regular administrator user-management endpoint previously accepted any existing role ID. Since the same `Administrator` role authorized that endpoint, an administrator could grant administrator access to a patient or doctor account without a separate elevated authorization path.

## Implementation

- The user-management service now rejects assigning the `Administrator` role to accounts that do not already have it.
- The restriction is enforced inside the existing transaction, before updating the account or recording a successful audit event.
- The role selector hides `Administrator` for non-administrator accounts while preserving the current role option for existing administrator accounts.
- Patient self-registration and administrator doctor creation continue assigning their respective roles server-side.
- No migration, dependency, or new authorization role was introduced. Creating a new administrator remains unsupported until the project defines a higher-privilege provisioning mechanism.

## Verification

- Added a regression test proving an ordinary administrator cannot promote a patient account and that rejected changes do not write a success audit event.
- See the pull request checks for the complete test, lint, formatting, and CSS build results.
