# ISSUE-445 — Optimize Login Image Assets

## Scope

Reduce the download size of existing login and password-recovery artwork without changing the artwork or responsive layout.

## Implementation

- Re-encoded the login background, doctor illustration, password-security illustration, and recovery confirmation illustration as WebP at quality 96. Existing transparency is preserved for images that use it.
- Resized the transparent SaludVital logo from 1912 × 823 to 900 × 387 PNG. This remains three times wider than its largest desktop display size and preserves sharp logo edges.
- Updated Pug, CSS, and test references. The generated Tailwind stylesheet was rebuilt from `src/styles/input.css`.
- No new package, database change, or external image service was introduced.

## Measured Asset Sizes

| Asset               |              Before |             After |
| ------------------- | ------------------: | ----------------: |
| Login background    |     1,427,210 bytes |      88,968 bytes |
| Doctor illustration |       908,359 bytes |     229,430 bytes |
| SaludVital logo     |       689,671 bytes |     209,166 bytes |
| Password security   |     1,415,996 bytes |     152,542 bytes |
| Recovery link sent  |     1,449,685 bytes |     135,668 bytes |
| **Total**           | **5,890,921 bytes** | **815,774 bytes** |

The five source assets are 86.1% smaller in total. Browser pixel comparison found zero alpha-channel difference in the four WebP images; average absolute RGB differences were between 0.769 and 3.303 on a 0–255 scale.

## Verification

- `npm run css:build` — passed.
- `npm run format` and the repository-scoped Prettier command — passed; files were already formatted.
- `npm test -- --runInBand` — passed: 139 suites and 1,094 tests.
- `npm run lint` — passed.
- `npm run test:e2e` — passed across the full Playwright suite, including responsive login/recovery layouts and axe-core. The updated login E2E was run again after adding checks for all five image URLs and their MIME types; it passed and measured 815,774 transferred bytes.
- The first Jest run after changing formats found four stale assertions that expected `.png` paths. The assertions were updated to the new asset formats; the complete Jest rerun then passed.

The visual review compared the original and optimized artwork directly. Playwright confirmed the login and recovery layouts at 320, 375, 768, 912, 1,032, 1,200, 1,366, and 1,440 pixel viewport widths, with no reported horizontal overflow or accessibility violations.
