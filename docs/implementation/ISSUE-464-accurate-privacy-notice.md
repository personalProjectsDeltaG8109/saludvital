# Issue #464 — Align the Public Privacy Notice with Current Data Handling

## Scope

Reconcile the public privacy notice and terms with behavior verified in the application. This work changes public wording only; it does not change data collection, deletion, provider delivery, or database behavior. The draft must be reviewed by the project owner before it is merged or published. It is not legal advice or a compliance certification.

## Verified application behavior

- Patient, account, appointment, consultation, emergency-contact, notification, and WhatsApp records are stored through the existing MySQL models. The patient model includes identity/contact details and optional health fields; consultations include symptoms, vital signs, notes, recommendations, and medical orders.
- The patient profile deactivation flow disables the account and removes its profile-photo file, but leaves the user, patient, and linked appointment/notification history in the database.
- The unverified-registration cleanup defaults to 30 minutes, runs on an approximately one-minute scheduler, and deletes only eligible unverified registrations without protected business or audit references. The retention period is configurable with a minimum of 30 minutes.
- WhatsApp message content defaults to a 30-day retention and can be configured to a shorter period. Values above 30 days are rejected by the cleanup configuration. Cleanup clears message content but retains conversation/message records and metadata.
- No general automatic retention period for appointment, consultation, notification, or audit history was found in the application cleanup services.
- The application contains adapters for Resend, Meta WhatsApp Cloud API, and Inalambria Express. Their presence in source does not prove they are currently connected. When delivery is enabled, the selected provider receives the address and message content needed for delivery.
- Provider-side storage periods and data locations cannot be verified from this repository. The privacy contact already published by the project is retained.

| Data category                         | Existing purpose                                                             | Retention evidence                                                                                                                                         | Provider path                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Account and patient identity/contact  | Account access, verification, patient profile, and communication preferences | Eligible unverified registrations are removed using the configured cleanup rule. No general cleanup period for verified account/profile records was found. | Resend handles account email when configured; notification providers handle selected destinations when delivery is enabled.            |
| Appointments                          | Booking, rescheduling, cancellation, and appointment history                 | No general automatic cleanup period was found. Deactivation does not erase linked appointments.                                                            | A notification provider receives the destination and message needed for an appointment event when the channel is selected and enabled. |
| Consultation and health details       | Doctor consultation and patient history                                      | No general automatic cleanup period was found.                                                                                                             | The inspected appointment notification adapters do not use consultation notes as message content.                                      |
| Profile photos and emergency contacts | Profile display and patient-designated emergency contact                     | Account deactivation removes the profile-photo file; emergency-contact database retention has no automatic cleanup rule in the inspected service.          | No provider transfer was found in the inspected notification paths.                                                                    |
| Notification records                  | Appointment-related communication, delivery status, and history              | No general automatic cleanup period was found.                                                                                                             | Resend, Meta WhatsApp Cloud API, or Inalambria Express may receive the selected destination and message content when configured.       |
| WhatsApp conversation messages        | Chatbot conversations and supported appointment workflows                    | Message content is cleared after the configured period (30 days by default, maximum 30); conversation and message metadata remain.                         | Meta WhatsApp Cloud API handles messages when configured and enabled.                                                                  |

## Owner-confirmed demonstration guidance

Seeded examples are synthetic. The project owner confirmed that authorized testers may use their own identity and contact details for controlled testing. Clinical examples must remain fictional, and users must not enter other people's personal information.

## Draft changes

- Expanded the privacy notice's data categories to include account, contact, profile, emergency-contact, appointment, notification, and health information supported by the models.
- Distinguished synthetic seeded data and fictional clinical examples from an authorized tester's own identity/contact data.
- Described the implemented registration and WhatsApp-content cleanup rules, account deactivation behavior, and the absence of a general automatic cleanup schedule for other history.
- Clarified provider roles and that adapter availability does not prove a live connection.
- Directed data inquiries to the already published privacy email without inventing an automated request workflow or response deadline.
- Aligned the terms page with the owner-confirmed controlled-testing practice.

## Validation

- `tests/integration/legalPages.test.js` now checks the public pages for the verified retention and provider statements.
- Test and formatting results are recorded after execution.

## Review limitation

The wording is a factual project draft based on code and owner-confirmed testing guidance. The project owner must approve it before merge. Obtain qualified legal review before describing it as legally sufficient or using SaludVital as a real healthcare service.

## Legal reference checked

The official [Law 1581 of 2012 text](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981) was checked as a primary reference for the general rights language. This check does not determine which legal duties apply to a specific deployment and is not legal advice.
