# US-ADM-38 — Analyze Appointment Distribution and Trends

## Implementation

- Updated the status distribution to show only Confirmadas, Canceladas, and Reprogramadas. Pending, En curso, and Atendidas are excluded from this chart.
- The database persists Rescheduled as an appointment-history event, not an appointment status. Reprogramadas counts distinct currently confirmed appointment records in the selected appointment-date range that have at least one persisted Rescheduled history event. Those records are subtracted from Confirmadas so one appointment appears in only one status category.
- Status-chart percentages use the sum of its three displayed categories. The general appointment summary continues to include all supported persisted appointment statuses.
- Kept the specialty chart grouped by persisted appointments and their existing specialty relationship, including the existing fallback for missing specialties.
- Kept the trend series as Atendidas, Confirmadas, and Canceladas, and made its empty state independent of the status-chart categories.
- All appointment charts use the 7/30/90-day period already selected for US-ADM-37 and the existing `America/Bogota` boundaries.
- Reused the existing report service, endpoint, history model, status relationships, views, and styling. No schema or dependency changes were required.

## Validation

- Unit tests cover status inclusion and exclusion, mutually exclusive reprogrammed counts, chart totals and percentages, date filters for all periods, specialty aggregation, and trend series.
- Browser tests cover the existing period selector, status chart and trend chart rendering, accessible descriptions, and responsive layouts.
