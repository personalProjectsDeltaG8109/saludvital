# WA-F01 - Keep WhatsApp chatbot choices reachable

## Problem

WhatsApp lists support at most ten rows. The chatbot previously filled all ten rows with choices and then added an eleventh row for “Ver más opciones”. The sending adapter removed rows beyond the limit, so patients could not reach later choices. The text version also omitted the page control.

## What changed

- Lists with more than ten choices now show nine choices and use the tenth row for “Ver más opciones”. Lists with ten or fewer choices keep all choices and do not add an unnecessary page control.
- The next page can be opened with the WhatsApp list button or by typing “ver más opciones”, “más opciones”, or “mas opciones”. The text version explains how to continue.
- The opening menu now shows each choice once while keeping the WhatsApp list button and numbered/text replies available.
- Choice numbers and names are accepted only when they appear on the current page. A patient cannot select a hidden choice by guessing its number or name.
- The same page-building logic is used on later pages, including the final page.
- Added coverage for list sizes 0, 1, 9, 10, 11, 20, and 21; page navigation; text and numbered replies; booking specialties; rescheduling appointments; and the Meta adapter row limit.
- No database or dependency change was needed. No live WhatsApp message was sent.

## Verification

- Focused Jest: 2 suites and 24 tests passed, including a check that the opening menu displays each choice once.
- Full Jest: 161 suites and 1,266 tests passed. The first run found that the local `saludvital_test` database had not yet applied the account-invitation migration. After running the repository's test-database preparation command, the full suite passed.
- Full Playwright run after the opening-menu correction, including the available accessibility checks: passed with exit code 0.
- `npm run lint`: passed.
- `npm run format`: passed.
- Repository Prettier write command: passed.
- `npm run format:check`: passed.
- `npm run css:build`: passed; the generated CSS file is not part of this change.
- `git diff --check`: passed.

## Work status

- Issue: [#568](https://github.com/personalProjectsDeltaG8109/saludvital/issues/568)
- Branch: `fix/568-whatsapp-list-pagination`
- Pull request: [#571](https://github.com/personalProjectsDeltaG8109/saludvital/pull/571) (open; awaiting review and merge).
