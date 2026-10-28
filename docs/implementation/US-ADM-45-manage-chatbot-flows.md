# US-ADM-45 — View and Manage Chatbot Flows

## Scope

Administrators can inspect persisted chatbot flow drafts and create new versions. Flow activation remains unavailable until the chatbot runtime can execute the stored definition safely.

## Implementation

- Added `chatbot_flows` and `chatbot_flow_versions`. Each edit creates a new immutable draft version in a database transaction and records the administrator who saved it.
- Added backend validation for names, descriptions, supported message and question step types, unique step IDs, the start step, option limits, and transition references. Unknown fields and executable actions are rejected.
- Added protected WhatsApp flow endpoints and connected the existing Flujos del chatbot section to the persisted draft list and editor.
- The editor displays and accepts structured JSON for `startStepId` and `steps`; opening or saving a draft does not execute it or modify existing conversations.
- No activation or deactivation endpoint is exposed. Draft status is the only persisted lifecycle state because the application has no compatible chatbot runtime.
- Added model associations, a reversible migration, service validation/versioning tests, migration and registry tests, and HTTP authorization tests.

## Limitations

Draft definitions are not consumed by patient messaging or conversation processing. A later runtime story must define supported operational actions, activation rules, and how active conversations remain pinned to a flow version before drafts can be activated.
