# US-ADM-40 — View Operational Performance Indicators

## Implementation

- Reused the persisted `Consultation`, `Appointment`, and `WhatsAppAppointmentRequest` records and the existing protected reports endpoint. No schema or dependency change was needed.
- Average consultation time is the arithmetic mean of `duration_seconds` for `Completed` consultations with a stored duration and an `ended_at` timestamp inside the selected America/Bogota period. The interface shows “Sin datos” if no qualifying consultation exists.
- Cancellation rate is `Cancelled appointments / appointments in Confirmed, In Progress, Attended, or Cancelled status × 100`, using appointment `start_at` in the selected period. It is unavailable when no supported appointments exist, rather than displaying a misleading 0%.
- WhatsApp appointment requests count persisted request rows by `created_at` in the selected period. The unique idempotency key prevents retries from counting the same request twice. A zero count is shown when no requests were created.
- The selected 7, 30, or 90-day range continues to use inclusive America/Bogota calendar dates and excludes no boundary-day records.
- No new-patients indicator is displayed. The reports response includes only the existing aggregate values used by its interface.

## Data limitations

- Consultation duration is available only for completed consultations where the application persisted `duration_seconds`; older, incomplete, or missing-duration records cannot contribute to the average.
- Cancellation rate cannot be defined when the selected period contains no appointments in supported statuses, so the interface reports “Sin datos”.
- WhatsApp request counts represent request records created, including requests later rejected, cancelled, or expired; they do not represent only successfully booked appointments.
