# Issue #294 — Administrator Doctor Status Counts

## Problem

The doctor directory previously derived the inactive count by subtracting active doctors from the total. The summary now queries active and inactive doctor profiles directly through their associated user-account status.

## Implementation

- Reused the existing `Doctor` and `User` association and persisted `User.is_active` value.
- Added one focused count helper used for both account states. Summary metrics remain independent of directory search, specialty, status filters, and pagination.
- Kept the existing total, scheduled, and directory behavior unchanged.
- Added unit assertions that both active and inactive counts filter through the required user association.
- No migration, schema, dependency, or activation-rule change was needed.

## Verification

- `npm test -- --runInBand tests/unit/adminDoctorService.test.js`
