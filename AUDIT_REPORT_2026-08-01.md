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
