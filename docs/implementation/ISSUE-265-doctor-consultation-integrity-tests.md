# Issue #265 — Doctor Consultation Authorization, Concurrency, and Persistence Tests

## Scope

Added automated verification for the existing doctor consultation service. No production logic, schema, or dependencies changed.

## Coverage

- Unauthenticated requests cannot access consultation pages, retrieval, draft, or completion endpoints.
- A doctor cannot retrieve, save, or complete a consultation owned by another doctor; service responses remain non-disclosing `404` errors.
- Draft fields, diagnoses, prescriptions, and prescription items persist through the existing consultation transaction.
- A simulated diagnosis persistence failure confirms MySQL rolls back earlier consultation changes and diagnosis deletion in the same transaction.
- Two simultaneous completion requests result in one successful completion, one conflict, and one completion history event.
- Integration fixtures are created and removed only in `saludvital_test`; the test refuses any other database.

## Verification

- Focused Jest: 4 suites passed, 63 tests passed.
- Full Jest: 112 suites passed, 854 tests passed.
- ESLint: passed.
- Prettier (`npm run format`, the repository's requested explicit write command, and `npm run format:check`): passed; no unrelated formatting changes remained.
- Tailwind CSS build: passed.
- Full Playwright end-to-end suite: passed, including the consultation flow at mobile, tablet, and desktop widths and axe-core accessibility checks.

## Limitations

This work verifies existing safeguards and does not change clinical behavior. It does not substitute for production database isolation monitoring or load testing.
