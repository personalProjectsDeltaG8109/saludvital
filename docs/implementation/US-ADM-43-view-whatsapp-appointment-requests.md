# US-ADM-43 — View WhatsApp Appointment Requests

## Acceptance criteria

1. Only authenticated administrators can access the WhatsApp request list and its protected API data.
2. The list reads existing `WhatsAppAppointmentRequest` records and reuses the SaludVital WhatsApp page and administrator layout.
3. Each result displays the linked contact name, masked contact number, requested specialty, creation date, persisted status in Spanish, and update date when available.
4. Administrators can search linked patient names and stored phone fields, and filter by persisted request status, requested specialty, and request creation-date range.
5. The backend validates supported statuses, specialty IDs, date formats, and date ordering. Date bounds are inclusive in `America/Bogota`.
6. Combined filters return only matching records and applying them resets pagination to the first page.
7. Results are paginated by the backend, ordered newest first with a stable ID tie-breaker, and include the matching record count.
8. The feature is read-only and does not change requests or appointments.
9. The response excludes clinical, credential, token, full phone number, and unnecessary patient data.
10. Loading, empty, and error states are available in Spanish.
11. Filters and results are keyboard accessible and responsive without horizontal overflow.
12. Tests cover administrator authorization, filtering, pagination, statuses, invalid ranges, privacy, and empty results.

## Implementation

- Reused the administrator WhatsApp route, authorization middleware, `WhatsAppAppointmentRequest`, Patient and specialty associations, and the existing request pagination.
- Added combined backend filters for linked patient name/phone, persisted status, requested specialty, and inclusive creation-date range. Unsupported states, invalid specialty IDs, invalid dates, and reversed date ranges return Spanish 400 errors.
- Added stable newest-first ordering, matching totals, and correction to the last page when filtering makes the requested page unavailable.
- Added contact masking and the persisted update timestamp to request rows. No clinical fields, credentials, provider identifiers, or unmasked numbers are returned.
- Added Spanish search/date/status/specialty controls to the existing requests tab. The view remains read-only; management actions from the visual mockup are outside this story's approved criteria.
- Reused existing database tables and dependencies; no migration was needed.

## Data limitation

The persisted request status enum is `Pending`, `Confirmed`, `Rejected`, `Cancelled`, and `Expired`. The screenshot's “En proceso” status does not exist in this model and is not shown as a request state.

## Verification

- `npm test -- --runInBand tests/unit` — passed: 58 suites and 442 tests.
- `npm test -- --runInBand tests/integration/app.test.js` — passed: 55 tests, including administrator-only WhatsApp request access.
- `node tests/e2e/admin-whatsapp.e2e.js` — passed: combined request filters, masked contact display, empty results, navigation, and responsive widths from 320 to 1440 pixels.
- `npm run lint` — passed.
- Prettier check for changed JavaScript, Pug, CSS, test, and documentation files — passed.
- `git diff --check` — passed.
