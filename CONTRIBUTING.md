# Contributing to SaludVital

## 1. Purpose

This document defines the Git workflow, branch naming conventions, commit message format, and Pull Request rules for SaludVital.

All source code, identifiers, configuration names, scripts, and technical documentation must be written in English. User-facing application messages must be written in Spanish.

## 2. Branching Strategy

### `main`

- Contains stable, release-ready code.
- Represents the production version of the application.
- Direct commits are prohibited by the team workflow.
- Changes must be integrated through reviewed Pull Requests.

### `develop`

- Integrates completed features for the next release.
- Serves as the base branch for new feature branches.
- Direct commits are prohibited by the team workflow.
- Changes must be integrated through reviewed Pull Requests.

### `feature/*`

- Used to develop new functionality or implement a defined issue.
- Must be created from the latest `develop`.
- Must be merged into `develop` through a Pull Request.

Examples:

- `feature/database-models`
- `feature/patient-registration`
- `feature/appointment-booking`

### `release/*`

- Used to stabilize and prepare a release.
- Must be created from `develop`.
- Only release preparation, bug fixes, and documentation updates should be included.
- After approval, the release is merged into `main` and its changes are synchronized back into `develop`.

Example:

- `release/1.0.0`

### `hotfix/*`

- Used to fix urgent defects in a released version.
- Must be created from `main`.
- Must be merged into `main` through a reviewed Pull Request.
- The fix must also be integrated into `develop` to prevent regression in future releases.

Example:

- `hotfix/prevent-duplicate-appointments`

## 3. Creating a Feature Branch

Start with an updated `develop` branch:

```bash
git switch develop
git pull origin develop
git switch -c feature/short-description
```

Each feature branch should address a clearly defined issue. Avoid combining unrelated changes in one branch.

## 4. Commit Message Convention

SaludVital uses Conventional Commits.

Format:

```text
type: short description
```

Common types:

- `feat`: add functionality.
- `fix`: correct a defect.
- `docs`: update documentation.
- `test`: add or modify tests.
- `refactor`: restructure code without changing behavior.
- `chore`: maintenance and tooling changes.
- `style`: formatting changes that do not affect behavior.

Examples:

```text
feat: add patient registration model
fix: prevent duplicate appointment bookings
docs: document database setup
test: add appointment validation tests
chore: configure development tools
```

Use English for commit messages and keep each commit focused on a meaningful change.

## 5. Pull Request Rules

Every Pull Request must:

- Target the appropriate integration branch.
- Include a clear summary and explain the purpose of the change.
- Reference the related issue.
- Describe important implementation decisions.
- Include testing evidence.
- Identify known limitations or follow-up work.
- Pass the required automated checks.
- Be reviewed and approved before merging, according to repository rules.

Feature Pull Requests target `develop`. Release and hotfix Pull Requests follow the branching strategy described above.

Do not merge a Pull Request with unresolved merge conflicts or failing required checks.

## 6. Testing and Code Quality

Before opening a Pull Request, run the checks relevant to the changes.

For the current Node.js application:

```bash
npm test
npm run lint
npx prettier --check .
npm run css:build
```

Database changes must also be tested against the configured development database.

Resolve failures before requesting integration. After resolving merge conflicts, rerun the affected tests and checks.

## 7. Code Review

Reviewers should verify:

- Correctness and consistency with the issue requirements.
- Readability and maintainability.
- Appropriate error handling and validation.
- Security and protection of sensitive information.
- Test coverage for changed behavior.
- Compliance with project conventions.

Authors should address review comments before merging.

## 8. Merge Conflicts

- Update the feature branch with the appropriate target branch when needed.
- Resolve conflicts carefully without discarding unrelated work.
- Run the affected tests and quality checks again.
- Request another review if conflict resolution changes the implementation significantly.

## 9. Branch Cleanup

After a Pull Request is merged, delete the remote feature, release, or hotfix branch when it is no longer needed and repository policy permits deletion.

Keep `main` and `develop`.

## 10. Release Workflow

1. Create `release/version` from `develop`.
2. Stabilize the release and run the required checks.
3. Merge the release into `main` through a reviewed Pull Request.
4. Tag the release according to the project's versioning policy.
5. Synchronize release fixes back into `develop`.

## 11. Hotfix Workflow

1. Create `hotfix/short-description` from `main`.
2. Implement the urgent correction and add regression tests.
3. Run the required quality checks.
4. Open a Pull Request targeting `main`.
5. Review and merge the correction.
6. Synchronize the fix into `develop`.
7. Publish a corrected release when appropriate.

## 12. Security and Sensitive Information

Never commit:

- `.env` files.
- Database passwords or production credentials.
- JWT signing secrets or access tokens.
- Real patient information.
- Private keys or other confidential configuration.

Use `.env.example` with placeholder values for documenting required environment variables.

## 13. Branch Protection

Repository administrators should configure GitHub branch protection or equivalent repository rules for `main` and `develop` where available.

Recommended settings include requiring Pull Requests, required approvals, successful status checks, and restrictions on direct pushes.

Documentation alone does not enforce these restrictions. The repository settings must be configured separately.

## 14. Issue Completion

Before closing an issue:

- Verify its acceptance criteria.
- Complete the relevant tests and quality checks.
- Integrate the changes through the required Pull Request.
- Update the issue with the outcome and any remaining limitations.

Follow this workflow to keep SaludVital's development consistent, reviewable, and maintainable.
