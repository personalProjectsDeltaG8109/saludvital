# Issue #507 — Asset sources and permitted use

**Review date:** 2026-11-18  
**Branch:** `docs/507-asset-provenance`  
**Status:** Preliminary inventory recorded. The project owner reports that all listed visual assets were generated with ChatGPT. This source statement is not independently verifiable from the repository and does not by itself establish exclusive copyright or rights in any material used as an input.

## What the repository confirms

- There are 54 tracked visual files under `public/brand`, including logos, login artwork, navigation icons, error illustrations, and patient-page images. The exact files are grouped below.
- Git history shows when files were added or changed, but the checked commits do not record an original source link or a license for these files. Some commit titles say artwork was supplied; that does not establish its ownership or redistribution permission.
- A literal-path search found no direct reference for ten files: `logo-primary-dark.png`, `logo-symbol-background.png`, `logo-symbol-dark.png`, `logo-vertical-background.png`, `mobile-login.jpg`, the four doctor portraits, and `shield-svgrepo-com.svg`. This search does not prove they are unused; code may build paths dynamically.
- The stylesheet imports Tailwind and the tracked public directory contains no local font files. No font-provider import was found in the editable stylesheet.
- `package.json` declares `ISC`, and the README repeats that declaration. No standalone `LICENSE`, `NOTICE`, or attribution file is tracked. This does not prove that the project owns every bundled image or that the package declaration covers third-party art.
- The public footer says “Todos los derechos reservados” in `views/auth/partials/footer/public-footer.pug`. Repository records alone do not confirm ownership of every asset displayed with that wording.

## Owner-reported asset origin

The project owner reports that all 54 tracked visual assets listed below were generated with ChatGPT. The repository does not contain the prompts, original generation records, or a file-by-file link to those conversations, so this is recorded as owner-provided provenance rather than independently verified evidence.

OpenAI's Terms of Use say that, between OpenAI and the user and to the extent permitted by applicable law, the user owns the output. The terms also warn that outputs may not be unique and do not transfer rights to third-party material. Colombia's DNDA says that output generated only from AI prompts is not registrable as a human-authored work. These points mean the project can document the reported ChatGPT origin, but should not claim exclusive copyright solely because ChatGPT generated an image. See [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/) and [DNDA guidance on AI-generated works](https://www.derechodeautor.gov.co/es/sala-de-prensa/campanas-pedagogicas/preguntale-al-abogado).

## Asset inventory

The repository does not record a confirmed original source or permission document for the following visual files. Their names and commit history are clues, not proof. Runtime profile photos uploaded by users are not included in this static-file inventory.

| Area                     | Tracked files                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Error pages              | `public/brand/403-medical-illustration.png`, `404-medical-illustration.png`, `500-medical-illustration.png`                                                                                                                                                                                                                                      |
| Administrator navigation | `public/brand/admin-sidebar-icons/appointments.png`, `audit.png`, `doctors.png`, `home.png`, `logout.png`, `notifications.png`, `profile.png`, `reports.png`, `schedules.png`, `specialties.png`, `users-roles.png`, `whatsapp-chatbot.png`                                                                                                      |
| Doctor navigation        | `public/brand/doctor-sidebar/home.png`, `patients.png`, `profile.png`, `schedule.png`, `schedules-availability.png`                                                                                                                                                                                                                              |
| Patient navigation       | `public/brand/patient-sidebar/appointments.png`, `book-appointment.png`, `clinical-history.png`, `home.png`, `notifications.png`, `profile.png`, `reschedule-appointment.png`                                                                                                                                                                    |
| Login and recovery       | `public/brand/login/background-login.webp`, `girl.webp`, `logo-login.png`, `password-security.webp`, `recovery-link-sent.webp`                                                                                                                                                                                                                   |
| Patient pages            | `public/brand/patient/banner-appoinments.png`, `banner-home-patient.png`, `doctor-camila-torres.png`, `doctor-carlos-ramirez.png`, `doctor-test-profile.png`, `doctor-valentina-rios.png`, `imageSidebar.png`, `logo-primary-background.png`                                                                                                     |
| Shared brand and icons   | `public/brand/calendar-svgrepo-com.svg`, `heart.webp`, `logo-primary-dark.png`, `logo-primary.png`, `logo-symbol-background.png`, `logo-symbol-dark.png`, `logo-symbol.ico`, `logo-symbol.png`, `logo-vertical-background.png`, `logo-vertical.png`, `logout-icon.png`, `mobile-login.jpg`, `shield-svgrepo-com.svg`, `whatsapp-svgrepo-com.svg` |

## Direct dependency license metadata

The following values were read from the installed package manifests. They describe package metadata; they are not a legal review or proof that all license obligations have been met. The `package-lock.json` contains 658 package entries; this checkout has readable metadata for 572 installed entries, so this report is not a complete inventory of every locked transitive package.

| Group                 | Packages and declared license metadata                                                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime               | `bcrypt` (MIT), `cookie-parser` (MIT), `dotenv` (BSD-2-Clause), `express` (MIT), `express-rate-limit` (MIT), `helmet` (MIT), `jsonwebtoken` (MIT), `mysql2` (MIT), `nodemailer` (MIT-0), `pug` (MIT), `sequelize` (MIT), `sharp` (Apache-2.0)                           |
| Development and tests | `@axe-core/playwright` (MPL-2.0), `@eslint/js` (MIT), `@prettier/plugin-pug` (MIT), `@tailwindcss/cli` (MIT), `eslint` (MIT), `jest` (MIT), `nodemon` (MIT), `playwright` (Apache-2.0), `prettier` (MIT), `sequelize-cli` (MIT), `supertest` (MIT), `tailwindcss` (MIT) |

One installed transitive package (`config-chain`) provides its MIT license as an object with a URL rather than a simple license string. It needs to be included in a normalized dependency notice if the project chooses to publish one.

## Information needed to finish

The owner-reported ChatGPT origin is now recorded for the visual files. To complete the review, confirm whether any generation used an existing logo, photograph, mockup, or other third-party image as an input, and retain the original outputs and prompts when available. Any such input needs its own source and permission review; generated output does not grant rights to the input.

The owner should also confirm who owns the SaludVital logo/brand and whether the footer wording is appropriate. Until those questions are answered, the inventory records the reported origin but does not assert exclusive ownership or make replacement decisions. No asset was deleted, replaced, or re-licensed in this review.

## Verification

- Checked tracked visual files with `git ls-files public` and counted 54 files.
- Checked source references for the file paths; ten did not have a literal path match and were left in place.
- Checked Git history for representative login artwork and logo files; history records additions but not original licenses.
- Checked `package.json`, `package-lock.json`, installed direct dependency metadata, README license notes, footer wording, and tracked license/notice files.
- Checked the editable stylesheet for font imports and local public font files.
- Recorded the project owner's statement that all listed visual assets were generated with ChatGPT; this statement could not be independently confirmed from repository history.

No application code or database files were changed. No screenshot or test change was required for this documentation-only inventory.
