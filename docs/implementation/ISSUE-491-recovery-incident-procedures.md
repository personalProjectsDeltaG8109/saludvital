# Issue #491 — Recovery, Retention, and Incident Notes

**Review date:** 2026-11-17

**Status:** Repository and hosting review documented; backup verification and restore rehearsal deferred until before real or important data is introduced.

## What the application currently retains

| Data                                                                                  | Verified behavior                                                                                                                                                                                                                                                                                                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unverified patient registrations                                                      | The default is 30 minutes; the environment setting accepts 30 minutes through one year. A background job checks every minute in batches of up to 50. It deletes only an unverified patient account with no protected appointment, notification, conversation, audit, or other business history.                                  | `config/environment.js:25-36`; `src/modules/auth/services/unverifiedRegistrationCleanupService.js:26-30, 94-151, 158-196`; `src/modules/auth/services/unverifiedRegistrationCleanupScheduler.js:4-5, 28-45`; `.env.example:20`                                                                                                                                                                                                                                                                                          |
| Authentication sessions                                                               | A session stops being valid after three minutes without qualifying activity. Expired session hashes are removed in batches of up to 100, about once per minute.                                                                                                                                                                  | `src/modules/auth/services/sessionActivity.js:6, 48-102`; `src/modules/auth/services/sessionCleanupScheduler.js:3-4, 25-40`                                                                                                                                                                                                                                                                                                                                                                                             |
| WhatsApp message content                                                              | Message text is cleared after its configured period, with a default and maximum of 30 days. The hourly cleanup clears content; it does not delete the conversation or message record. Verification codes expire after 10 minutes, and identity sessions after 15 minutes.                                                        | `src/modules/patient/services/whatsappWebhookService.js:29-32, 64-75, 998-1028`; `src/modules/patient/services/whatsappRetentionScheduler.js:7-40`; `.env.example:63`                                                                                                                                                                                                                                                                                                                                                   |
| Verified patient account deactivation                                                 | Deactivation sets the account inactive and removes the profile photo, but keeps the account and linked records.                                                                                                                                                                                                                  | `src/modules/patient/services/profileMediaService.js:73-100`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Profile photos                                                                        | New photos are stored as files under the application's private directory. Replacing, removing, or deactivating a profile deletes the old file. The inspected Railway development web service has no mounted volume; its project also has no storage bucket. A persistent backup path for these files is therefore not confirmed. | `src/shared/services/profilePhotoStorageService.js:9-12, 100-106, 142-159`; Railway development inventory reviewed 2026-11-17                                                                                                                                                                                                                                                                                                                                                                                           |
| Appointments, consultations, prescriptions, notifications, consent, and audit records | These records are persisted in MySQL. The reviewed source has no general timed deletion job for them. Unverified-registration cleanup protects business history, and account deactivation does not erase it. A complete retention period for these records has not been defined in the reviewed source.                          | `database/migrations/20261015021350-create-appointment-management-tables.js`; `database/migrations/20261015023101-create-clinical-records-tables.js`; `database/migrations/20261015024047-create-notification-management-tables.js`; `database/migrations/20261015025110-create-audit-logs-table.js`; `database/migrations/20261113100000-create-patient-consents.js`; `src/modules/auth/services/unverifiedRegistrationCleanupService.js:79-90, 140-151`; `src/modules/patient/services/profileMediaService.js:73-100` |

These findings describe application behavior, not a legal retention schedule. The repository does not define how long every verified account, appointment, clinical record, notification, or audit record should be kept. Expiry checks on password-reset tokens do not by themselves confirm when expired token rows are deleted; that lifecycle still needs a focused review.

## Railway configuration checked

The read-only Railway inventory on 2026-11-17 showed:

- **Development:** a `saludvital-web` service connected to `develop`, with no mounted volume; and one MySQL 8 service with a 500 MB volume mounted at `/var/lib/mysql`.
- **Production project:** one MySQL 8 service with a 500 MB volume mounted at `/var/lib/mysql`. No web service was listed in that Railway project; the production application host was not identified by this review.
- Neither environment showed a Railway storage bucket or staged changes in the inventory.
- Both MySQL services use a custom start command containing `--disable-log-bin`.

