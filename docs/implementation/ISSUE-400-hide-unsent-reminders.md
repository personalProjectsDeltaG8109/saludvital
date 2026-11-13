# Issue #400 — Hide Unprocessed Reminders from Patient History

## Goal

Keep scheduled reminder jobs in the delivery queue without presenting them as notifications the patient has already received.

## Implementation

- Reused the existing `Notification` records and appointment activity history. No queue, schema, or provider behavior changed.
- Added one patient-scoped notification filter shared by history retrieval, unread counts, individual read updates, and the mark-all-read operation.
- Non-reminder notification records keep their existing visibility. Appointment reminders appear after a recorded processing result (`Sent`, `Failed`, or `OutcomeUnknown`) or as a queued retry after at least one attempt. Unattempted pending reminders, in-progress attempts without a result, and cancelled reminders stay out of the patient history.
- A reminder awaiting another attempt is labeled “Pendiente de reintento”; its persisted application status is not presented as confirmed delivery.
- Appointment creation, rescheduling, and cancellation continue to come from the existing appointment history and retain their separate read receipts.

## Verification

- Focused Jest: `tests/unit/patient/notificationReadState.test.js` passed (1 suite, 17 tests).
- Full Jest suite: passed (141 suites, 1,107 tests).
- `npm run format` and the repository's targeted Prettier write command completed with files unchanged.
- `npm run lint` and `npm run format:check` passed.
- `npm run css:build` passed. The pre-existing local `public/css/app.css` change was restored after the build.
- `npm run test:e2e` completed successfully, including patient notification history and available axe-core checks.
- `git diff --check` passed for the issue changes.

## Limitations

- The current interface paginates the combined patient history in the browser. This change preserves that existing behavior; it does not add server-side history pagination.
