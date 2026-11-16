# Issue #485 — Authentication limits behind the hosting proxy

## Problem

Authentication rate limits used the address detected by Express without accounting for the Railway public edge. Requests could therefore be grouped under a proxy address instead of the visitor's address. Trusting forwarded headers globally would also let untrusted clients influence their rate-limit identity.

## Changes

- Added one shared helper for the login, registration, and password-recovery limits.
- The helper uses Railway's `X-Real-IP` only when the deployment exposes its Railway public-domain setting and the request also carries Railway's edge marker. The address must be a valid IP.
- Local, malformed, and unmarked requests use the socket-derived Express IP. `X-Forwarded-For` is not used.
- Kept the existing five-attempt limits and login successful-request behavior unchanged.
- Added HTTP tests for distinct trusted client addresses, malformed addresses, and untrusted forwarding headers.

## Deployment note

The checked Railway development service currently has one web replica, so the existing in-memory rate-limit store covers its active deployment. If the service is scaled to multiple replicas, a shared rate-limit store will be needed so each replica sees the same counters. No database change or package was added for the current single-replica setup.

## Verification

- Focused Jest/Supertest: 4 suites passed, 6 tests passed, including existing registration, password-recovery, and login-lockout checks.
- Full Jest: 150 suites passed, 1,156 tests passed.
- ESLint, repository formatting, the requested explicit Prettier write command, and CSS build passed.
- `npm run test:e2e` passed, including responsive and axe-core checks. The initial launch exited before useful diagnostics; the isolated browser test and full rerun both passed.
- `git diff --check` passed. Git printed only a line-ending notice for the user's existing `public/css/app.css` change; the file was restored from an exact backup after formatting and CSS build.
