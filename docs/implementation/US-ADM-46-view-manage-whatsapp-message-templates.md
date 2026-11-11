# US-ADM-46 — View and Manage WhatsApp Message Templates

## Implementation

- Reused the existing administrator WhatsApp page, API, and administrator authorization middleware.
- Added a read-only view of the four Meta template names used by appointment confirmation, reminder, reschedule, and cancellation notifications. The confirmation template reuses `META_WHATSAPP_CONFIRMATION_TEMPLATE_NAME` from the existing sender configuration.
- The view reports only whether the corresponding local template name is configured. It never returns provider identifiers or credentials.
- Added name and purpose search plus filtering by local configuration state. The list is bounded to the four application-supported appointment notification types.
- The interface distinguishes application configuration from provider approval. Provider status, template content, and language are shown as unavailable because the integration does not retrieve those fields.
- Added responsive summary cards and template cards with Spanish loading, empty, and filter results states. Search and filter controls are keyboard accessible.
- No creation or editing control is available because the application has no provider template registration or approval API. The catalog reports whether a local template name is configured without returning its value. Existing message delivery and sent history are unchanged.
- No database schema or dependency change was required.

## Limitations

- Meta template listing, content retrieval, submission, and approval status are not implemented in the current integration.
- The application stores template names and sends configured runtime variables; it does not persist template text, language, provider category, or a variable schema. These values cannot be safely edited or validated in the administrator interface.
- Existing runtime-variable behavior is covered for sending supplied values and rejecting malformed JSON. Placeholder-to-content validation cannot be performed because the provider template content and placeholder schema are unavailable.
- Local template-name presence does not prove that a provider template exists, is approved, or can be used for delivery.

## Follow-up — Issue #411

The original catalog omitted the existing appointment-confirmation template. Issue #411 adds it to the catalog and its local configuration counts while preserving the limitation that provider approval is not queried.

## Verification

Verification:

- `npm.cmd test -- --runInBand tests/unit` — passed: 62 suites, 462 tests.
- `npm.cmd test -- --runInBand tests/integration/app.test.js` — passed: 1 suite, 60 tests, including administrator route authorization.
- `node tests/e2e/admin-whatsapp.e2e.js` — passed: template search, combined local configuration filtering, and no horizontal overflow at 320, 375, 768, and 1440 pixels.
- `npm.cmd run lint` — passed.
- `npm.cmd run format:check` — passed.
- `git diff --check` — passed.

### Issue #411 follow-up verification

- `npm.cmd test -- --runInBand tests/unit/adminWhatsAppTemplateService.test.js tests/unit/adminWhatsAppView.test.js` — passed: 2 suites, 7 tests.
- `npm.cmd test -- --runInBand` — passed: 131 suites, 1,053 tests.
- `node tests/e2e/admin-whatsapp.e2e.js` — passed: template catalog search, local configuration filters, summary counts, and responsive layout at the configured viewport widths.
- `npm.cmd run lint` — passed.
- Prettier check with `@prettier/plugin-pug` on all changed files — passed.
- `git diff --check` — passed.
