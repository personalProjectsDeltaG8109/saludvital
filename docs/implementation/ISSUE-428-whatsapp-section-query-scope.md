# Issue #428 — Separate WhatsApp Overview and Section Queries

## Scope

Reduce unrelated database work when an administrator opens a WhatsApp section or changes conversation filters. Preserve the existing authenticated routes, six primary sections, visible data, filters, pagination, and safe projections.

## Implementation

- Split WhatsApp retrieval into focused overview, conversation, appointment-request, and delivery functions.
- Keep the failed-notification count as shared navigation data; the admin shell displays this alert on the WhatsApp page.
- Load overview charts, counts, and recent records only for the Summary tab.
- Load conversation searches and pages without calculating overview charts, request counts, message previews, or recent events.
- Load only the selected section's other data: request rows and specialties, delivery aggregates and rows, chatbot flows, or local configuration.
- Preserve the existing query filters, bounded page size, status mapping, response fields required by each view, and explicit safe projections.
- Added model-mock tests for query responsibilities. A normal conversation page now invokes two model methods: the shared alert count and its paginated conversation query (`findAndCountAll`, which performs a count and page query). Previously, that request also ran the overview aggregates and recent-record queries.
- No schema or dependency changes were required.

## Verification

- Baseline before implementation: WhatsApp service and HTTP route tests, 2 suites / 93 tests passed.
- After implementation: WhatsApp service and HTTP route tests, 2 suites / 98 tests passed.
- Full Jest: 136 suites / 1,073 tests passed.
- `npm run lint` — passed.
- `npm run format:check` — passed; Prettier was also run on the changed JavaScript files.
- `npm run css:build` — passed; the pre-existing local `public/css/app.css` was restored byte-for-byte and its SHA-256 hash matched.
- `npm run test:e2e` — passed, including the WhatsApp browser flow and axe-core checks.
- `git diff --check` — passed.

## Performance Measurement Limitation

The tests verify which model queries each section invokes. They do not establish end-to-end latency using a production-like database or dataset. This change therefore makes no claim about page-load time; collect comparable latency measurements before publishing such a claim.

## Acceptance Criteria

- [x] Summary requests still load persisted overview data.
- [x] Section requests retrieve only the data needed by their selected view, apart from the shared notification alert count.
- [x] Conversation search and pagination no longer recalculate overview aggregates or recent records.
- [x] Existing authorization, filters, page metadata, safe projections, and Spanish interface behavior are preserved.
- [x] Tests verify selected-section query responsibilities.
- [x] No schema or dependency changes were added.
- [ ] Compare end-to-end latency with a representative test dataset before claiming a user-visible speed improvement.
