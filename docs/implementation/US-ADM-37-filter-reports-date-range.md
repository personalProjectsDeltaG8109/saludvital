# US-ADM-37 — Filter Reports by Date Range

## Implementation

- Added an accessible period selector for the last 7, 30, and 90 calendar days. The default remains 30 days.
- The selected period is reflected in the page URL and sent to the protected reports endpoint. Changing it automatically reloads report data.
- Added strict backend validation for supported period values. Invalid values return a Spanish 400 response.
- Applied a single `America/Bogota` calendar range to appointment summaries, unique-patient count, specialty distribution, doctor ranking, appointment trends, consultation duration, and persisted WhatsApp request counts.
- Date bounds include the selected start and end calendar dates by querying from local midnight on the first day up to, but not including, local midnight on the following day.
- Results from a previous selection are hidden during loading. Older concurrent responses cannot replace the latest selection.
- Reused the US-ADM-36 report service, endpoint, page, chart partial, and styles. No schema or dependency changes were needed.

## Validation

- Unit tests cover 7/30/90-day date bounds across every metric, default period, invalid period values, and all rendered selector options.
- Browser tests cover automatic period changes, hidden stale results during loading, updated date labels, accessible loading and error feedback, and responsive layouts.
