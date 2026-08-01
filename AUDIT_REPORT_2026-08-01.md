# Devil's Advocate Audit — Round 4 (PAY-001 / PAY-002)

Date: 2026-08-01 | Version: 5.11.0 | Auditor: opencode

## Outcome

Round 4 started the verification chain at the top of `docs/IMPROVEMENT_TZ.md`
(P0 — payment/subscription integrity). Both P0 items were checked against the
actual code, tests and schema, and two critical + one high problems were
corrected with tests first (TDD).

| ID | Severity | Finding | Resolution | Verification |
| --- | --- | --- | --- | --- |
| DA-37 | Critical (PAY-002) | Webhook was **not atomic**: `payment_events` was recorded *before* the business effect, and the whole handler ran outside any transaction. Any failure after the event insert left the event "processed" — Stripe's retry was skipped forever and a paid subscriber never received access. | Event record + payment/subscriber changes + audit now run inside a single `BEGIN…COMMIT` with `ROLLBACK` on failure. Handlers are synchronous (no `await` between `BEGIN` and `COMMIT`), so concurrent webhooks cannot interleave or nest transactions. | `tests/payment.test.js` — PAY-002 block: failed event leaves **no** `payment_events` row, retry completes the operation, two identical concurrent events produce exactly one business effect. |
| DA-38 | Critical (PAY-001) | No subscription state machine. `customer.subscription.updated` with status `unpaid` set `status='expired'` unconditionally (violates «unpaid не должен безусловно превращаться в expired»), `canceled` killed access immediately instead of `cancelled` (access until period end), and `past_due` was not handled at all — a subscriber whose card failed stayed `active` with an old expiry and **kept watching paid content**. | Documented state machine `STRIPE_STATUS_TO_LOCAL`: `active→active`, `trialing→trial`, `past_due→past_due`, `unpaid→past_due`, `canceled→cancelled`; unknown statuses never change access; `invoice.payment_failed` moves an `active` subscriber to `past_due`; a Stripe `active` event restores local status and re-syncs expiry from `current_period_end`. `paused` is intentionally unmapped (Stripe keeps access during a pause — preserved by the active+expiry model). | `tests/payment.test.js` — PAY-001 block: past_due/unpaid/canceled/trialing/active transitions, unknown status no-op, past_due blocked at `/can-watch`, payment_failed → past_due. |
| DA-39 | High (schema) | `subscribers.status` CHECK constraint did **not allow** `'past_due'` — the state machine could not even be stored. | Migration `008_subscription_state.sql` recreates `subscribers` with `past_due` in the CHECK (all 16 columns preserved, data copied 1:1, indexes restored). The migration runner now disables `PRAGMA foreign_keys` for the duration of each migration so `DROP TABLE` does not cascade-delete referencing rows, and re-enables it afterwards. | Full suite + `tests/i18n.test.js` column-preservation check; migration verified on a fresh DB (reset → migrate → seed). |

## TDD record

1. Added PAY-002 tests (failed event stays retryable; retry completes; two identical concurrent events → one effect). Confirmed red (event row persisted on failure).
2. Added PAY-001 tests (state transitions, unknown status no-op, past_due blocks access, payment_failed → past_due). Confirmed red — two ways:
   - `handleSubscriptionUpdated` had no `past_due` branch and mapped `unpaid`/`canceled` to `expired`;
   - the `subscribers.status` CHECK constraint rejected `'past_due'` outright.
