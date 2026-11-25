# Let patients choose an available date in WhatsApp

## Problem

Patients had to type an exact date when booking or rescheduling through WhatsApp. This was easy to mistype and did not show which dates had real appointment times.

## What changed

- After a patient chooses a doctor, the chatbot now shows dates with real available times from the next 15 calendar days.
- Patients choose one of the listed dates. They no longer need to type a date in a special format.
- “Ver más fechas” loads the next 15-day period. The existing WhatsApp list paging still makes every displayed date reachable when a list is longer than one page.
- After a date is selected, the chatbot checks its available times again. If the date has filled up, it refreshes the date choices.
- Date choices use the doctor's active schedules and exceptions, existing appointments, and the patient's current appointment limits and specialty rules.
- During rescheduling, the appointment being moved is not counted as an additional daily booking. Its occupied time remains unavailable, and the final reschedule still uses the existing appointment checks.
- Patient identity checks, appointment rules, and Spanish messages remain in place.
- No database change or new dependency was needed. No live WhatsApp message was sent.

## Verification

- Focused Jest for appointment availability, rescheduling, and the WhatsApp webhook/chatbot: 4 suites and 56 tests passed.
- The related authentication integration tests also passed when run separately: 2 suites and 3 tests.
- Full Jest did not finish. It reported two 5-second timeouts in unrelated authentication integration tests. Both tests passed in the separate run; the full run was stopped after it stopped making progress.
- `npm.cmd run lint`: passed.
- Prettier check for the four changed JavaScript files: passed after formatting those files.
- `git diff --check`: passed. Git printed a line-ending warning for the existing local `public/css/app.css` change; that file was not modified by this work.
- Playwright and CSS build were not run because this change adds no browser page or styles. Live Meta WhatsApp delivery was not tested.

## Work status

- Issue: [#573](https://github.com/personalProjectsDeltaG8109/saludvital/issues/573)
- Branch: `feat/573-whatsapp-available-appointment-dates`
- Pull request: not created.
