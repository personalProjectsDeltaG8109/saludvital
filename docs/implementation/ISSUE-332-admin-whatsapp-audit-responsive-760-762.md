# Issue #332 — Admin WhatsApp and Audit Responsive Layouts

## Implementation

- Stacked the WhatsApp dashboard and lower summary cards at widths up to 800px so the chart, request, event, and chatbot panels do not become cramped when the desktop sidebar still occupies part of the viewport.
- Kept the WhatsApp request table readable by constraining its minimum width inside its existing horizontally scrollable panel.
- Switched audit records from the six-column table to the existing compact card presentation at widths up to 800px. Audit filters remain in the existing two-column layout until the narrower mobile breakpoint.
- Expanded Playwright viewport checks to 760px, 761px, and 762px, and added assertions for the stacked WhatsApp panels and audit card/table breakpoint.
- Reused existing page components, access controls, and responsive navigation. No business rules, schema, or dependencies changed.

## Verification

- `node tests/e2e/admin-whatsapp.e2e.js`: passed, including no-overflow checks and one-column dashboard layout assertions at 760px, 761px, and 762px.
- `node tests/e2e/admin-audit.e2e.js`: passed, including no-overflow checks and card-vs-table assertions at 760px, 761px, and 762px.
- `npm run test -- --runInBand`: 116 suites and 916 tests passed.
- `npm run test:e2e`: the complete browser suite passed.
- `npm run lint`, `npm run format`, the required scoped Prettier write command, and `npm run format:check`: passed.
- `npm run css:build`: passed; its generated `public/css/app.css` output will be restored because it is unrelated.
- `git diff --check`: passed.
