# Repository Guidelines

## Project Structure & Module Organization

SaludVital is an Express application built with JavaScript ES modules, Sequelize, MySQL, and Pug. Domain code lives in `src/modules/<domain>/`; shared models and authorization middleware are in `src/models/` and `src/middleware/`. Routes handle HTTP concerns, while services contain business logic. Pug pages are under `views/`, browser scripts and styles under `public/`, editable Tailwind input in `src/styles/input.css`, and migrations and seeders in `database/`. Jest and Playwright tests are grouped in `tests/unit/`, `tests/integration/`, and `tests/e2e/`.

## Build, Test, and Development Commands

- `npm run dev` starts the app with Nodemon; `npm start` runs it normally.
- `npm test -- --runInBand` runs Jest serially. Pass a test path to run a focused suite.
- `npm run test:e2e` runs the Playwright browser flows.
- `npm run lint` checks JavaScript with ESLint; `npm run format:check` checks Prettier formatting.
- `npm run css:build` compiles Tailwind from `src/styles/input.css` to generated `public/css/app.css`; do not edit the generated file directly.
- `npm run db:test:prepare` prepares the dedicated `saludvital_test` database. Never target development or production data with test setup.

## Coding Style & Naming Conventions

Use four spaces, ES modules, and the repository's ESLint and Prettier configuration. Use `camelCase` for functions and variables, `PascalCase` for models, and lowercase domain directories. Keep identifiers, filenames, comments, and technical documentation in English; user-facing text must be in Spanish. Prefer small, explicit functions and validate inputs at system boundaries.

## Testing Guidelines

Use Jest for unit and integration tests and Playwright for browser flows. Name tests `*.test.js` or `*.e2e.js`. Cover authorization, successful behavior, validation failures, and relevant edge cases. Run focused tests first, then broader relevant checks. No coverage threshold is configured.

## Commit & Pull Request Guidelines

Follow Conventional Commits in English, such as `feat(admin): add schedule filters` or `fix(patient): validate booking time`. Keep commits focused on meaningful changes. Create feature branches from updated `develop`; do not commit directly to `main` or `develop`. Pull requests should target `develop`, reference the related Issue, summarize behavior and migrations, list checks run, note limitations, and include screenshots for interface changes. Do not merge before review and required checks pass.

## Security & Configuration

Keep secrets in local environment files; never commit `.env`, credentials, tokens, private keys, or real patient data. Document required settings with placeholders in `.env.example`. Enforce authentication, role checks, ownership, and server-side validation. Reuse existing models, migrations, and audit mechanisms where possible.
