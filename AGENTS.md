# Repository Guidelines

## Project Structure & Module Organization

SaludVital uses Express, JavaScript ES modules, Sequelize/MySQL, and Pug. Domain code is in `src/modules/<domain>/routes/` and `services/`; shared models and authentication middleware are in `src/models/` and `src/middleware/`. Views live in `views/`; browser assets are in `public/`. Migrations and seeders are in `database/`; tests are grouped under `tests/unit/`, `tests/integration/`, and `tests/e2e/`.

## Build, Test, and Development Commands

- `npm install` installs dependencies. `npm run dev` starts Nodemon; `npm start` starts the app normally.
- `npm test` runs Jest; `npm run test:e2e` runs browser end-to-end tests.
- `npm run lint` checks JavaScript with ESLint; `npm run format:check` checks Prettier formatting.
- `npm run css:build` builds Tailwind CSS; `npm run css:watch` watches source styles.
- `npm run db:migrate` applies migrations; `npm run db:seed` loads seed data. Configure a local environment and database first.

## Coding Style & Naming Conventions

Use ES modules and four-space JavaScript indentation. Name variables/functions in `camelCase`, Sequelize models in `PascalCase`, and domain directories in lowercase. Keep routes thin; put business logic in services. Use Pug for server-rendered pages, Spanish for user-facing copy, and English for identifiers. Run ESLint and Prettier on changed files. Edit `src/styles/input.css`, not generated `public/css/app.css`.

## Testing Guidelines

Jest discovers `*.test.js` files under `tests/`; name tests for the behavior or module. Use unit tests for isolated logic, integration tests for routes/database behavior, and `npm run test:e2e` for browser workflows. No coverage threshold is configured. Use only the test database for destructive test setup.

## Commit & Pull Request Guidelines

Recent commits use concise conventional prefixes, for example `feat(admin): add user management` and `fix(patient): validate profile updates`. Keep commits focused. Target pull requests at `develop`; summarize changes, link issues, list verification, and include screenshots for UI changes. Mention migrations, configuration, and checks not run.

## Security & Configuration

Keep secrets in local environment configuration, never in commits. Enforce authentication, role access, ownership, and validation on the backend. Do not log passwords, tokens, or unnecessary patient data; reuse existing models, audits, and migrations.
