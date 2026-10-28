# US-ADM-35 — View Additional Administrator Account Information

## Implementation

- Extended the authenticated administrator profile with the persisted account update timestamp and the email verification timestamp.
- Kept the existing registration date, last access, and verification status. All dates use the existing `es-CO` and `America/Bogota` formatting convention.
- The profile query selects only these safe account fields in addition to the existing profile projection. Password hashes, verification tokens, and other credentials remain excluded.
- Missing timestamps use the existing Spanish “Sin información registrada” fallback; the verification date is omitted unless the persisted account is verified and the timestamp exists.
- No schema, model, or dependency changes were required because the fields already exist on `users`.

## Validation

- Unit tests cover the safe projection and rendering of available and missing values.
- Browser tests cover the displayed additional account fields; integration tests confirm the profile page remains protected.
