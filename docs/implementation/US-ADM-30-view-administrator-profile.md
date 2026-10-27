# US-ADM-30 — View Administrator Profile

## Implementation

- Added a protected, read-only `/admin/profile` page that loads the current administrator by the authenticated user ID.
- Added the nullable `users.display_name` field through a reversible migration. Existing accounts have no reliable persisted name to backfill; the page reports “Nombre no registrado” until a name is recorded.
- The profile service selects only display name, email, role, account status, registration date, and last access. It never returns credentials or verification data.
- Added the profile navigation link and responsive Spanish page with accessible section links and a default initials avatar.
- Security and preferences appear as informational sections only; editing, password management, profile photo changes, and preference persistence remain outside this story.

## Validation

- Unit tests cover the safe profile projection, older accounts without a name, invalid IDs, non-administrator records, and rendered profile content.
- Apply the migration with `npm run db:migrate` before using the page.
