# PROGRESS — Roadmap Bookmark

> This file is a resume-point for the next AI session.
> Read this file first, then continue from "NEXT ACTIONS".
> Last updated: 2026-08-06 v5.23.0 (Round 15 — local video upload, no Mux)

---

## CURRENT STATE

**Version**: 5.23.0 (Round 15 — local video upload in admin, no Mux/Stripe/email needed; see `AUDIT_REPORT_2026-08-06.md`)
**Tests**: 1010/1010 passing (20 suites), order-independent (verified with `jest --randomize`; CI runs `npm run test:ci`)
**Lint**: 0 errors, 13 warnings (pre-existing: Jest globals in ESLint config)
**Build**: passes (2 existing warnings — hero-poster.jpg 2.55MiB size)
**GitHub**: All commits pushed to `francisdrake1962-code/Sport-progect`

### Git Log (recent)
```
v5.23.0: Round 15 — local video upload (POST /api/admin/lessons/:id/video/local-upload, multer→videos/, provider='local', admin UI block, VIDEOS_DIR override, 8 tests; catalog workable without Mux/Stripe/email) (1010/1010)
v5.22.0: Devil's Advocate Round 14 — dedicated test port 3012 (isolation from dev :3001), trial→monthly map in handlePaymentFailed (payments.plan CHECK), FEATURE_REGISTRY reference-integrity test + F126 cleanup (1002/1002)
v5.21.1: lessons.audience field (migration 018) — admin + catalog + player blocks
v5.21.0: Cloudflare Stream removed, Mux-only video provider (migrations 014–017)
v5.19.1: CI fix — ESLint 10 requires Node >=20.19, GitHub Actions matrix 18 -> 22/24, engines + DEPLOYMENT.md updated (GitHub 'project not successful' notifications were failing lint on Node 18)
v5.19.0: Devil's Advocate Round 12 — AUTH-001 password reset (request-reset always {success:true}, one-time 1h SHA-256 token, reset-password, token_version session revocation of all old JWTs, reset page + login link, 9 tests)
v5.18.0: Devil's Advocate Round 11 — API-001 unified error format `{success:false, error:{code,message}, requestId}` across payment/auth/user (sendError helper, all inline errors converted, frontend errText, 10 contract tests, 6 tests updated)
dbc37025b v5.17.0: Devil's Advocate Round 10 — API-003 machine-readable access denial codes (can-watch/stream-token/login, access-before-provider, per-code frontend actions)
0cf3ecd8 v5.15.0: Devil's Advocate Round 8 — DB-001 pre-migration backups, DB runbook, forward-only migration policy
a40ac162 v5.14.0: Devil's Advocate Round 7 — DOC-001/DOC-002 Payment Flow, subscription state machine, provider/recurrence strategy (API.md, ARCHITECTURE.md, ADR-010)
64b97258 v5.13.0: Devil's Advocate Round 6 — OPS-001 atomic saveDb (temp file + rename, crash-safe)
31b987ac v5.12.0: Devil's Advocate Round 5 — PAY-003 paid-period integrity (never shrink), payment_failed real plan, honest config (Price IDs required, Mux all-or-none)
```

---

## TECH SPEC COMPLIANCE

Source: `C:\Ded\спорт\Разное\Аналиp-аудит GPT.txt`
Plan: `C:\Ded\спорт\Разное\План корректировки после аудита от Опен.txt`

| Phase | Content | Status |
|-------|---------|--------|
| Phase 1 — Stabilization | Pagination, Token Revocation, Config Validation, DB Transactions, DB Migrations | ✅ DONE (v5.0.0) |
| Phase 2 — Testing | Security tests (38 tests), JWT bug fix, Error handler fix | ✅ DONE (v5.1.1) |
| Phase 3 — Refactoring | Error Model, Request ID, Logging, Service Layer, Repository Layer, Route Wiring | ✅ DONE (v5.3.0) |
| Phase 4 — Production Hardening | CI/CD, Audit logging, GDPR, Monitoring, Backup/Restore | ✅ DONE (v5.4.0) |
| Phase 5 — Product Evolution | Analytics, Recommendations, Content Versioning | ✅ DONE (v5.5.0) |
| Round 1 — Devil's Advocate | 12 P0 critical security/data fixes | ✅ DONE (v5.5.1) |
| Round 2 — Tech Spec Compliance | RBAC, Security Headers, Validation, API Versioning, Shutdown, Readiness, Docs | ✅ DONE (v5.6.0) |
| Payment Module | Stripe recurring, webhooks, manual grants, admin panel | ✅ DONE (v5.6.1–v5.7.0) |
| i18n Internationalization | Multi-language UI + lesson_media | ✅ DONE (v5.8.0) |
| Audit Fixes v5.9.0 | API response unwrap, frontend bugs, test port | ✅ DONE (v5.9.0) |
| Security Hardening Round 4 | Stream-scoped JWT, rate limiting, Stripe config, dead code, test fixes | ✅ DONE (v5.10.0) |
| Devil's Advocate Round 4 | PAY-002 atomic webhook, PAY-001 subscription state machine, `past_due` schema | ✅ DONE (v5.11.0) |
| Devil's Advocate Round 5 | PAY-003 paid-period integrity, failed-payment plan, honest production config (Price IDs + Mux all-or-none) | ✅ DONE (v5.12.0) |
| Devil's Advocate Round 6 | OPS-001 atomic `saveDb()` (temp file + rename, crash-safe) | ✅ DONE (v5.13.0) |
| Devil's Advocate Round 7 | DOC-001/DOC-002 Payment Flow, state machine, provider strategy (API.md / ARCHITECTURE.md / ADR-010) | ✅ DONE (v5.14.0) |
| Devil's Advocate Round 8 | DB-001 pre-migration backups + DB runbook (`docs/DB_RUNBOOK.md`) | ✅ DONE (v5.15.0) |
| Devil's Advocate Round 9 | OPS-002 honest CI quality gate (no `continue-on-error`, randomized full suite, required status check) | ✅ DONE (v5.16.0) |
| Devil's Advocate Round 10 | API-003 machine-readable access denial codes (`GRANTED`/`SUBSCRIPTION_EXPIRED`/`PAYMENT_PAST_DUE`/`EMAIL_CONFIRMATION_REQUIRED`/`FREE_LIMIT_REACHED`/`SUBSCRIPTION_REQUIRED`; access-before-provider; contract tests; frontend action per code) | ✅ DONE (v5.17.0) |
| Devil's Advocate Round 11 | API-001 unified error format `{success:false, error:{code,message}, requestId}` on payment/auth/user (`sendError` helper; every inline `{error:'...'}` converted to stable codes; gates keep top-level `code`; frontend `errText`; 10 contract tests + 6 updated) | ✅ DONE (v5.18.0) |
| Devil's Advocate Round 12 | AUTH-001 password reset (`request-reset` always `{success:true}` — no email enumeration; one-time SHA-256 token + 1h TTL; `reset-password` bumps `token_version` → all old JWTs rejected; reset page + login link; 9 tests) | ✅ DONE (v5.19.0) |

