# US-ADM-39 — View Top Doctors by Appointment Count

## Implementation

- Kept the ranking in the existing reports service and applied the selected 7/30/90-day appointment date range.
- Counts persisted appointment rows grouped by doctor. The query does not join appointment history, so a reschedule event does not add another appointment to the doctor's count.
- Limits the database ranking to five and orders by appointment count descending, doctor display name ascending, and doctor ID ascending for stable ties.
- Keeps the doctor ID for ordering only; the interface receives only each doctor's display name, count, rank, and bar width.
- The existing empty state remains in use when no doctor has appointments during the selected period. No schema or dependency change was required.

## Validation

- Unit tests cover top-five limiting, descending counts, name and ID tie-breaks, selected-period boundaries, and the absence of an appointment-history join in the ranking query.
- MySQL integration tests exercise the real ranking query and validate result count, rank sequence, and ordering.