3. Implemented migration `008` + runner FK toggle; implemented atomic webhook + state machine in `payment.service.js`.
4. Fixed migration column preservation bug (migration 003's `preferred_language` was missing from the recreated table — caught by i18n suite → 500s on `stream-token`/`/me`; added to migration 008).
5. All tests, lint and build green.

## Verification after correction

- `npx jest --runInBand`: **17 suites, 906/906 tests passed** (895 before + 11 new).
- `npm.cmd run lint`: 0 errors, 13 warnings (all pre-existing).
- `npm.cmd run build`: passes (2 pre-existing webpack performance warnings — hero-poster.jpg).

## Decisions recorded

- State machine values (`status` column): `trial`, `active`, `past_due`, `cancelled`, `expired` (plus legacy `inactive`, `suspended`). `plan` (`trial`/`monthly`/`annual`) stays independent.
- Access gate (`/can-watch`, `/stream-token`) already treats only `active`, or `cancelled` with future expiry, as paid access — `past_due` is therefore blocked by default (no grace period configured yet).
- `paused` (Stripe) is not mapped to a local state; access during a pause is preserved via the existing `active` + `subscription_expires_at` model.
- `unpaid` maps to `past_due` (no unconditional `expired`).

## Remaining risks (deferred to later rounds)

1. **PAY-003**: `checkout.session.completed` still derives the expiry locally (`now + PLAN_DURATIONS`) as a temporary fallback; the follow-up `customer.subscription.updated` corrects it from `current_period_end`. Full Stripe-`current_period_end`-as-source-of-truth needs contract tests.
2. `handlePaymentFailed` hard-codes `plan='monthly'` on the recorded failed payment.
3. **OPS-001**: `saveDb()` is a non-atomic sql.js file write (crash during write can damage the DB).
4. **DB-001**: migrations still run without an automated pre-migration backup/rollback runbook.
5. CSP retains `unsafe-inline`; `hero-poster.jpg` 2.55 MiB over budget.
6. `config.js` `REQUIRED_IN_PRODUCTION` does not yet include `STRIPE_MONTHLY_PRICE_ID`, `STRIPE_ANNUAL_PRICE_ID`, or the four Mux env vars.

---

# Devil's Advocate Audit — Round 5 (PAY-003 / config honesty)

Date: 2026-08-01 | Version: 5.12.0 | Auditor: opencode

## Outcome

Round 5 closed the PAY-003 follow-up and hardened production config, each with
tests first (TDD). One High and two Medium findings were corrected.

| ID | Severity | Finding | Resolution | Verification |
| --- | --- | --- | --- | --- |
| DA-40 | High (PAY-003) | `customer.subscription.updated` (active) overwrote `subscription_expires_at` with `current_period_end` unconditionally — a late/delayed event reporting an earlier period end could **shrink already-paid time** (ТЗ: «тесты не допускают уменьшения уже оплаченного срока»). The local fallback in `checkout.session.completed` was also undocumented. | `current_period_end` stays the source of truth, but the update now only ever extends: an existing later `subscription_expires_at` is preserved. The local `now + PLAN_DURATIONS` computation is explicitly marked as a temporary fallback (authoritative value arrives with the follow-up `subscription.updated`). | `tests/payment.test.js` — PAY-003 block: paid expiry is not shrunk by an earlier `current_period_end`; a later `current_period_end` extends; normal case still writes `periodEnd` exactly. |
| DA-41 | Medium (data quality) | `handlePaymentFailed` hard-coded `plan='monthly'` on the recorded failed payment — an annual subscriber's failure was misreported in payment history/admin. | The failed-payment row now stores the subscriber's actual `plan` from `subscribers`. | `tests/payment.test.js` — PAY-003 block: annual subscriber + `invoice.payment_failed` → recorded plan is `annual`. |
| DA-42 | Medium (config honesty) | `REQUIRED_IN_PRODUCTION` lacked the Stripe Price IDs (checkout cannot be created without them → silent runtime 400s in production). Mux keys were silently optional and could be **partially** set (signed playback works, uploads fail — no diagnostic). | `STRIPE_MONTHLY_PRICE_ID` / `STRIPE_ANNUAL_PRICE_ID` added to `REQUIRED_IN_PRODUCTION`. Mux stays optional but is validated all-or-none: a partial set is a `ConfigError` in production, a warning in development. | `tests/config.test.js`: production without Price IDs rejected; partial Mux rejected (lists missing vars); complete Mux set accepted. |

## TDD record

1. Added 3 PAY-003 tests + 1 payment_failed plan test. Confirmed red: expiry shrank to the earlier `periodEnd`, and the recorded plan was `monthly`.
2. Implemented never-shrink guard in `handleSubscriptionUpdated`, fallback comment in `handleCheckoutCompleted`, and subscriber-plan lookup in `handlePaymentFailed`.
3. Added 3 config tests (Price IDs required, Mux all-or-none in prod, complete Mux set OK) and updated the baseline acceptance test to include the new required vars. Implemented in `config.js`.
4. Full suite, lint and build green.

## Verification after correction

- `npx jest --runInBand`: **17 suites, 912/912 tests passed** (906 before + 6 new).
- `npm.cmd run lint`: 0 errors, 13 warnings (all pre-existing).
- `npm.cmd run build`: passes (2 pre-existing webpack performance warnings — hero-poster.jpg).

## Decisions recorded

- Price IDs are fail-fast required in production (honest config), consistent with the existing Stripe key requirement — a production deploy that cannot create checkouts must not boot silently.
- Mux keys remain per-lesson optional (a Cloudflare-only deploy must stay valid) but partial configuration is now impossible without a clear error.

## Remaining risks (deferred to later rounds)

1. **OPS-001**: `saveDb()` is a non-atomic sql.js file write (crash during write can damage the DB).
2. **DB-001**: migrations run without an automated pre-migration backup/rollback runbook.
3. **DOC-001/DOC-002**: Payment Flow + subscription state machine + provider/recurrence strategy still undocumented in `docs/API.md`/`docs/ARCHITECTURE.md`/ADR.
4. CSP retains `unsafe-inline`; `hero-poster.jpg` 2.55 MiB over budget.
5. **Manual production step**: create Stripe Price objects and fill `STRIPE_MONTHLY_PRICE_ID`/`STRIPE_ANNUAL_PRICE_ID` + the four Mux vars (all-or-none).

---

# Devil's Advocate Audit — Round 6 (OPS-001)

Date: 2026-08-01 | Version: 5.13.0 | Auditor: opencode

## Outcome

Round 6 hardened the persistence layer: the sql.js database was written
in-place by a debounced `fs.writeFile`, so a crash mid-write (or a disk-full /
process kill) could truncate `qigong.db` and lose the whole dataset.

| ID | Severity | Finding | Resolution | Verification |
| --- | --- | --- | --- | --- |
| DA-43 | High (OPS-001) | `saveDb()` wrote `db.export()` directly to `qigong.db` with `fs.writeFile`. Non-atomic: a crash during the write leaves a truncated/corrupt DB — the only copy of all subscribers, payments and content is destroyed in place. | `saveDb()` now writes the buffer to a temp file in the same directory and atomically renames it over the real DB. A failed write leaves the previous file untouched and cleans up the temp file. | `tests/db.test.js` (new suite, 3 tests): temp-then-rename is actually used; a saved DB round-trips through a fresh sql.js reload; a simulated `fs.writeFileSync` failure keeps the pre-crash DB intact with no `.tmp` litter. |

## TDD record

1. Wrote 3 tests first (temp+rename used; round-trip after save; crash keeps previous DB). Confirmed red against the old in-place `writeFile` (no temp path involved).
2. Replaced `saveDb()` internals with temp-file + rename and temp cleanup on failure.
3. Full suite green, order-independent (new suite uses `resetDb()` + fake timers, isolated per test).

## Verification after correction

- `npx jest --runInBand`: **18 suites, 915/915 tests passed** (912 before + 3 new).
- `npx jest --runInBand --randomize`: green (order-independence holds with the new suite).
- `npm.cmd run lint`: 0 errors, 13 warnings (all pre-existing).
- `npm.cmd run build`: passes (2 pre-existing webpack performance warnings — hero-poster.jpg).

## Decisions recorded

- Sync write in the debounced timer (single-threaded, small DB) is fine; `fs.renameSync` replaces the destination on both POSIX and Windows (MoveFileEx + REPLACE_EXISTING).

## Remaining risks (deferred to later rounds)

1. **DB-001**: migrations still run migrate-on-start without an automated pre-migration backup / rollback runbook.
2. **DOC-001/DOC-002**: Payment Flow + subscription state machine + provider/recurrence strategy still undocumented in `docs/API.md`/`docs/ARCHITECTURE.md`/ADR.
3. CSP retains `unsafe-inline`; `hero-poster.jpg` 2.55 MiB over budget.
4. **Manual production step**: Stripe Price IDs + Mux keys (all-or-none) must be filled before a production deploy can boot.

---

# Devil's Advocate Audit — Round 7 (DOC-001 / DOC-002)

Date: 2026-08-01 | Version: 5.14.0 | Auditor: opencode

## Outcome

Round 7 closed the documentation chain for the payment module: the Payment Flow,
the subscription state machine, the atomicity/retry contract, the period
source-of-truth rule and the provider/recurrence strategy are now formally
documented in the three spec documents, matching the code exactly.

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| DA-44 | Medium (DOC-001) | `docs/API.md` Payment section did not describe the state machine, atomicity, retry semantics or the never-shrink period rule — and had **no scenario table** for `card_declined` / timeout / delayed webhook / manual revoke with user-facing messages and tests. | API.md Payment section rewritten: state-machine table (Stripe→local, access rules), webhook atomicity + idempotency, PAY-003 never-shrink, config table, and a full scenario table (server result / user message / retry rule / covering test). |
| DA-45 | Medium (DOC-002) | Provider and recurrence strategy was undocumented; `docs/ARCHITECTURE.md` only described Cloudflare Stream, with a stale test count and a partial env-var table (no Stripe Price IDs / Mux vars). | ARCHITECTURE.md gained Stripe (subscriptions) + Mux (video) integration subsections; env table extended (4 required Stripe vars + Mux all-or-none); stale test coverage updated to 18 suites / 915 tests. |
| DA-46 | Medium (ARCH-001 / ADR) | No ADR recorded the payment architecture decisions made in Rounds 4–5. | ADR-010 «Subscription State Machine, Atomic Webhook Processing, Period Integrity» appended with alternatives considered and consequences. |

## Verification after correction

- Docs-only round: **915/915 tests, 18 suites** unchanged; `npm.cmd run lint` 0 errors; `npm.cmd run build` passes.
- Cross-checked every statement in the docs against the code (`payment.service.js`, `config.js`, gating routes) — the documentation no longer promises behaviour the code does not have.

## Remaining risks (deferred to later rounds)

1. **DB-001**: migrations run migrate-on-start without an automated pre-migration backup / rollback runbook.
2. **OPS-002**: CI quality gate not yet wired to require the full test+lint+build gate.
3. CSP retains `unsafe-inline`; `hero-poster.jpg` 2.55 MiB over budget (documented known debts).
4. **Manual production step**: Stripe Price IDs + Mux keys (all-or-none) must be filled before a production deploy can boot.

---

# Devil's Advocate Audit — Round 8 (DB-001)

Date: 2026-08-01 | Version: 5.15.0 | Auditor: opencode

## Outcome

Round 8 closed the migration-safety gap: schema changes were applied
migrate-on-start with no automated snapshot before mutation and no runbook for
restore, transforms, or ownership.

| ID | Severity | Finding | Resolution | Verification |
| --- | --- | --- | --- | --- |
| DA-47 | High (DB-001) | `runMigrations()` applied pending migrations in place with **no pre-migration snapshot** — a failed/partial forward migration had no automated rollback target, and there was no runbook documenting restore, per-file data transforms, or who decides to restore. | `runMigrations()` now snapshots the DB to `data/backups/pre-migration-<ts>.db` (in-memory export) before applying any pending migration (skipped in `NODE_ENV=test`). New `docs/DB_RUNBOOK.md` documents backup/restore, the forward-only policy (rollback = replace `qigong.db` from snapshot), the migration catalog with per-file transforms (nothing touches `payments`/`payment_events`; migration 008 copies `subscribers` 1:1), a dry-run checklist on a production-like copy, and the restore decision owner. | `tests/db.test.js` — DB-001 test: the backup produced by `createPreMigrationBackup(db)` is a valid sql.js snapshot containing the current data. |

## TDD record

1. Wrote the DB-001 test first (backup snapshot is a valid DB with current data). Confirmed red (function did not exist).
2. Implemented `createPreMigrationBackup` + the pre-migration hook in `runMigrations()`.
3. Wrote `docs/DB_RUNBOOK.md` and cross-linked it from `ARCHITECTURE.md` / `DEPLOYMENT.md`.
4. Full suite, lint and build green.

## Verification after correction

- `npx jest --runInBand`: **18 suites, 916/916 tests passed** (915 before + 1 new).
- `npx jest --runInBand --randomize`: green.
- `npm.cmd run lint`: 0 errors, 13 warnings (all pre-existing).
- `npm.cmd run build`: passes (2 pre-existing webpack performance warnings — hero-poster.jpg).

## Decisions recorded

- Migration policy is **forward-only**; rollback always goes through the pre-migration snapshot. No `down` migrations are introduced.
- Backups are never auto-deleted; cleanup is the owner's manual step.

## Remaining risks (deferred to later rounds)

1. **OPS-002**: CI quality gate not yet wired to require the full test+lint+build gate (and `jest --randomize`).
2. **API-001** revision: verify the unified error format across remaining endpoints.
3. CSP retains `unsafe-inline`; `hero-poster.jpg` 2.55 MiB over budget (documented known debts).
4. **Manual production step**: Stripe Price IDs + Mux keys (all-or-none) must be filled before a production deploy can boot.

---

# Devil's Advocate Audit — Round 9 (OPS-002)

Date: 2026-08-01 | Version: 5.16.0 | Auditor: opencode

## Outcome

Round 9 fixed the CI quality gate: the pipeline could go green while lint and
build actually failed, and the lint step covered only `server/`.

| ID | Severity | Finding | Resolution | Verification |
| --- | --- | --- | --- | --- |
| DA-48 | High (OPS-002) | `ci.yml` had `continue-on-error: true` on **lint and build** — a green CI was possible with lint errors and a broken production build. Lint only ran against `server/` (not `src/` or `tests/`), and the suite ran without the order-independence check. | Both `continue-on-error` flags removed; lint now uses `npm run lint` (the project's real scope: `server/ src/ tests/`); tests run `npm run test:ci` = `jest --runInBand --randomize --forceExit` (full suite in randomized order); build must pass; npm scripts are the single source of truth. | `npm run test:ci` locally: **18 suites, 916/916 passed** with a randomized seed. Docs updated (DEPLOYMENT.md: required-status-check instructions). |

## TDD record

1. Wrote `test:ci` npm script and the new honest `ci.yml` (gate first).
2. Verified `npm run test:ci` green locally (randomized order, 916/916).
3. Rewrote the CI section in `docs/DEPLOYMENT.md` (quality gate + required status check before merge).

## Verification after correction

- `npm run test:ci`: 18 suites, 916/916 passed (randomized seed, `--forceExit` clean).
- `npm.cmd run lint`: 0 errors, 13 warnings (all pre-existing).
- `npm.cmd run build`: passes (2 pre-existing webpack performance warnings — hero-poster.jpg).
- The workflow file itself will be exercised by GitHub Actions on the next push.

## Decisions recorded

- CI is a single required gate; no per-suite jobs, no `continue-on-error`. `--forceExit` retained to avoid hanging CI on lingering handles (documented, not silent).

## Remaining risks (deferred to later rounds)

1. **API-001** revision: verify the unified error format across remaining endpoints.
2. **API-003**: machine-readable access-denial reasons (`code` in gate responses).
3. CSP retains `unsafe-inline`; `hero-poster.jpg` 2.55 MiB over budget (documented known debts).
4. **Manual production steps**: Stripe Price IDs + Mux keys (all-or-none); mark `quality-gate` as required status check in branch protection.

---

# Devil's Advocate Audit � Round 10 (API-003)

Date: 2026-08-01 | Version: 5.17.0 | Auditor: opencode

## Outcome

Round 10 implemented the first API-contract item from `docs/IMPROVEMENT_TZ.md`
(API-003): machine-readable denial reasons in the access gates. The gates did
not expose a stable code the frontend could act on, and `stream-token` reported
provider problems (503) instead of the access reason for a denied user.

| ID | Severity | Finding | Resolution | Verification |
| --- | --- | --- | --- | --- |
| DA-49 | Medium (API-003) | `can-watch`/`stream-token` denial responses had no stable machine-readable `code`; the frontend could only guess intent (e.g. any 403 on `can-watch` was rendered as "confirm email"). `stream-token` also checked provider availability *before* access, so a denied user got `503 Streaming not configured` � revealing the deployment setup and masking the real reason. | Both gates now return a stable `code` while keeping existing fields and HTTP statuses: `GRANTED`, `SUBSCRIPTION_EXPIRED`, `PAYMENT_PAST_DUE`, `FREE_LIMIT_REACHED`, `SUBSCRIPTION_REQUIRED`, `EMAIL_CONFIRMATION_REQUIRED`. `stream-token` checks access first (403 + code, before any provider check). No video path or Stripe internals are exposed. | `tests/payment.test.js` � API-003 block: one contract test per code (8 tests) plus the existing past_due test now asserts `PAYMENT_PAST_DUE`. |
| DA-50 | Medium (API-003) | `POST /api/user/login` rejected unconfirmed users with a `FORBIDDEN` code � not the TZ-listed `EMAIL_CONFIRMATION_REQUIRED` � and login.html's `EMAIL_NOT_CONFIRMED` string match never fired against the structured error. | `ForbiddenError` gained an optional machine code; login returns `403` with `error.code = 'EMAIL_CONFIRMATION_REQUIRED'`. Frontend (login.html/player.html) now acts on the machine code and renders per-code actions (subscription expired / payment failed / subscription required / free limit). | API-003 login contract test (403 + code); frontend built cleanly. |

## TDD record

1. Wrote 9 red tests in `tests/payment.test.js` (8 new + 1 modified past_due assertion); confirmed red (9 failed): codes absent, past_due reported `subscription_expired`, stream-token returned 503 for denied users.
2. Implemented code mapping in `server/routes/user.js` (can-watch + stream-token) and moved the stream-token access check before the provider check.
3. Discovered the unconfirmed-email gate is login (no token is ever issued), moved that contract test to `POST /api/user/login` and added the machine code via `ForbiddenError.machineCode` (`errors.js`) + `formatError` pass-through.
4. Updated `src/pages/player.html` (per-code denial UI) and `src/pages/login.html` (machine-code branch).
5. Full suite, lint and build green.

## Verification after correction

- `npx jest --runInBand --silent`: **18 suites, 924/924 tests passed**.
- `npm.cmd run lint`: 0 errors, 13 warnings (all pre-existing).
- `npm.cmd run build`: passes (2 pre-existing webpack performance warnings � hero-poster.jpg).

## Decisions recorded

- Codes: `GRANTED`, `SUBSCRIPTION_EXPIRED`, `PAYMENT_PAST_DUE`, `EMAIL_CONFIRMATION_REQUIRED`, `FREE_LIMIT_REACHED`, `SUBSCRIPTION_REQUIRED`. `PAYMENT_PAST_DUE` (payment failed) is deliberately distinct from `SUBSCRIPTION_EXPIRED` so the UI can offer "update payment method" vs "renew".
- HTTP status contract unchanged for existing clients: `can-watch` denies with `200 + allowed:false` (403 only for unconfirmed email); `stream-token` denies with `403`.
- `stream-token` access-before-provider is the fixed order; a genuinely misconfigured deployment still yields 503, but only for users who would be granted access.

## Remaining risks (deferred to later rounds)

1. **API-001** revision: verify the unified error format across remaining endpoints.
2. CSP retains `unsafe-inline`; `hero-poster.jpg` 2.55 MiB over budget (documented known debts).
3. **Manual production steps**: Stripe Price IDs + Mux keys (all-or-none); mark `quality-gate` as required status check in branch protection.
4. `player.html` still swallows `stream-token` errors silently (`catch(_){}`); per-code action for stream-token denials can be surfaced in a later round.

---

# Devil's Advocate Audit � Round 11 (API-001)

Date: 2026-08-01 | Version: 5.18.0 | Auditor: opencode

## Outcome

Round 11 unified the error format across the payment, auth and user domains per
`docs/IMPROVEMENT_TZ.md` API-001. The codebase had ~80 inline `{ error: 'text' }`
responses (string) mixed with the structured `formatError` output, so clients
could not rely on stable codes and the frontend had to guess from English text.

| ID | Severity | Finding | Resolution | Verification |
| --- | --- | --- | --- | --- |
| DA-51 | High (API-001) | payment/auth/user error responses were inconsistent: inline `{ error: 'string' }` (validations, gates, 500s, RBAC, auth middleware, rate-limiters) vs structured `{ success:false, error:{code,message,requestId} }` from `formatError`. The frontend rendered `[object Object]` on several pages because `error` became an object in some paths, and could not switch on codes. `validateBody` (shared by all three domains) and the auth middleware (server/auth.js) returned raw strings. | Added `sendError(res, status, code, message, requestId, extra)` to `errors.js`; `formatError` now also emits `requestId` at the top level (kept nested for old clients). Converted **every** inline error in `routes/payment.js`, `routes/user.js` (incl. 4 rate-limiters), `routes/auth.js`, `middleware/validation.js`, `middleware/rbac.js` and `server/auth.js` to `sendError`/`formatError` with stable codes (e.g. `INVALID_PLAN`, `VALIDATION_ERROR`, `EMAIL_ALREADY_REGISTERED`, `INVALID_CONFIRMATION_TOKEN`, `NO_TOKEN`/`TOKEN_REVOKED`/`INVALID_TOKEN`, `FORBIDDEN`, `RATE_LIMITED`, gate codes, `STREAMING_NOT_CONFIGURED`, domain 500 codes). Gate 403s keep the top-level `code` (API-003 compatibility). `error` stays a top-level key (transition), `error.message` keeps the old English text. | New `tests/error-format.test.js` (10 contract tests across register/login/confirm/can-watch/stream-token/payment/admin-auth) asserting `success:false`, `error.code`, `error.message`, top-level `requestId`. 6 existing tests updated from string `.error` assertions to `error.code`/`error.message`. |
| DA-52 | Medium (frontend) | `profile.html` (4 places) and `plans.html` rendered `esc(d.error)` / `data.error` � with the structured shape this shows `[object Object]`. | Added `errText(d)` helper in `profile.html` (object > `.message`, string > itself) and inline extraction in `plans.html`. `login.html` already switches on `error.code`. | Frontend build passes; no remaining frontend `.error` string reads on converted endpoints (grep-verified). |

## TDD record

1. Wrote `tests/error-format.test.js` (10 contract tests). Confirmed red (9 failed).
2. Implemented `sendError` + `formatError` requestId change; converted validation.js, rbac.js, server/auth.js, auth.js limiter, all of payment.js and user.js.
3. Ran the full suite: 6 legacy assertions on string `error` failed as expected; updated them to the new shape.
4. Fixed the one single-line gate 403 that replaceAll missed (stream-token email guard).
5. Updated frontend (profile.html, plans.html). Full suite, lint, build green.

## Verification after correction

- `npx jest --runInBand --randomize --silent`: **19 suites, 934/934 tests passed**.
- `npm.cmd run lint`: 0 errors, 13 warnings (all pre-existing).
- `npm.cmd run build`: passes (2 pre-existing webpack performance warnings � hero-poster.jpg).

## Decisions recorded

- Canonical shape: `{ success:false, error:{code,message}, requestId }`; `requestId` also mirrored at `error.requestId` for old `formatError` clients. Transition keeps `error` as the top-level key (message moved inside).
- Gate 403s (stream-token/can-watch) additionally return a top-level `code` (API-003 legacy + player tests).
- `validateBody` now uses `VALIDATION_ERROR` + joined details in message (details array kept as legacy top-level field).
- Rate-limiters (express-rate-limit `message`) return `{ success:false, error:{code:'RATE_LIMITED', message} }`.

## Remaining risks (deferred to later rounds)

1. **AUTH-001**: password reset flow (request, one-time TTL token, change, revoke sessions).
2. Admin CRUD / uploads / proxy endpoints in `server/index.js` still use the legacy string `{ error }` shape � not part of the payment/auth/user acceptance scope; can be unified in a later round.
3. CSP retains `unsafe-inline`; `hero-poster.jpg` 2.55 MiB over budget (documented known debts).
4. **Manual production steps**: Stripe Price IDs + Mux keys (all-or-none); mark `quality-gate` as required status check in branch protection.
5. `player.html` still swallows `stream-token` errors silently (`catch(_){}`); per-code action for stream-token denials can be surfaced in a later round.

---

# Devil's Advocate Audit � Round 12 (AUTH-001)

Date: 2026-08-01 | Version: 5.19.0 | Auditor: opencode

## Outcome

Round 12 implemented password recovery per `docs/IMPROVEMENT_TZ.md` AUTH-001.
Before this round the app had **no way** to reset a forgotten password: a locked-out
subscriber could only register a new account. The reset flow is one-time-token +
TTL + session revocation + enumeration protection.

| ID | Severity | Finding | Resolution | Verification |
| --- | --- | --- | --- | --- |
| DA-53 | High (AUTH-001) | No password recovery existed. A subscriber with a forgotten password could never log in again; there was no token store, no reset endpoint, no TTL and no way to invalidate previously issued JWTs after a password change (only `revokeCurrentToken` existed for the acting token). | Added `POST /api/user/request-reset` (always `{success:true}`, never reveals email existence, rate-limited `RATE_LIMIT_MAX_RESET` default 3/min) and `POST /api/user/reset-password` (one-time SHA-256-hashed token with 1-hour TTL, `INVALID_RESET_TOKEN` / `VALIDATION_ERROR` / `RESET_FAILED` codes, rate-limited `RATE_LIMIT_MAX_RESET_PASSWORD` default 5/min). Reset bumps `subscribers.token_version`; subscriber JWTs now carry `ver` and auth middleware rejects tokens whose `ver` does not match the current version, so **all old sessions are rejected** after a password change. Migration `009_password_reset.sql` adds the three columns (base schema updated too; ALTER is idempotent). | New `tests/password-reset.test.js` (9 tests: no-reveal on unknown email, token stored with TTL and never leaked in the response, invalid/missing/expired token 400, short password 400, full flow � old session `TOKEN_REVOKED`, old password 401, new password works, one-time reuse rejected; email template contains no password; rate limit 429). |
| DA-54 | Medium (frontend) | No UI existed for the flow. | New `src/pages/reset-password.html` (request email + set-new-password views keyed off `?token=`), `login.html` "������ ������?" link, clean URL route `/reset-password` + webpack page entry. `tests/integrity.test.js` exempt lists updated for the new standalone auth page. | Frontend build passes; 946/946 tests randomized. |

## TDD record

1. Wrote `tests/password-reset.test.js` (9 contract tests). Confirmed red (9 failed).
2. Implemented migration `009`, `auth.service.requestPasswordReset/resetPassword`, `ver` claim in `generateToken`, auth-middleware version check, mailer `sendPasswordResetEmail`/`RESET_PASSWORD_HTML`, routes + reset limiters (custom `keyGenerator` using `ipKeyGenerator` for IPv6 safety; test-only `x-test-key` to isolate the rate-limit check).
3. Green on the new suite; full run exposed 3 `integrity.test.js` failures for the new page � added `reset-password.html` to the standalone-page exempt lists and switched the back link to `login.html` (project convention).
4. Full suite randomized, lint, build all green.

## Verification after correction

- `npx jest --runInBand --randomize --silent`: **20 suites, 946/946 tests passed** (934 + 9 new reset tests + 3 new integrity assertions picked up by the page scan).
- `npm.cmd run lint`: 0 errors, 13 warnings (all pre-existing).
- `npm.cmd run build`: passes (2 pre-existing webpack performance warnings � hero-poster.jpg).

## Decisions recorded

- **Enumeration protection**: `request-reset` always answers `{success:true}`; invalid-format emails short-circuit to the same response; server errors are logged, not surfaced.
- **Token storage**: the raw 32-byte token is never stored � only its SHA-256 hash, matching the `token_blocklist` practice (stronger than the plaintext `confirmation_token` legacy).
- **One-time + TTL**: token is cleared on successful use; expiry checked as ISO timestamp.
- **Session revocation**: `subscribers.token_version` + `ver` JWT claim + middleware comparison. Old tokens (no `ver` claim, pre-deploy) are unaffected; every new login bakes in the current version. Admin tokens carry no `ver` and are untouched.
- **Rate limits**: `RATE_LIMIT_MAX_RESET` (3/min prod) and `RATE_LIMIT_MAX_RESET_PASSWORD` (5/min prod); both use a custom `keyGenerator` (IPv6-safe via `ipKeyGenerator`) and honor `x-test-key` only under `NODE_ENV=test` so tests can exercise 429 in isolation.
- **Dev/console UX**: the reset link is logged (`[mailer] Password reset link: ...`) mirroring the confirmation-link log; production responses never include it.

## Remaining risks (deferred to later rounds)

1. **API-003 ����������**: `player.html` still swallows `stream-token` errors (`catch(_){}`); per-code action for stream-token denials can be surfaced later.
2. **Admin/CRUD legacy errors**: `server/index.js` + admin CRUD still use the legacy string `{error}` shape (outside the API-001 payment/auth/user scope).
3. CSP retains `unsafe-inline`; `hero-poster.jpg` 2.55 MiB over budget.
4. **Manual production steps**: Stripe Price IDs + Mux keys (all-or-none); `quality-gate` as required status check in branch protection.
