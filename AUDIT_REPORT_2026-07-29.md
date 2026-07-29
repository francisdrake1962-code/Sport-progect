# Devil's Advocate Audit — Round 3

Date: 2026-07-29

## Outcome

The audit re-ran the test suite, production configuration checks, linting,
build, deployment configuration, and prior audit claims. One critical and two
material quality problems were corrected with tests first.

| ID | Severity | Finding | Resolution | Verification |
| --- | --- | --- | --- | --- |
| DA-34 | Critical | Known administrator credentials were embedded in the database initializer. | Production requires explicit `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`; legacy untouched defaults are removed before a secure bootstrap account is created. Test credentials exist only under `NODE_ENV=test`. | `tests/config.test.js` |
| DA-35 | High | Render lacked the bootstrap administrator contract and no safe environment template existed. | Added required Render secrets and `.env.example` without real credentials. | `render.yaml`, `.env.example` |
| DA-36 | Medium | The advertised `npm run lint` command yielded 1,419 errors because browser/Jest globals and the module entry point were not configured. | Declared the actual environments in ESLint. | `npm run lint` — 0 errors |

## TDD record

1. Added tests that a production boot without administrator credentials fails.
2. Confirmed the test failed against the old implementation.
3. Added production configuration validation and secure database bootstrap.
4. Added a password-strength regression test and confirmed all configuration tests pass.

## Verification after correction

- `npm.cmd test -- --runInBand`: 14 suites, 866 tests passed.
- `npm.cmd run lint`: passed with 0 errors and 8 warnings.
- `npm.cmd run build`: passed. Webpack reports two performance warnings.

## Remaining risks

1. CSP retains `unsafe-inline` for scripts and styles. Removal requires moving inline handlers/scripts to bundled modules, then adding CSP regression tests.
2. `saveDb()` uses a non-atomic sql.js write; a crash during persistence can damage the database. Use write-to-temp plus atomic rename, or a transactional database service.
3. `images/hero-poster.jpg` is 2.55 MiB and exceeds the bundle performance budget. Provide responsive WebP/AVIF assets.
4. Local secrets were present in `.env` during review. The file is ignored, but the relevant external-provider credentials should be rotated.
