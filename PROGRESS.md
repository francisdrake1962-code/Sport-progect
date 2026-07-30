# PROGRESS — Roadmap Bookmark

> This file is a resume-point for the next AI session.
> Read this file first, then continue from "NEXT ACTIONS".
> Last updated: 2026-07-30 v5.10.0

---

## CURRENT STATE

**Version**: 5.10.0 (in-progress — security hardening round)
**Tests**: TBD after all fixes
**Lint**: 0 errors, 8 warnings (pre-existing: Jest globals in ESLint config)
**GitHub**: All commits pushed to `francisdrake1962-code/Sport-progect`

### Git Log (recent)
```
da4d14b v5.9.0: fix systemic API response unwrap + frontend bugs
b00f76e v5.8.1: fix device fingerprint caching
9c99c53 v5.8.0: i18n internationalization
0eb29a9 v5.7.0: fix video sound (muted → unmute via play().then)
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
| Security Hardening Round 4 | Stream-scoped JWT, rate limiting, Stripe config, dead code, test fixes | 🔄 IN PROGRESS (v5.10.0) |

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
- **stream-token** (GET /stream-token/:lessonId): Cloudflare Stream integration, external service dependency, multi-language lesson_media lookup — too specific for generic service
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

### Remaining (P3 / process):
- [ ] P3-8: CHANGELOG.md add payment/i18n entries (v5.7.0, v5.8.0 missing)
- [ ] 8 lint warnings (pre-existing — Jest globals in ESLint config)
- [ ] user.js: ~23 routes still inline (not in service layer — documented above)

---

## PHASE 4 STATUS — ✅ COMPLETE (v5.4.0)

### All Phase 4 deliverables done:

**CI/CD Pipeline**:
- `.github/workflows/ci.yml` — GitHub Actions: lint + test (Node 18+20 matrix) + build
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

### Immediate (complete v5.10.0):
1. ✅ P1-1: Stream-scoped JWT for video streaming
2. ✅ P1-2: Rate limiting on /api/user/*
3. ✅ P1-3: Stripe env vars required in production
4. ✅ P2-4: schedule.service.js removed (dead code)
5. ✅ P2-5: user.js inline vs service layer audit + PROGRESS.md updated
6. ✅ P2-6: pages.test.js:57 fixed
7. ✅ P2-7: backend.test.js conditional tests fixed
8. ⬜ P3-8: CHANGELOG.md — add payment + i18n entries
9. ⬜ Run full test suite after all fixes, verify lint + build

### Next session options:

### Option A: Testing & Quality (Recommended)
- Add stream-scoped JWT tests to backend.test.js (verify main token rejected, stream token accepted, stream token expired)
- Add rate limit tests to security.test.js (verify 429 on /api/user/stats, /api/user/confirm/:token)
- Add config.test.js to verify Stripe env vars required in production
- Add tests for schedule.service.js removal (verify it no longer exists)
- Add test randomizer run to verify no order-dependent tests

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
- P3-8: CHANGELOG.md payment + i18n entries
- P3-9: Review robots.txt/sitemap.xml (already reviewed — matches SEO test spec)
- docs/openapi.yaml — update to current version

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
- `server/services/schedule.service.js` — calendar business logic
- `server/services/feedback.service.js` — ticket business logic
- `server/services/dashboard.service.js` — dashboard aggregation
- `server/repositories/base.repository.js` — generic CRUD repo
- `server/repositories/subscriber.repository.js` — subscriber data access
- `server/repositories/index.js` — all other repos

### Test files (run after changes):
- `tests/backend.test.js` (132 tests — main API tests)
- `tests/security.test.js` (38 tests — security tests)
- All other test suites (landing, components, pages, integrity, admin, build, seo)

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
│   └── stream.js         — Cloudflare Stream
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
3. **744/744 tests must pass** after every change
4. **Push to GitHub** after every commit
5. **Never modify MWH APK** — illegal (DRM)
6. **Subscription model**: 7 days free WITHOUT payment card
7. **Pricing**: 89₽/year or 12₽/month
8. **DB**: sql.js, seeded on first start at `data/qigong.db`
9. **Admin**: admin@qigong.com / admin123
10. **Subscribers**: maria@, elena@, sergey@, anna@, olga@example.com — all password123
