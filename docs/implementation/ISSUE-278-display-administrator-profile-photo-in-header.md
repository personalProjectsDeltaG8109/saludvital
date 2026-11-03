# Issue #278 — Display the Administrator Profile Photo in the Header

## User story

As an authenticated administrator, I want my saved profile photo to appear in administrator page headers so that I can identify the active account consistently across the admin panel.

## Acceptance criteria

1. Only the authenticated administrator's own saved profile photo is used.
2. The existing persisted photo URL is reused; no upload flow, database field, storage mechanism, or dependency is added.
3. The photo appears as a cropped circular avatar in the shared header and in the Dashboard and WhatsApp headers, which use custom markup.
4. Missing or invalid photos retain the existing avatar fallback.
5. Only URLs from the existing local profile-photo path are rendered.
6. Credentials and unrelated profile data are not loaded for the avatar.
7. The avatar remains responsive and decorative when the administrator's name is adjacent.
8. Automated tests cover the safe projection, invalid and missing photo fallback, and page rendering.

## Implementation

- Added a focused service query that selects only the authenticated account ID, active state, role, and saved photo URL. It rejects a missing, inactive, or non-administrator account and returns only a validated local upload URL.
- Added authenticated administrator page middleware to expose the validated URL to Pug templates. API routes skip this page-only lookup.
- Rendered the existing avatar fallback beneath the photo in the shared header, Dashboard, and WhatsApp header. The image is decorative and uses a circular `object-fit: cover` crop.
- Added unit, rendered-view, and responsive browser coverage. No schema or dependency change was needed.

## Verification

- Focused Jest suites: 15 tests passed.
- Full Jest suite: 113 suites and 862 tests passed.
- Administrator profile browser flow passed at 320, 375, 768, and 1440 px.
- Full Playwright E2E suite passed, including available accessibility checks.
- `npm run lint`, `npm run format:check`, and `npm run css:build` passed.

## Limitations

This change displays the photo already managed by the administrator profile feature. It does not change photo upload, removal, or storage behavior.
