# Devil's Advocate Audit — Round 14 (test isolation / DB-002 / ARCH-001)

Date: 2026-08-06 | Version: 5.22.0 | Auditor: opencode

## Outcome

Round 14 continued the verification chain of `docs/IMPROVEMENT_TZ.md` (P0 and
P1 closed in Rounds 4–13). Two real bugs and one documentation-accuracy problem
were corrected with tests first (TDD). The round opened with a false red: the
baseline run of `npm run test:ci` reported **51 failures** — root cause was not
the product but the test harness itself hitting a stale dev server.

| ID | Severity | Finding | Resolution | Verification |
| --- | --- | --- | --- | --- |
| DA-56 | High (test isolation) | `tests/backend.test.js` hard-coded `TEST_PORT = 3001` — the **default dev port**. A leftover dev server bound to `:3001` hijacked every request made by the suite (the suite's own `start()` co-existed on the same port); the suite then tested the *stale* server: `GET /api/lessons` returned an empty catalog (migration 015) and `admin@qigong.com/admin123` login returned 401 — 51 false failures unrelated to the code. | Moved the suite to a dedicated `TEST_PORT = 3012` (matching the codebase convention: payment 3004, i18n 3005, mux 3008, uploads 3010) and made `apiRequest` read `TEST_PORT` instead of a literal. Added a port-isolation regression test asserting the suite never uses the default dev port 3001. | `tests/backend.test.js` — «Port isolation» test fails on `TEST_PORT === 3001`, passes on 3012; full `npm run test:ci` restored to green. |
| DA-57 | Medium (ARCH-001) | `FEATURE_REGISTRY.md` referenced `server/services/schedule.service.js`, a module **removed in v5.10.0** (asserted by `backend.test.js` itself), and the header still claimed «Last updated: v4.1.0». The registry — the project's canonical feature map — described a module that does not exist. | Added a reference-integrity test to `tests/integrity.test.js`: every `server/…` code reference in `FEATURE_REGISTRY.md` must point to an existing file, and removed modules are banned. Removed the obsolete F126 row and bumped the header to v5.21.1. | `tests/integrity.test.js` — «Round 14 — FEATURE_REGISTRY reference integrity»: fails on the missing `schedule.service.js` reference before the fix, passes after. |
| DA-58 | High (DB-002 / PAY-001) | `handlePaymentFailed` wrote the subscriber's `plan` into `payments.plan`, whose CHECK constraint allows only `('monthly','annual')`. A `trial`-plan subscriber (Stripe fires `invoice.payment_failed` at the end of a trial) triggered `CHECK constraint failed: plan IN ('monthly', 'annual')` inside the webhook transaction — the whole event rolled back and remained **retryable forever**, with access stuck. `adminGrantAccess` already mapped `trial→monthly`; the webhook path did not. | `handlePaymentFailed` now maps `trial → monthly` before writing the failed-payment row (consistent with `adminGrantAccess`). | `tests/payment.test.js` — new PAY-003 test: trial-plan subscriber + `invoice.payment_failed` → event `processed:true`, recorded `plan='monthly'`, no rollback. |

## TDD record

1. **DA-56**: wrote the port-isolation test first (fails: `TEST_PORT === 3001`); moved the suite to 3012 and pointed `apiRequest` at `TEST_PORT`; green.
2. **DA-58**: wrote the trial-plan webhook test first — red with `CHECK constraint failed: plan IN ('monthly', 'annual')` and event rolled back; implemented `trial→monthly` mapping; green (65/65 in the payment suite).
3. **DA-57**: wrote the registry reference-integrity test first — red (`missing = ["server/services/schedule.service.js"]`); removed the obsolete F126 row and updated the header; green (137/137 in the integrity suite).

## Verification after correction

- `npm run test:ci`: **20 suites, 1002/1002 tests passed** (998 baseline + 1 port isolation + 1 trial-plan + 2 registry integrity), randomized order.
- `npm run lint`: 0 errors.
- Root-cause note: the false red was caused by a stale `node server/index.js` (PID 20648) left from a previous session on the default port; it was stopped and `test:ci` immediately returned green. This is now impossible to hit silently because the suite uses a dedicated port.

## Decisions recorded

- Test suites always use dedicated ports, never the default dev port 3001; a port-isolation test enforces it for `backend.test.js`.
- `payments.plan` CHECK stays `('monthly','annual')`; the single allowed source value `trial` is mapped to `monthly` at the write boundary (same rule as `adminGrantAccess`).
- `FEATURE_REGISTRY.md` is guarded by a link-integrity test so removed modules cannot be reintroduced in docs.

## Remaining risks (deferred to later rounds)

1. **OBS-001 (observation)**: payment-domain critical actions (checkout creation, payment completed/failed, subscription changes) are logged to the app logger after commit but do not appear in the `audit_log` table served by `GET /api/admin/audit-logs`. Grant/revoke/backup/restore already write audit rows. Wiring the webhook handlers into `audit_log` inside the PAY-002 transaction needs a transaction-aware insert (calling `saveDb()` mid-transaction is unsafe) — deferred to avoid touching the tested webhook atomicity.
2. **ARC-001**: `auth.service.js`, `progress.service.js`, `feedback.service.js`, `repositories/` exist but are still `NOT WIRED` per `FEATURE_REGISTRY.md`; the payment domain remains the only service-layer reference implementation.
3. **DB-002 residual**: `payments.provider_checkout_session_id` has no UNIQUE constraint (uniqueness currently relies on Stripe session IDs); webhook idempotency is enforced by `payment_events.event_id UNIQUE`.
4. CSP retains `unsafe-inline`; `hero-poster.jpg` 2.55 MiB over budget (documented P3 debts).
5. **Manual production steps**: Stripe Price IDs + Mux keys (all-or-none) must be set before a production deploy; re-fill the empty lesson catalog (migration 015 cleared it for relaunch).

---

# Devil's Advocate Audit — Round 15 (local video upload, catalog without external services)

Date: 2026-08-06 | Version: 5.23.0 | Type: feature work per client request

## Outcome

The client asked to defer email/Mux/payment setup and make the **catalog work
first** — upload video files, compose lessons and a calendar, fill in forms —
with debugging on a single video file to follow. Email stays on the `console`
provider; payments are deferred until the program is complete.

Audit of the current state found the catalog CRUD, image upload, local
playback (`video_provider='local'` + `video_url='/videos/…'`, stream-token
protected), calendar (`lessons.date`) and console email all already work with
**zero configuration**. The gap was the client's actual request — *«загружать
файл»*: video could only be attached either via Mux (requires keys) or by
manually dropping a file into `videos/` and typing the URL. There was no way to
upload a video file from the admin panel without Mux.

| ID | Type | Finding | Resolution | Verification |
| --- | --- | --- | --- | --- |
| DA-59 | Feature (client request) | No local video file upload existed: the admin UI only offered Mux direct upload (`mux-upload` returns 400 without `MUX_*` keys) or a manual URL field. | Added `POST /api/admin/lessons/:id/video/local-upload` (multipart `file` + `language`): multer disk-storage → `videos/` (overridable via `VIDEOS_DIR`, used by tests), `video_uploads` row (`provider='local'`, `status='ready'`, `original_filename`, `file_size`), `lessons.video_url`/`video_provider='local'`/`video_id=NULL`, `lesson_media` upsert (`status='ready'`), audit row, and cleanup (DB row + file) on any error — a missing lesson leaves no orphan file. `videosDir` was hoisted to the top of `server/index.js` and is shared with the `/videos/{*splat}` serving route. | `tests/admin-video-uploads.test.js` — 8 new tests: auth 401, role 403, invalid id, unsupported extension, upload+DB link+file-on-disk, 404 missing lesson, no orphan file, replace previous fields. RED (404 before the route) → GREEN (21/21 in the file). |
| DA-60 | UI (client request) | The admin panel gave no way to trigger the new local upload. | `src/admin/js/stream-upload.js` renders a «Локальный файл (без Mux)» block: file input, progress bar, on success the `/videos/…` URL is placed into the «URL видео» field and the user is told to click «Сохранить». `lessons.html` already derives `video_provider` from the filled URL (`video_provider: videoIdVal ? 'mux' : (videoUrlVal ? 'local' : null)`), so no HTML changes were required. Mux section untouched. | Build passes; lint 0. |

## TDD record

1. Wrote the local-upload tests first (auth, role, validation, happy path,
   cleanup). RED: all endpoint calls returned 404/route-missing before
   implementation. Implemented the route + multer storage. GREEN (21/21 in the
   file, including the 13 pre-existing mux/status/delete tests).
2. Ran the full randomized suite after the change: **1010/1010 tests, 20
   suites** (1002 baseline + 8 new). `npm run lint`: 0 errors.

## Decisions recorded

- The catalog is now fully workable **without** Mux, Stripe, or SMTP:
  upload `.mp4/.mov/.webm/.avi/.mkv` → `videos/`, lesson becomes
  `provider='local'` with a stable `/videos/<имя файла>` URL. Filenames are
  preserved as-is so the file name ↔ catalog number mapping the client works on
  stays intact.
- Test isolation is preserved: the upload test suite points `VIDEOS_DIR` at a
  temp dir and removes it in `afterAll`, so no real `videos/` files are touched.
- `payments.plan` CHECK, audit wiring, and the Mux/Stripe production steps are
  untouched this round — they remain on the deferred list below.

## Deferred (client-driven order)

1. **Fill the catalog** (manual): upload files, compose lessons/complexes,
   calendar dates, forms.
2. **Debug on one video file**: player playback, access gates (trial/free/paid),
   progress.
3. **Test email** — client chose `console`-log for now; later Gmail App
   Password / Mailpit (generic SMTP support in `mailer.js`) / Resend.
4. **Mux** — client registers; fill `MUX_*` (all-or-none + signing pair), move
   lessons to `provider='mux'`.
5. **Payments** — deferred until the program is complete (Stripe Price IDs,
   webhook).
6. Audit candidates when resuming P2: OBS-001, admin `{error}` legacy, ARC-001,
   CSP `unsafe-inline`, `hero-poster.jpg` 2.55 MiB.
