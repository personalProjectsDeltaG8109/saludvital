# US-ADM-36 — View Reports and Key Performance Indicators

## Implementation

- Added the protected `/admin/reports` page and `/api/admin/reports` aggregate endpoint, and enabled the report link in the shared administrator sidebar.
- Added bounded aggregate queries for the latest 30 calendar days in `America/Bogota`, using appointment start time for appointment-based metrics.
- Added summary cards for total appointments, attended appointments, cancelled appointments, and distinct patients. Percentages are calculated from the same persisted appointment records.
- Added status distribution for the actual appointment statuses `Confirmed`, `In Progress`, `Attended`, and `Cancelled`. `Pending` is excluded. `Rescheduled` is not a status in this application; it is stored as an appointment-history event and is not mixed into the status chart.
- Added specialty distribution, a daily trend for attended, confirmed, and cancelled appointments, and a top-five doctor ranking. Appointment rows are counted once; reschedule history does not duplicate appointments.
- Added operational indicators using completed consultation durations with persisted `duration_seconds`, cancelled appointment status divided by all supported appointment statuses in the period, and persisted WhatsApp appointment request records created in the period.
- Missing specialty or doctor labels use a safe Spanish fallback. Missing consultation duration is shown as unavailable. The page displays accessible loading and error states, and empty charts use clear Spanish messages.
- Added responsive styles based on the supplied desktop and mobile reference. The reports link uses the existing shared sidebar; the WhatsApp page's duplicated sidebar was also updated to link to reports.
- No new database schema or dependency was required. The reporting-period label is fixed to the latest 30 days in this story; selectable 7/30/90-day ranges remain in US-ADM-37.

## Validation

- Unit tests cover period boundaries, status aggregation, unique patient counting, chart series, fallback labels, consultation-duration availability, and WhatsApp request counts.
- Integration tests verify that unauthenticated visitors cannot access the reports page.
- Browser tests cover report content, chart accessibility, sidebar behavior, and overflow at mobile, tablet, laptop, and desktop widths.

## Calculation notes and limitations

- The cancellation rate is `cancelled appointments / all supported-status appointments` whose scheduled start time falls within the reporting period. It measures the current persisted status of appointments scheduled in that period, not cancellation events that occurred during the period.
- Appointment trends group each appointment by its scheduled start date in the database's established Colombia time handling and its current persisted appointment status.
- Average consultation duration includes only completed consultations with a persisted duration and a start time in the same period.
- WhatsApp appointment requests are counted by request `created_at`; they are not inferred from message text or from appointments with `source = WhatsApp`.
- The period selector is displayed as “Últimos 30 días” but is not interactive in this story. Filtering is scoped to US-ADM-37.