---

## PHASE 3 STATUS — ✅ COMPLETE (v5.3.0)

### All Phase 3 deliverables done:

**Infrastructure** (v5.2.0):
- `server/helpers/errors.js` — 8 error classes + formatSuccess/formatError
- `server/middleware/requestId.js` — X-Request-Id auto-generation
- `server/helpers/logger.js` — createLogger, requestLogger, JSON structured logging
- Global error handler in index.js uses unified error model

**Service Layer** — all wired into routes:
- `server/services/auth.service.js` — wired into auth.js + user.js
- `server/services/progress.service.js` — wired into user.js (GET /me, PUT /me)
- `server/services/schedule.service.js` — NOT wired (calendar route logic doesn't match service)
- `server/services/feedback.service.js` — wired into index.js (all 8 subscriber+admin feedback routes)
- `server/services/dashboard.service.js` — NEW, wired into index.js (GET /api/dashboard)

**Repository Layer** — wired into index.js:
- `server/repositories/base.repository.js` — generic CRUD
- `server/repositories/subscriber.repository.js` — subscriber data access
- `server/repositories/index.js` — LessonRepo, UserRepo, FaqRepo, ReviewRepo, ComplexRepo (with complex-lesson methods), SettingsRepo (with getAll/set)

**Route Wiring Summary** (v5.10.0):

| File | Routes Wired | Routes Still Inline | Notes |
|------|-------------|-------------------|-------|
| `server/routes/auth.js` | 4/4 | 0 | Fully wired to authService |
| `server/routes/user.js` | 4/27 | 23 | Login, GET /me, PUT /me, logout wired (from v5.3.0). Remaining: stats, register, confirm×3, watch-progress, progress, can-watch, stream-token, calendar, lessons-filter, onboarding×2, categories, recommendations, workout-feedback×3, dashboard, free-selections×2, fingerprint, data-export, account, detect-language, language — see "why left inline" below |
| `server/index.js` | 15/~25 | ~10 | Feedback ×8, Settings ×3, Dashboard ×1, Complex-lessons ×4 wired. Public routes, lesson-zones, trainer upload, video streaming, settings test-email/stream remain inline |

### Remaining routes (intentionally NOT wired — see notes):

**user.js — why left inline (v5.10.0 audit):**
- **stats** (GET /stats): simple 3-count query, no auth needed, no business logic
- **register**: complex fingerprint dedup + device account detection logic tightly coupled to DB
- **confirm** (GET+POST /confirm/:token, POST /confirm/resend): simple token check + UPDATE, mailer already called directly, no reason to wrap
- **watch-progress**: free_sessions_used increment + analytics tracking intermixed with progress save; no service exists for this
- **progress** (GET /progress): service not paginated, route has pagination — would need refactor
- **can-watch** (GET /can-watch/:lessonId): simple access check, no service method
- **stream-token** (GET /stream-token/:lessonId): Mux signed-URL integration, external service dependency, multi-language lesson_media lookup — too specific for generic service
- **calendar** (GET /calendar): complex SQL JOIN + schedule rotation logic; service (schedule.service.js) was dead code and has been **removed** in v5.10.0
- **lessons-filter** (GET /lessons-filter): complex multi-parameter filtering in JS; need significant refactor to extract
- **onboarding** (GET+POST /onboarding): simple CRUD for user_preferences, already clean
- **categories** (GET /categories): simple aggregation query
- **recommendations** (GET /recommendations): already delegates to recommendationService
- **workout-feedback** (GET+POST+GET/:lessonId): valid moods set differs from service (route adds 'calm', 'tired'); service has different moods
- **dashboard** (GET /dashboard): complex multi-query aggregation, not worth abstracting
- **free-selections** (GET+POST): uses transaction() + analytics tracking, tightly coupled
- **fingerprint** (POST /fingerprint): device dedup logic, IP capture, no service exists
- **data-export** (GET /data-export): simple multi-table export, no service needed
- **account** (DELETE /account): complex deletion + revocation, no service needed
- **detect-language** (GET /detect-language): external API call (ip-api.com), no DB
- **language** (PUT /language): simple single-field update

**index.js — why left inline:**
- **Public routes** (GET /api/lessons, complexes, faq, reviews, schedule): simple read-only queries, no business logic
- **settings test-email/test-stream**: service-specific, uses mailer/stream services directly
- **video streaming**: uses stream-scoped JWT verification (v5.10.0), complex range-header logic, not worth abstracting
- **trainer photo upload**: file I/O, not business logic
- **lesson-zones PUT**: uses transaction helper, already clean

---

## DEVIL'S ADVOCATE ROUND 1 — ✅ P0 FIXES COMPLETE (v5.5.1)

### What was done:
- 5 parallel audit agents analyzed entire codebase, found 155+ issues
- **P0 (Critical) fixes applied**: 12 security + data integrity fixes
- **Tests**: 727/727 passing (12 new security tests added)
- **Commit**: `5b8a472` pushed to GitHub

### Fixed P0s:
- [x] analytics.service.js — params not passed to db.exec() (BROKEN)
- [x] recommendation.service.js — zones from GROUP_CONCAT was string, not array
- [x] content-version.service.js — missing saveDb(), transaction in restoreVersion
- [x] progress.service.js — validMoods incomplete, UNIQUE constraint violation
- [x] db.js — role DEFAULT 'admin' → 'subscriber' (privilege escalation)
- [x] db.js — token_hash index missing
- [x] auth.js — JWT algorithm not pinned (alg:none attack), token revocation fail-open
- [x] user.js — fingerprint trusted client IP, missing token revocation on account delete
- [x] user.js — GDPR erasure incomplete (missing watched_lessons, workout_feedback, etc.)
- [x] user.js — JSON.parse without try/catch (3 locations)
- [x] user.js — free-selections not atomic (no transaction, no dedup)
- [x] base.repository.js — raw() SQL injection vector removed, column validation added

### Fixed in v5.9.0–v5.10.0:
- [x] API response unwrap: admin/api.js + 6 frontend pages auto-unwrap {data, pagination} → array
- [x] lessons.html: removed admin_token fallback (security)
- [x] dashboard.html: progress calc fix (position_seconds / (duration * 60))
- [x] onboarding.html: step.value → value fix
- [x] profile.html: removed duplicate language API call
- [x] regression.test.js: port 3003 → 3006 (collision with e2e.test.js)
- [x] P1-1: Stream-scoped JWT for video (/videos/* rejects main login token, requires scope:stream)
- [x] P1-2: Rate limiting on /api/user/* (userApiLimiter 120/min, confirmLimiter 10/min, removed global skip)
- [x] P1-3: Stripe env vars REQUIRED_IN_PRODUCTION (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
- [x] P2-4: schedule.service.js removed (dead code — getPersonalTimeline() referenced nonexistent columns)
- [x] P2-6: pages.test.js:57 — test now checks for negative ("не будем предлагать...скидк") not just word presence
- [x] P2-7: backend.test.js:757-778 — admin ticket reply/update tests create own ticket, no longer conditional
- [x] P3-8: CHANGELOG.md — added payment (5.7.0) + i18n (5.8.0) entries; structure fixed (descending order)
- [x] Tests: 7 stream-scoped JWT tests (security.test.js), ratelimit.test.js suite (port 3007, env-override 429 checks), Stripe config tests (config.test.js), schedule.service.js-removed assertion (backend.test.js)
- [x] Order-independence: all 15 suites pass under `jest --randomize` (merged stateful flows — e2e Scenario 1/6/7, security GDPR/confirmation/versioning, backend user-auth/me/free-lesson-counter, i18n DB default, payment grant/revoke, ratelimit)

### Remaining (P3 / process):
- [ ] 14 lint warnings (pre-existing — Jest globals in ESLint config)
- [ ] user.js: ~23 routes still inline (not in service layer — documented above)

---

## DEVIL'S ADVOCATE ROUND 4 — ✅ PAY-001/PAY-002 COMPLETE (v5.11.0)

### What was done (full report: `AUDIT_REPORT_2026-08-01.md`)
- **PAY-002 atomic webhook**: event record + payment/subscriber changes + audit in ONE transaction. Failure → `ROLLBACK` → no `payment_events` row → Stripe retry reprocesses. Concurrent duplicate events → one business effect. Sub-handlers made synchronous so no `await` inside the critical section.
- **PAY-001 state machine** (`STRIPE_STATUS_TO_LOCAL`): `active→active`, `trialing→trial`, `past_due→past_due`, `unpaid→past_due`, `canceled→cancelled` (access until expiry), unknown statuses no-op. Stripe `active` restores status + re-syncs expiry from `current_period_end`. `invoice.payment_failed` → `active`→`past_due`.
- **Schema**: `server/migrations/008_subscription_state.sql` — recreated `subscribers` so `status` CHECK includes `'past_due'` (all 16 columns preserved incl. `preferred_language`, indexes restored). Migration runner now toggles `PRAGMA foreign_keys` off/on per migration so `DROP TABLE` can't cascade.
- **Tests**: +11 in `tests/payment.test.js` → **906/906, 17 suites**; lint 0 errors; build passes.

### Fixed P0s:
- [x] DA-37 (PAY-002) — webhook not atomic; failed event was never retryable
- [x] DA-38 (PAY-001) — `unpaid`→`expired` bug, `canceled` killed access, `past_due` unhandled (card-failure subscriber kept watching)
- [x] DA-39 (schema) — `subscribers.status` CHECK rejected `past_due`

### Remaining (next rounds, prioritized):
- [ ] PAY-003: `current_period_end` as single source of truth (local 30/365 days only as fallback, marked)
- [ ] `handlePaymentFailed` hard-codes `plan='monthly'`
- [ ] OPS-001: atomic `saveDb()` (temp file + rename)
- [ ] DB-001: automated pre-migration backup + rollback runbook
- [ ] `REQUIRED_IN_PRODUCTION` + `STRIPE_MONTHLY_PRICE_ID` / `STRIPE_ANNUAL_PRICE_ID` / Mux vars
- [ ] DOC-001/DOC-002: Payment Flow doc in `docs/API.md` + `docs/ARCHITECTURE.md`, ADR update

---

## PHASE 4 STATUS — ✅ COMPLETE (v5.4.0)

### All Phase 4 deliverables done:

**CI/CD Pipeline**:
- `.github/workflows/ci.yml` — GitHub Actions: lint + test (Node 22+24 matrix, ESLint 10) + build
- `eslint.config.js` — ESLint flat config, 0 errors, 65 warnings
- `package.json` — `lint` / `lint:fix` scripts

**Audit Logging**:
- `audit_log` table in DB schema
- `server/services/audit.service.js` — logAction + getAuditLogs
- Auto-audit in crud.js for all tables, manual audit in index.js
- `GET /api/admin/audit-logs` — paginated, filterable

**GDPR Compliance**:
- `GET /api/user/data-export` — full subscriber data export
- `DELETE /api/user/account` — PII anonymization

**Monitoring**:
- `GET /api/health/detailed` — admin-only detailed health (uptime, memory, counts, DB size)
- Basic `/api/health` remains public

**Backup/Restore**:
- `POST /api/admin/backup` — timestamped DB copy + audit log
- `POST /api/admin/restore` — restore with path traversal protection

### Stats
- 715/715 tests passing, 0 lint errors, 65 warnings

---

## NEXT ACTIONS (for the next session)

### v5.12.0 — Devil's Advocate Round 5: PAY-003 + config (DONE)
- ✅ PAY-003: `subscription.updated` (active) sets expiry from `current_period_end` but never shrinks already-paid time; local plan-duration expiry in `checkout.session.completed` explicitly marked as temporary fallback
- ✅ `invoice.payment_failed` records the subscriber's real plan (no hard-coded `monthly`)
- ✅ Config: `STRIPE_MONTHLY_PRICE_ID`/`STRIPE_ANNUAL_PRICE_ID` now required in production; Mux keys optional but all-or-none (partial set = error in production, warning in dev)
- ✅ 912/912 tests, 17 suites; lint 0 errors; build passes

### v5.11.0 — Devil's Advocate Round 4: PAY-002 + PAY-001 (DONE)
- ✅ Atomic webhook (PAY-002): one transaction for event + payment + subscription + audit; failure rolls back and stays retryable; concurrent duplicates → one effect
- ✅ State machine (PAY-001): `trial/active/past_due/cancelled/expired`; `unpaid`→`past_due` (not `expired`), `canceled`→`cancelled` (access to period end), `past_due` handled, unknown statuses no-op, `invoice.payment_failed`→`past_due`, Stripe `active` restores + re-syncs `current_period_end`
- ✅ Migration `008_subscription_state.sql`: `subscribers.status` CHECK now includes `'past_due'`; runner toggles `PRAGMA foreign_keys` per migration
- ✅ 906/906 tests, 17 suites; lint 0 errors; build passes

### v5.13.0 — Devil's Advocate Round 6: OPS-001 atomic saveDb (DONE)
- ✅ `saveDb()` writes to temp file in same dir → atomic rename over the real DB; failed write cleans up the temp file, last good file survives
- ✅ `tests/db.test.js`: temp-then-rename used, DB round-trips after save, simulated crash keeps previous DB intact
- ✅ 915/915 tests, 18 suites; `jest --randomize` green; lint 0 errors; build passes

### v5.14.0 — Devil's Advocate Round 7: DOC-001/DOC-002 (DONE)
- ✅ `docs/API.md`: машина состояний (таблица), атомарность webhook + retry, PAY-003 never-shrink, конфиг Stripe/Mux, таблица сценариев ошибок (card_declined/timeout/delayed/manual revoke) с результатом, сообщением, retry и тестом
- ✅ `docs/ARCHITECTURE.md`: подразделы Stripe (подписки) + Mux (видео) в «Внешних интеграциях»; env-таблица дополнена (6 Stripe, 4 Mux all-or-none)
- ✅ `docs/ADR.md`: ADR-010 (state machine + atomic webhook + period integrity)
- ✅ Docs-only; 915/915 tests, 18 suites; lint 0 errors

### v5.15.0 — Devil's Advocate Round 8: DB-001 (DONE)
- ✅ `runMigrations()` создаёт снапшот `data/backups/pre-migration-<ts>.db` перед применением pending-миграций (skip в test env)
- ✅ `docs/DB_RUNBOOK.md`: backup/restore, forward-only policy, каталог миграций + трансформации, dry-run, владелец восстановления
- ✅ ARCHITECTURE.md/DEPLOYMENT.md cross-link; +1 тест (бэкап — валидный снапшот)
- ✅ 916/916 tests, 18 suites; lint 0 errors

### v5.16.0 — Devil's Advocate Round 9: OPS-002 honest CI (DONE)
- ✅ `ci.yml`: удалены оба `continue-on-error`; lint по полному scope (`npm run lint`); тесты рандомизированы (`npm run test:ci` = `jest --runInBand --randomize --forceExit`); build обязателен; единый источник истины — npm scripts
- ✅ `package.json`: добавлен `test:ci`
- ✅ `docs/DEPLOYMENT.md`: секция CI переписана; шаг про required status check (branch protection) перед merge
- ✅ Локально 916/916, рандомизировано; lint 0 errors; build OK

### v5.18.0 — Devil's Advocate Round 11: API-001 unified error format (DONE)
- ✅ `server/helpers/errors.js`: новый `sendError(res, status, code, message, requestId, extra)`; `formatError` отдаёт `requestId` и на верхний уровень (в `error.requestId` — для старых клиентов)
- ✅ Все inline `{ error: 'text' }` в payment/auth/user конвертированы в стабильные коды (`sendError`/`formatError`): `INVALID_PLAN`, `VALIDATION_ERROR`+details, `EMAIL_ALREADY_REGISTERED`, `INVALID_CONFIRMATION_TOKEN`, `NO_TOKEN`/`TOKEN_REVOKED`/`INVALID_TOKEN`, `FORBIDDEN`, `RATE_LIMITED` (4 лимитера user.js + auth.js), гейты доступа, `STREAMING_NOT_CONFIGURED` (503), доменные 500-коды payment/user; гейт-403 сохраняют топ-уровневый `code` (совместимость API-003)
- ✅ Фронтенд: `profile.html` — `errText(d)` (объект → `.message`), `plans.html` — инлайн-извлечение; `login.html` уже по `error.code`
- ✅ `tests/error-format.test.js`: 10 contract-тестов; 6 старых тестов обновлены со строкового `.error` на `error.code`/`error.message`
- ✅ 934/934 tests, 19 suites (randomized); lint 0 errors; build passes

### v5.19.0 — Devil's Advocate Round 12: AUTH-001 password reset (DONE)
- ✅ `POST /api/user/request-reset` — всегда `{ success: true }` (enumeration-safe); одноразовый токен (32 байта hex, в БД только SHA-256 хеш) + TTL 1 час; лимитер `RATE_LIMIT_MAX_RESET` (3/мин prod), keyGenerator через `ipKeyGenerator`, в тестах `x-test-key`-изоляция 429
- ✅ `POST /api/user/reset-password` — одноразовый токен, коды `INVALID_RESET_TOKEN`/`VALIDATION_ERROR`/`RESET_FAILED`; лимитер `RATE_LIMIT_MAX_RESET_PASSWORD` (5/мин)
- ✅ Отзыв сессий: `subscribers.token_version` + claim `ver` в JWT; authMiddleware отклоняет токены с несовпадающим `ver` → все старые сессии после сброса — 401 TOKEN_REVOKED
- ✅ Миграция `009_password_reset.sql` (+ базовая схема db.js): `password_reset_token`, `password_reset_expires_at`, `token_version`
- ✅ Mailer: `sendPasswordResetEmail` + экспорт `RESET_PASSWORD_HTML` (письмо содержит только ссылку, никогда пароль); console-режим логирует ссылку
- ✅ Фронтенд: `src/pages/reset-password.html` (запрос + ввод нового пароля по `?token=`), ссылка «Забыли пароль?» в login.html, clean-URL `/reset-password`, webpack entry; integrity.test.js exempt-списки для standalone-страницы
- ✅ `tests/password-reset.test.js`: 9 тестов (no-reveal, TTL, invalid/missing/expired token, короткий пароль, полный флоу с ревокацией и one-time, шаблон письма, rate limit)
- ✅ 946/946 tests, 20 suites (randomized); lint 0 errors; build passes

### v5.20.0 — Devil's Advocate Round 13: API-003 residual — stream-token per-code frontend (DONE)
- ✅ `player.html` `api()` helper attaches `err.status` + `err.code` (parsed from the API-001 `{success:false, error:{code}}` body) instead of regex-parsing the error message
- ✅ Extracted shared `renderDenied(lesson, complexName, code, freeUsed, freeLimit)` used by both `can-watch` and `stream-token`
- ✅ `stream-token` `} catch(_){}` replaced with per-code actions: 403 `EMAIL_CONFIRMATION_REQUIRED` → «Подтвердите email», gate 403s (`PAYMENT_PAST_DUE`/`SUBSCRIPTION_EXPIRED`/`SUBSCRIPTION_REQUIRED`/`FREE_LIMIT_REACHED`) → `renderDenied`, 503 `STREAMING_NOT_CONFIGURED` → «Видео временно недоступно»; unknown failures fall through to the outer error UI
- ✅ `tests/integrity.test.js`: 3 new assertions (page references `STREAMING_NOT_CONFIGURED` + `EMAIL_CONFIRMATION_REQUIRED`; stream-token catch no longer `catch(_)`)
- ✅ 949/949 tests, 20 suites (randomized); lint 0 errors; build passes

### Next round — candidate items:
1. ⚠️ **Единый формат ошибок на admin-эндпоинтах** (`server/index.js` + admin CRUD) — legacy string `{error}` ещё жив на вне-auth/payment/user путях.
2. ⚠️ **Manual production step**: create Stripe Price objects and set `STRIPE_MONTHLY_PRICE_ID`/`STRIPE_ANNUAL_PRICE_ID`; fill `MUX_ACCESS_TOKEN_ID`/`MUX_ACCESS_TOKEN_SECRET` (all-or-none with signing pair); в GitHub сделать `quality-gate` required check.
3. ⚠️ P2-кандидаты из IMPROVEMENT_TZ: ARC-001, OBS-001, UX-001, UX-002, ARCH-001, DB-002, NFR-001.

### v5.10.4 — Mux-first video upload (DONE)
- ✅ Migration 007: `video_uploads` + `provider`/`mux_upload_id`/`mux_asset_id`/`mux_playback_id`
- ✅ `POST /api/admin/lessons/:id/video/mux-upload` (Mux direct upload; row `provider='mux'`); CF disk-upload (`/video/upload`, `/video/migrate`) + multer video storage **removed**
- ✅ `GET /api/admin/video-uploads/:id/status` provider-aware (polls Mux, stores asset/playback ids on `asset_created`)
- ✅ `DELETE .../video` preserves lesson `video_provider`; lessons CRUD + `lesson_media` accept `video_provider`; `/api/lessons` returns it
- ✅ Admin UI: «Хостинг» select + «Видео ID (плеер)»; `stream-upload.js` Mux-first (PUT file → poll → playback ID)
- ✅ Tests reworked (895/895, 17 suites); lint 0 errors
- ✅ Admin Settings: Mux card (4 поля: signing key id/ключ + access token id/secret), «Сохранить Mux» → `/api/settings`, «Проверить» → `POST /api/settings/test-mux` (`{ configured, signing, upload }`)
- ⚠️ **Manual step for production**: fill `MUX_ACCESS_TOKEN_ID` / `MUX_ACCESS_TOKEN_SECRET` in `.env` (used for uploads) — separate from signing key pair.

### Immediate (complete v5.10.0):
1. ✅ P1-1: Stream-scoped JWT for video streaming
2. ✅ P1-2: Rate limiting on /api/user/*
3. ✅ P1-3: Stripe env vars required in production
4. ✅ P2-4: schedule.service.js removed (dead code)
5. ✅ P2-5: user.js inline vs service layer audit + PROGRESS.md updated
6. ✅ P2-6: pages.test.js:57 fixed
7. ✅ P2-7: backend.test.js conditional tests fixed
8. ✅ P3-8: CHANGELOG.md — add payment + i18n entries
9. ✅ Run full test suite after all fixes, verify lint + build
10. ✅ Stream-scoped JWT tests added (security.test.js)
11. ✅ Rate limit tests added (ratelimit.test.js)
12. ✅ Stripe config tests added (config.test.js)
13. ✅ schedule.service.js removal test added (backend.test.js)
14. ✅ Order-independence verified: `jest --randomize` — 10+ consecutive green runs (868/868, 15 suites)

### Next session options:

### Option A: Testing & Quality (DONE in v5.10.0)
- ✅ Stream-scoped JWT tests added (main token rejected, stream token accepted, expired/wrong-scope rejected)
- ✅ Rate limit tests (429 on /api/user/* when env limits exceeded, confirm limiter)
- ✅ Stripe config tests (production refuses partial/missing Stripe env vars)
- ✅ schedule.service.js removal test (file no longer exists)
- ✅ Randomizer runs green — no order-dependent tests remain

### Option B: Frontend UX
- Unified API client with global error handling
- Loading states and skeleton screens
- Session expiry UX (redirect to login)
- Offline fallback

### Option C: Production Ops
- HTTPS/TLS — production SSL termination
- Environment separation (development, test, staging, production)
- Rollback procedure documentation

### Option D: Documentation
- ✅ P3-8: CHANGELOG.md payment + i18n entries (done in v5.10.0)
- P3-9: Review robots.txt/sitemap.xml (already reviewed — matches SEO test spec)
- docs/openapi.yaml — update to current version

### Option E: Monetization — Stripe on Thai citizen + Video Hosting (UPDATED 2026-07-31)
**Решение клиента (уточнение 2026-07-31):** счёт и аккаунт в банке Таиланда открыты **на местного гражданина** (тайца), к нему привязан AppStore-аккаунт. Это снимает KYC-барьер: **Stripe Thailand на тайца как Individual/Sole Proprietorship** — основной путь (тайский ID, адрес, THB-счёт всё сходится). Комиссия ~2.9%+$0.30 — в ~2.5 раза дешевле MoR. Платёжный код в проекте уже Stripe — **переписывать не нужно**, только ключи аккаунта тайца.

**Проверенные факты (Stripe support / PwC / Acclime / BOT/AMLO / Apple):**
- ✅ Stripe Thailand поддерживает Sole Proprietorship и Individual (не только компанию).
- ✅ Таец = налоговый резидент: весь доход облагается PIT 0–35%; VAT 7% — только при обороте >1.8M THB/год (~$50K), регистрация в течение 30 дней после пересечения порога. Экспорт услуг — возможна 0% ставка (проверить у бухгалтера).
- ✅ App Store: 15% через Small Business Program (<$1M proceeds, заявка) или после 12 мес подписки; стандарт 30%. iOS-цифровой контент = IAP обязателен.
- ⚠️ **AML**: BOT-система детекции «мулов» — коммерческие выплаты из-за рубежа на ЛИЧНЫЙ счёт триггерят блокировку. Обязателен **бизнес-счёт** (sole proprietorship → Tax ID → бизнес-счёт).
- ⚠️ **Nominee-риск**: если таец — реальный партнёр (супруг/семья), всё чисто, оформить отношения. Если номинальный держатель — риск AMLA/DBD Order 1/2569 (уголовка, заморозка, blacklist) — так не делать.

1. ⏳ **Регистрация sole proprietorship на тайца** + Tax ID + **бизнес-счёт** в банке.
2. 🔄 **Stripe Thailand** (тип Individual/Sole Proprietorship) → ключи в проект. **Код готов:** сумма записи в `payments` теперь берётся из настроек `monthly_price`/`annual_price` (ручная установка цены в админке), а не из константы `PLAN_AMOUNTS`; единая валюта USD — подтверждено клиентом. Осталось: ключи тайского аккаунта в `.env` + создание Price-объектов в Stripe-дашборде (цены в дашборде должны совпадать с настройками). Расчёт цены под расходы — ниже.
   - **Расчёт цены (покрытие расходов сайта):**
     - Постоянные: Mux PAYG ≈ $20/мес (кредит покрывает хранение ~75ч = $10.8; доставка до 100K мин/мес — $0) + сервер ≈ $15 + email ≈ $15 + домен ≈ $1 → **≈ $51/мес**.
     - Переменные на 1 подписчика (месячный $12): Stripe TH 2.9%+$0.30 ≈ $0.65 + резерв (диспуты/отмены ~1.5%) ≈ $0.18 → **≈ $0.83**.
     - Фонд развития сайта (небольшая стандартная сумма): **+$30/мес**.
     - Точка безубыточности (постоянные $51 + фонд $30 = $81/мес): месячный план $12 — ~8 подписчиков; годовой $89 — ~12 подписчиков.
     - **Вывод: $12/мес и $89/год уже покрывают расходы + фонд развития.** При росте трафика сверх 100K мин/мес (≈100 активных зрителей × 30 мин/день) — переход на Bunny и пересчёт цены.
3. ⏳ **Консультация тайского бухгалтера**: PIT, VAT-порог 1.8M THB, экспорт-0%, оформление отношений с тайцем.
4. ⏳ **AppStore Small Business Program** заявка (15%) — отдельный iOS-канал.
5. 🔄 **Видео: свой сервер 720p (free) + Mux (paid) → Bunny (при росте)**. YouTube embed ОТКЛОНЁН (реклама — риск оттока; гарантии нет даже без монетизации). Сделано: Mux-провайдер в `stream.js` (подпись playback_id HS256, HLS-URL, direct-upload API; дефолтный exp токена поднят 900с → 21600с = 6ч для нативных плееров), миграции `006_video_provider.sql` + `007_mux_uploads.sql` (`video_uploads` + `provider`/`mux_upload_id`/`mux_asset_id`/`mux_playback_id`), диспетчеризация по провайдеру в `/stream-token`, скрипт `encode-720p.js` + README. **v5.10.4 — видео-загрузка Mux-first**: `POST /admin/lessons/:id/video/mux-upload` (прямая загрузка, файл PUT-ится браузером в Mux; CF multipart-upload и `migrate` УДАЛЕНЫ — файлы больше не ложатся на сервер), `GET /admin/video-uploads/:id/status` провайдер-зависимый (для Mux опрашивает API и пишет asset/playback id), `DELETE .../video` сохраняет `video_provider`, admin-UI в `stream-upload.js` Mux-first (после готовности ID подставляется в форму, провайдер → mux), выбор «Хостинг» в `lessons.html`, тесты `tests/admin-video-uploads.test.js` (895/895). Осталось: 720p-кэп на доставку.
6. ⏳ **LSQ/Paddle/Dodo** — только запасной вариант, если Stripe откажет тайцу.
7. 📱 **Нативные приложения (справочно, ответ клиенту записан)**: модель App Store «Reader Apps» (3.1.3a) — подписка продаётся на вебе через Stripe, приложение только логин + воспроизведение (как Netflix) → **никаких Apple IAP/комиссий**. Плеер: iOS `AVPlayer`, Android `ExoPlayer/Media3` — оба играют подписанный Mux HLS нативно; **не использовать hls.js/webview в проде**. Путь: Capacitor/PWA сначала, нативные плееры — позже (offline, AirPlay/Chromecast). DRM (FairPlay/Widevine) для MVP не нужен — подписанные URL + гейт по подписке достаточно. Ловушки: токен Mux не должен истекать посреди урока (теперь 6ч) + плеер должен молча перезапрашивать stream-token при 403; старые устройства iOS 14+/Android 8+, крупные шрифты.

---

## IMPORTANT FILES (read these first in next session)

### Must-read for context:
- `PROGRESS.md` (this file)
- `CHANGELOG.md` (full history)
- `C:\Ded\спорт\Разное\Аналиp-аудит GPT.txt` (tech spec, lines 884-900 for Phase 3)

### Files modified in Phase 4:
- `server/services/audit.service.js` — audit logging service
- `server/routes/user.js` — GDPR endpoints (data-export, account deletion)
- `server/index.js` — health/detailed, backup, restore endpoints
- `.github/workflows/ci.yml` — CI/CD pipeline
- `eslint.config.js` — ESLint config

### Files modified in Phase 3:
- `server/routes/auth.js` — fully wired to authService (4 routes)
- `server/routes/user.js` — 4 of ~20 routes wired
- `server/index.js` — 15 of ~25 routes wired
- `server/routes/crud.js` — auto-audit for all CRUD tables

### New files created in Phase 3:
- `server/helpers/errors.js` — error classes
- `server/middleware/requestId.js` — request ID
- `server/helpers/logger.js` — structured logging
- `server/services/auth.service.js` — auth business logic
- `server/services/progress.service.js` — progress business logic
- `server/services/schedule.service.js` — REMOVED in v5.10.0 (P2-4, dead code — calendar logic lives inline in user.js)
- `server/services/feedback.service.js` — ticket business logic
- `server/services/dashboard.service.js` — dashboard aggregation
- `server/repositories/base.repository.js` — generic CRUD repo
- `server/repositories/subscriber.repository.js` — subscriber data access
- `server/repositories/index.js` — all other repos

### Test files (run after changes):
- `tests/backend.test.js` (main API tests — user auth, /me, free-lesson counter, token revocation, CRUD)
- `tests/security.test.js` (security tests — stream-scoped JWT, rate limits, GDPR, confirmation, versioning)
- `tests/ratelimit.test.js` (port 3007 — rate limit env-override + 429 behavior)
- `tests/config.test.js` (config validation — Stripe vars required in production)
- `tests/e2e.test.js` (port 3003 — end-to-end scenarios), `tests/payment.test.js` (port 3004), `tests/i18n.test.js` (port 3005), `tests/regression.test.js` (port 3006)
- All other test suites (landing, components, pages, integrity, admin, build, seo)
- Port map: 3001 backend, 3002 security, 3003 e2e, 3004 payment, 3005 i18n, 3006 regression, 3007 ratelimit

---

## PROJECT ARCHITECTURE

```
server/
├── index.js              — Express server, all routes, seed data
├── auth.js               — JWT middleware + generateToken
├── db.js                 — sql.js DB, schema, transactions, migrations
├── middleware/
│   ├── requestId.js      — X-Request-Id
│   ├── rbac.js           — Role-based access control (subscriber/admin/super_admin)
│   ├── validation.js     — Input validation (validateBody)
│   ├── api-version.js    — API versioning (X-API-Version header)
│   └── confirmation.js   — Dangerous action confirmation (X-Confirm-Action)
├── helpers/
│   ├── errors.js         — Unified error classes
│   ├── logger.js         — Structured logging
│   ├── pagination.js     — parsePagination
│   ├── config.js         — validateConfig
│   ├── migrations.js     — DB migration runner
│   └── db-utils.js       — queryToObjects (fixes circular dep)
├── routes/
│   ├── auth.js           — Admin auth (WIRED to authService)
│   ├── user.js           — Subscriber routes (PARTIALLY WIRED + GDPR)
│   └── crud.js           — Generic CRUD factory (auto-audit)
├── services/
│   ├── auth.service.js   — Auth business logic (WIRED)
│   ├── progress.service.js — Progress/feedback logic (PARTIALLY WIRED, FIXED in v5.5.1)
│   ├── feedback.service.js — Ticket system logic (WIRED)
│   ├── dashboard.service.js — Dashboard stats (WIRED)
│   ├── audit.service.js  — Audit logging (WIRED into crud.js + index.js)
│   ├── analytics.service.js — Event analytics (NEW v5.5.0, FIXED v5.5.1)
│   ├── recommendation.service.js — Lesson recommendations (NEW v5.5.0, FIXED v5.5.1)
│   ├── content-version.service.js — Content versioning (NEW v5.5.0, FIXED v5.5.1)
│   ├── mailer.js         — Email sending
│   └── stream.js         — Mux: Direct Upload + подпись playback
├── repositories/
│   ├── base.repository.js — Generic CRUD repository
│   ├── subscriber.repository.js
│   └── index.js          — All other repos (settingsRepo, complexRepo wired)
└── migrations/
    └── 001_performance_indexes.sql

.github/
└── workflows/
    └── ci.yml            — GitHub Actions CI/CD
```

---

## KEY RULES (don't forget!)

1. **User communicates in Russian** — respond in Russian
2. **One step forward, two steps back** — always verify before moving on
3. **946/946 tests must pass** after every change (20 suites)
4. **Push to GitHub** after every commit
5. **Never modify MWH APK** — illegal (DRM)
6. **Subscription model**: 7 days free WITHOUT payment card
7. **Pricing**: 89₽/year or 12₽/month
8. **DB**: sql.js, seeded on first start at `data/qigong.db`
9. **Admin**: admin@qigong.com / admin123
10. **Subscribers**: maria@, elena@, sergey@, anna@, olga@example.com — all password123
11. **TDD-цикл** по `docs/IMPROVEMENT_TZ.md`: тест red → реализация → полный прогон → доки → коммит+push
12. **HTTP-контракт** не менять без обратной совместимости; миграции — только versioned

---

## NEXT ACTIONS (resume point)

Текущий статус: Round 15 готов — **v5.23.0** (локальная загрузка видео в админке, каталог работает без Mux/Stripe/email). Цепочка P0/P1 из `docs/IMPROVEMENT_TZ.md` закрыта (Rounds 4–13); Round 15 — фича-работа по запросу клиента (каталог → одно видео → почта → Mux → оплата).

### Текущий приоритет клиента (порядок работ)
1. ✅ **Каталог без внешних сервисов (сделано в v5.23.0)** — загрузка `.mp4/.mov/.webm/.avi/.mkv` из админки → `videos/`, урок получает `provider='local'` + `video_url`. Имя файла сохраняется как есть (важно для соответствия «имя файла ↔ № в каталоге»).
2. **Заполнение каталога** (ручная работа клиента): загрузить файлы, составить занятия/комплексы, календарь (`date`, `catalog_no`, `sort_order`, `free_order`), формы/описания.
3. **Отладка на одном видеофайле** — просмотр плеером, гейты доступа (trial/free/paid), прогресс.
4. **Тестовая почта** — клиент выбрал `console`-лог (уже дефолт, ничего настраивать не нужно). Позже: Gmail App Password / Mailpit (нужна поддержка generic SMTP) / Resend.
5. **Mux** — клиент зарегистрируется; заполнить `MUX_ACCESS_TOKEN_ID`/`MUX_ACCESS_TOKEN_SECRET` (+ signing pair), перевести уроки на `provider='mux'`.
6. **Оплата** — отложена до полной готовности программы (Stripe Price IDs, webhook).

### Кандидаты следующего раунда (devil's advocate P2, когда вернёмся к аудиту)
1. **OBS-001 (аудит платежей)** — критичные payment-действия логируются только в app-лог, не попадают в `audit_log` (виден в `/api/admin/audit-logs`). Wiring внутри PAY-002-транзакции требует transaction-aware insert (безопасно, т.к. `saveDb()` в открытой транзакции рискованно).
2. **Единый формат ошибок на admin-эндпоинтах** — `server/index.js` + admin CRUD ещё на legacy string `{error}` (вне скоупа API-001, покрыл только payment/auth/user).
3. **ARC-001** — `auth/progress/feedback.service.js` + `repositories/` существуют, но `NOT WIRED`; перевести домены на service/repository по образцу payment.
4. **Долги из аудита** — CSP `unsafe-inline`; `hero-poster.jpg` 2.55 MiB (webp/сжатие); проверить NFR-001 метрики (p95, RTO, build budget).
5. **Ручные шаги продакшена** — Stripe Price IDs + Mux all-or-none; `quality-gate` как required status check; заново залить каталог (после миграции 015 пуст).

### Как продолжить сессию
- Прочитать сначала: `docs/IMPROVEMENT_TZ.md` (цепочка P0→P2), `AUDIT_REPORT_2026-08-01.md` (раунды 4–13), `AUDIT_REPORT_2026-08-06.md` (Round 14), этот файл.
- Прогнать перед работой: `npm run test:ci` (должно быть 1002/1002), `npm run lint`, `npm run build`.
- ВАЖНО: не оставлять запущенный dev-сервер на порту `:3001` при прогоне тестов — `backend.test.js` теперь использует 3012, но другие процессы на 3001 могут мешать ручной работе.
- После каждого раунда: обновить API.md/openapi.yaml + AUDIT_REPORT (новый DA-ID) + CHANGELOG + PROGRESS + package.json (minor bump) → коммит + push.
