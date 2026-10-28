# US-ADM-42 — View and Search WhatsApp Conversations

## Acceptance criteria

1. Only authenticated administrators can access the conversation list and conversation history endpoint.
2. The page reuses the existing SaludVital administrator layout and WhatsApp navigation.
3. The conversation list uses persisted conversations and shows a linked contact name when available, a partially masked contact number, last activity, and persisted status.
4. Administrators can search by linked patient name or stored phone number and filter by the persisted conversation statuses: Active, Completed, Expired, and Blocked.
5. Conversation results are retrieved from the backend with stable ordering and bounded pagination.
6. Selecting a conversation opens its persisted message history when records exist.
7. Messages are ordered chronologically and visually distinguish inbound and outbound directions.
8. Message timestamps use `es-CO` formatting and the `America/Bogota` time zone.
9. The response excludes provider identifiers, credentials, tokens, and unnecessary patient fields. Contact numbers are masked.
10. Message bodies are returned only by the protected detail endpoint, are rendered as text, and are omitted after `content_expires_at`.
11. The interface handles loading, empty, unavailable, and error states in Spanish.
12. Search, filters, conversation selection, and pagination are keyboard accessible and responsive without horizontal overflow.
13. Automated tests cover authorization, search, status filtering, pagination, missing conversations, message ordering, expiry, and safe rendering.

## Implementation

- Reused the existing administrator WhatsApp routes, shared authorization middleware, `WhatsAppConversation` and `WhatsAppMessage` models, and Patient association. No table or dependency was added.
- Added backend search by linked patient name or stored phone number, validation of supported conversation statuses, stable last-activity ordering, and bounded conversation pagination.
- Added a protected conversation history endpoint with bounded chronological message pagination, Spanish status-independent message labels, timestamps, and masked contact details.
- Message content is returned only for an authorized detail request. Expired content is replaced with `null`; provider message IDs and account identifiers are not selected.
- Added responsive search/status controls, selectable conversation cards, and an incoming/outgoing message thread to the existing WhatsApp page.
- Browser rendering assigns stored message text through `textContent`, so it is displayed literally rather than interpreted as markup.
- Updated the existing WhatsApp browser flow and added service and HTTP authorization coverage.

## Data limitations

- The application has no message-ingestion implementation in the current codebase. The history therefore contains only messages already persisted in `whatsapp_messages`; an empty history is shown when none exist.
- Contact search is limited to linked Patient records. Conversations without a linked Patient cannot be searched by provider account or phone identifiers because those fields are provider-scoped and are not returned to the administrator interface.
- `content_expires_at` is enforced when reading message details. A background purge or retention job is not part of this story.

## Verification

- `npm test -- --runInBand tests/unit` — passed: 58 suites and 439 tests.
- `npm test -- --runInBand tests/integration/app.test.js` — passed: 54 tests, including protected conversation history access.
- `node tests/e2e/admin-whatsapp.e2e.js` — passed: search, status filtering, conversation opening, text-only message rendering, tab navigation, and responsive widths from 320 to 1440 pixels.
- `npm run lint` — passed.
- Prettier check for changed JavaScript, Pug, CSS, test, and documentation files — passed.
- `git diff --check` — passed.