A mounted volume is the database's working storage; it is not evidence of a separate backup. The available service inventory does not expose the Backups tab, so this review could not confirm whether snapshots or point-in-time recovery are enabled, their retention period, or the latest restorable time. It would be inaccurate to say that backups are absent.

Railway's current [MySQL point-in-time recovery guide](https://docs.railway.com/volumes/point-in-time-recovery) describes daily logical backups and a seven-day binlog archive when PITR is enabled. It says a restore creates a separate sibling service and leaves the source untouched. It also says a customized MySQL start command cannot be converted automatically, and enabling PITR requires a redeploy; for a single-node database that redeploy causes downtime. Storage and upload traffic may also incur cost. SaludVital's current custom command disables binlogging, so PITR must not be represented as available until the owner verifies and configures it.

## Safe recovery procedure draft

This procedure is a draft, not a completed or tested recovery runbook:

1. Name the service owner, technical operator, and privacy/incident contact. Those contacts are not documented in the repository.
2. In Railway's Backups tab, confirm backup/PITR status, retention window, most recent restorable time, and any displayed warning for development and production. Record the result without copying credentials or backup contents into GitHub.
3. If an incident occurs, record its time and affected service, restrict access to the incident record, and avoid changing or deleting the source database while the scope is being assessed.
4. After the service owner authorizes a drill, restore only to a separate, access-restricted disposable service. Do not connect the application to it and do not use a production restore as test data.
5. Verify that the restored service starts and that its schema and selected non-sensitive integrity checks match the chosen recovery point. Use synthetic data for application tests. Record the result and any gap in the available restore window.
6. A production cutover requires a separate explicit decision, a verified target, and a rollback plan. This review did not perform or authorize a cutover.
7. For a suspected privacy incident, preserve only necessary evidence, restrict who can access it, and have the designated owner assess notifications and legal obligations with qualified advice. No responsible contact or reporting timeline is asserted here.

## Existing automated coverage

The repository has unit and MySQL integration coverage for unverified-registration cleanup and expired-session cleanup, plus unit coverage for WhatsApp message-expiry calculation. Examples include:

- `tests/unit/auth/unverifiedRegistrationCleanupService.test.js`
- `tests/integration/auth/unverifiedRegistrationCleanup.mysql.test.js`
- `tests/unit/auth/sessionActivity.test.js`
- `tests/integration/auth/logout.http.mysql.test.js`
- `tests/unit/whatsappWebhookService.test.js`

These tests check application cleanup logic. They do not prove that Railway backups exist or that a database restore works.

## Checks run for this review

- Focused Jest unit tests: 3 suites passed, 26 tests passed.
- Focused MySQL integration tests against the dedicated `saludvital_test` database: 2 suites passed, 10 tests passed.
- Prettier was applied to this document. The full test suite, lint, CSS build, Playwright, and accessibility checks were not run for this documentation-only update.
- No backup restore was performed, so recovery readiness remains unverified.

## Remaining work and owner decisions

- The owner confirms there is no real or important data to protect yet. Backup/PITR setup and a restore rehearsal are deferred until before such data is introduced. At that point, inspect the Backups tab for both MySQL services, confirm retention and the latest restorable time, and decide whether PITR is needed.
- If PITR is chosen later, review the custom MySQL start command first. A redeploy, downtime, and storage/egress charges may apply; production needs its own rollback plan.
- Identify where production SaludVital is hosted and whether its database and profile-photo files are covered by backups.
- Assign the incident and privacy contacts.
- Approve retention periods for long-lived records before making public retention promises.
- Before real or important data is introduced, confirm a safe restore path and perform a rehearsal only in a disposable environment if the owner approves it.

No application code, database schema, Railway configuration, backup, or restore was changed by this review. Issue #491 was closed as not planned for now at the owner's request. This does not mean backup coverage or restoration was completed; revisit them before real or important data is introduced.
