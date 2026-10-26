# US-ADM-19 — View and Search Doctor Schedules

Issue: [#145](https://github.com/personalProjectsDeltaG8109/saludvital/issues/145)  
Milestone: Sprint 5 - Administration  
Branch: `feature/us-adm-19-view-search-doctor-schedules`

## Acceptance criteria

- Administrator authentication protects the page and schedule directory API.
- Schedule data, exceptions, doctor accounts, specialties, and affected appointments come from the existing database models.
- The summary reports active doctors, active doctors with availability in the selected week, exceptions in the upcoming seven days, and future confirmed appointments currently outside configured availability or overlapping an unavailable exception.
- Administrators can search by doctor name or email and filter by doctor, specialty, schedule configuration, and Monday-to-Sunday week in the `America/Bogota` timezone.
- Summary counts remain independent from doctor, specialty, and schedule-status filters; the configured-schedule count uses the selected week.
- Loading, empty, and safe error states are present. The Spanish page uses the shared administrator sidebar and topbar and adapts to mobile, tablet, and desktop.
- This story is read-only. Schedule editing, exception management, and appointment resolution are outside its scope.

## Implementation notes

- Added a protected administrator page and JSON endpoint using the existing doctor, availability, exception, specialty, appointment, and status models.
- Reused the shared administrator shell and enabled its existing Horarios y disponibilidad navigation item.
- Added doctor search and filters, a weekly availability view, summary cards, exception preview, and responsive layouts. The page does not expose patient data.
- The exception model has no active flag; existing exception records are treated according to their stored type and dates. The affected appointment count is a current-state calculation, not historical impact tracking.
- No schema changes or new dependencies were needed.

## Verification

- `npm test -- --runInBand`: 51 suites passed, 426 tests passed.
- `npm run lint`: passed.
- Pug render smoke check: passed.
- `node tests/e2e/admin-doctor-schedules.e2e.js`: passed; no horizontal overflow at 375×812, 768×1024, and 1440×900; search, empty, and error states passed.
- Targeted unit and integration tests: 2 suites passed, 42 tests passed.

## Remaining work

No US-ADM-20 functionality was included. No merge, push, or pull request was performed.
