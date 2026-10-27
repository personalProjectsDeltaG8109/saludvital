# US-ADM-33 — Upload or Remove Administrator Profile Photo

## Implementation

- Added a nullable `users.profile_photo_url` column with a reversible migration because administrator accounts do not have their own photo field.
- Added an accessible camera control over the profile avatar. It is the only photo-management entry point and opens a dialog with upload/change, remove when available, and cancel actions; there is no separate photo section.
- Reused the existing `doctorPhotoService` storage and signature validation. JPG, PNG, and WEBP files are limited to 2 MB. The browser validates file type and size, previews the selection, and updates the avatar only after the API confirms persistence.
- Protected upload and removal endpoints use the authenticated administrator ID. Photo replacement and removal preserve the existing image when validation, storage, database, or audit persistence fails. Stored-file cleanup happens only after the database transaction succeeds.
- Photo changes are recorded through the existing audit table without storing image data or file paths.

## Validation

- Unit tests cover administrator authorization, storage and audit ordering, replacement/removal, and preservation after persistence failures.
- Browser tests cover keyboard access, mobile layout, client validation, preview, failed-upload recovery, successful avatar updates, and removal confirmation.
- Apply the migration with `npm run db:migrate` before using administrator photo management.

## Constraints

No new dependencies were added. The existing storage infrastructure supports JPG, PNG, and WEBP; all three are accepted to remain consistent with current profile-photo handling.
