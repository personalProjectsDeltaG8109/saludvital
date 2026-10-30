# US-DOC-12 — Update Doctor Contact and Address Information

## Implementation

- Added an authenticated `PUT /api/doctor/profile` endpoint. The authenticated user ID determines the doctor record; clients cannot select or update another doctor's profile.
- Doctors can update their primary phone, optional alternate phone, street address, department, and municipality. Email, identity, specialty, registration, and other protected fields are rejected.
- Primary phone remains in `users.phone`. Added nullable doctor-specific fields for alternate phone and address/location through a reversible migration. Existing doctor records remain valid and display unavailable values until edited.
- Reused the existing Colombian location catalog and phone/text validators. The server verifies that the selected municipality belongs to the selected department and stores canonical location names.
- Updates are applied in one transaction with row locks. Invalid values are rejected before persistence; submitting unchanged values does not write changes.
- Added an edit form with Save and Cancel actions. Cancel restores persisted values; failures retain entered values. The UI displays Spanish feedback and refreshes the displayed profile after success.
- Existing authentication and session data are not changed. No email, account role, specialty, identity, or professional registration editing was added.

## Data and limitations

The doctor schema previously had no address, department, municipality, or alternate phone fields, so the migration adds these nullable columns. Existing values cannot be backfilled reliably. The current schema does not store phone-verification status; the view therefore does not claim that a phone is verified.

## Verification

Automated test results are recorded in the implementation report for this branch. The Playwright profile check also captures responsive mobile and desktop screenshots in the ignored `test-results/` directory.
