# Issue 482 — Dependency and Secret Review

**Review date:** 2026-11-16

**Branch:** `docs/482-dependency-secret-review`
**Issue:** [#482](https://github.com/personalProjectsDeltaG8109/saludvital/issues/482)

## Scope and method

Reviewed the package manifest and lockfile, the CI workflow, tracked environment-file names, and repository commit history. The local `.env` file was not opened, searched, or printed. No application code, package version, schema, or CI setting was changed during this review.

`npm audit` reported **30 advisories** in the full dependency tree: 1 high, 26 moderate, and 3 low. The production-only check reported **5 advisories**: 1 high and 4 moderate. These are dependency findings, not failing application tests.

## Production dependency findings

| Package and installed version                 | Severity | Evidence and impact                                                                                                                                                                                                                                                                               | Suggested next step                                                                                                  |
| --------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `body-parser` 2.3.0, included through Express |     High | The advisory describes a denial-of-service risk for certain compressed request bodies with trailing data. The project uses Express request parsing, so review parser limits and upgrade to a patched compatible version. [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) | Plan a focused patch-version update and rerun HTTP/parser tests. Do not apply the audit's suggested changes blindly. |
| `nodemailer` 10.1.2, direct dependency        | Moderate | The advisory covers versions before 10.1.4 and describes a recipient-routing risk when untrusted input is used to build an email recipient. [GHSA-m943-m63m-w62w](https://github.com/advisories/GHSA-m943-m63m-w62w)                                                                              | Review every `to` address source and update to a patched compatible version with email-outbox tests.                 |
| `qs` 6.16.0, transitive dependency            | Moderate | The advisory concerns a specific `stringify` option and crafted values. The affected call pattern must be checked before estimating application reachability. [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw)                                                            | Locate `qs.stringify` calls and verify options and input sources; update through the parent dependency if needed.    |
| Sequelize / `uuid` dependency chain           | Moderate | npm audit reports an advisory in the installed tree. The described UUID issue depends on how callers supply output buffers; an audit finding alone does not show that SaludVital uses that vulnerable pattern. [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)           | Confirm the exact dependency path and call pattern; avoid npm's suggested major downgrade of Sequelize.              |

The other 25 findings are in development/test dependencies. They still matter to developer and CI machines, but they are not part of the production-only result. The full audit output should be reviewed when each dependency family is handled.

## Secret exposure review

A targeted, redacted pattern scan inspected **1,047 commit trees** for common provider-token and private-key formats and found **0 candidate matches**. The scan output did not display secret values. The tracked-file check found `.env.example`; `.env` is not tracked in this checkout.

No dedicated secret-scanning utility was installed, and a pattern scan cannot recognize every secret format. This result means no match was found by the selected patterns; it is not proof that no secret was ever committed. GitHub's secret-scanning settings were not inspected.

## CI and recommended follow-up

The current CI installs dependencies and runs application checks but has no dependency-advisory or secret-scanning step. Adding a blocking audit gate immediately would fail on the findings above. Recommended order:

1. Review and fix the production advisories in separate, tested dependency changes.
2. Review development-tool advisories without accepting major-version downgrades automatically.
3. Enable a maintained secret scanner and a dependency check in CI after deciding how findings are triaged and who owns them.
4. Rotate credentials only if a real exposed credential is confirmed; no candidate was found in this scan.

Asset licensing remains tracked separately under H-12. No license inventory was performed as part of this package-and-secret check.

## Verification record

- `npm audit`: 30 findings; exits non-zero because advisories are present.
- `npm audit --omit=dev`: 5 findings; exits non-zero because advisories are present.
- Targeted redacted history scan: 1,047 commit trees inspected, 0 candidate matches.
- Dedicated secret scanner: unavailable in the local environment.
- `npm run format`: passed; no unrelated project files were reformatted.
- Explicit Prettier command for application, test, view, style, and CI files: passed; files were already formatted.
- `npm test -- --runInBand`: passed, 149 suites and 1,152 tests.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run css:build`: passed. The pre-existing local `public/css/app.css` was restored from a byte-for-byte backup; its SHA-256 remained `220D813DE7D56DFCAE8EEFE2C7BBF53960A178251B1A21F219A45690B54B5B0A`.
- `npm run test:e2e`: passed; all browser flows in the script, including responsive and available axe-core checks, completed successfully.
- `git diff --check`: passed after the final documentation edit.
