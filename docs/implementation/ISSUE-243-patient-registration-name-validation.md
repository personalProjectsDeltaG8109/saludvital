# Issue 243 — Patient Registration Name Validation

- Validate patient first and last names on the server before opening a database transaction.
- Accept Unicode letters and combining marks, including Spanish accents, separated by spaces, hyphens, or apostrophes.
- Trim leading and trailing whitespace and collapse repeated whitespace before persistence.
- Reject digits, markup, unsupported punctuation, and repeated separators with Spanish validation feedback.
- Preserve the existing 50-character field limits; validation does not silently remove unsupported characters.
- Added unit coverage for invalid characters, accented and compound names, Unicode combining marks, normalization, and rejection before database writes.
- No schema or dependency changes were required.

## Acceptance criteria update for US-AUTH-01

Replace the existing name criterion with:

> First name and last name are required, may contain no more than 50 characters each, and may contain Unicode letters, combining marks, spaces, hyphens, and apostrophes only. The server trims leading and trailing whitespace, collapses repeated whitespace, and rejects unsupported characters without silently removing them.

The document type and document number remain constrained by the existing supported `CC`/`CE` values and digit validation. Update the project Wiki's US-AUTH-01 with this criterion when synchronizing the Wiki.

## Verification

Run the repository-required formatting, Jest, ESLint, and CSS build commands before opening the pull request. Record the actual results in the pull request.
