# PROGRESS — Roadmap Bookmark

> This file is a resume-point for the next AI session.
> Read this file first, then continue from "NEXT ACTIONS".
> Last updated: 2026-07-27 v5.5.1

---

## CURRENT STATE

**Version**: 5.5.1
**Tests**: 727/727 passing (9 test suites)
**Lint**: 0 errors, 73 warnings
**GitHub**: All commits pushed to `francisdrake1962-code/Sport-progect`

### Git Log (recent)
```
5b8a472 v5.5.1: Devil's Advocate Round 1 - Critical security & data integrity fixes
3fafa22 feat(v5.5.0): Phase 5 — Analytics, Recommendations, Content Versioning
0145ce2 docs(v5.4.0): update CHANGELOG + PROGRESS for Phase 4 completion
1cc78d9 feat(v5.4.0): GDPR + monitoring + backup — Phase 4 complete
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
| Phase 5 — Product Evolution | Analytics, Recommendations, Content Versioning | 🔜 IN PROGRESS (v5.5.0) |

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

**Route Wiring Summary** (v5.3.0):

| File | Routes Wired | Routes Still Inline | Notes |
|------|-------------|-------------------|-------|
| `server/routes/auth.js` | 4/4 | 0 | Fully wired to authService |
| `server/routes/user.js` | 4/~20 | ~16 | Login, GET /me, PUT /me, logout wired. Remaining: register, stats, confirm, progress, can-watch, stream-token, watch-progress, calendar, lessons-filter, onboarding, categories, workout-feedback, dashboard, free-selections, fingerprint |
| `server/index.js` | 15/~25 | ~10 | Feedback ×8, Settings ×3, Dashboard ×1, Complex-lessons ×4 wired. Remaining: public routes (lessons/complexes/faq/reviews/schedule), lesson-zones, trainer upload, video streaming, settings test-email/stream |

### Remaining routes (intentionally NOT wired — see notes):

**user.js — why left inline:**
- **register**: missing email sending (sendConfirmationEmail not in service)
- **watch-progress**: missing free_sessions_used increment + ON CONFLICT
- **progress**: service not paginated, route has pagination
- **calendar**: service doesn't match route logic
- **lessons-filter**: complex filtering, no service method
- **onboarding, categories**: not in any service
- **workout-feedback**: service has different valid moods (happy/energized/neutral/disappointed vs route: happy/energized/calm/neutral/tired/disappointed)
- **dashboard, free-selections, fingerprint**: complex business logic not worth abstracting

**index.js — why left inline:**
- **Public routes** (GET /api/lessons, complexes, faq, reviews, schedule): simple read-only queries, no business logic
- **settings test-email/test-stream**: service-specific, uses mailer/stream services directly
- **video streaming**: complex range-header logic, not worth abstracting
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

### Remaining (P1/P2 — Round 2):
- [ ] isTokenRevoked() returns false on exception (fail-open → fail-closed done in auth.js middleware)
- [ ] JWT accepted via query string ?token= in index.js video streaming
- [ ] Hardcoded seed password 'admin123' in production
- [ ] pages.test.js:57 inverted assertion ("no retention tactics" checks for "скидка" IS present)
- [ ] backend.test.js:759-778 vacuous admin ticket assertions
- [ ] 73 lint warnings to clean up
- [ ] schedule.service.js NOT wired into routes
- [ ] user.js:~16 routes still inline (not in service layer)

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

### Option A: Devil's Advocate Round 2 — Fix remaining P1/P2 issues (Recommended)
- Fix broken test assertions (pages.test.js:57, backend.test.js:759-778)
- Remove JWT ?token= query string auth (security risk)
- Make hardcoded seed password configurable
- Clean up 73 lint warnings
- Re-analyze entire codebase for remaining issues

### Option B: Service Layer Cleanup
Extend services to cover remaining inline routes:
- Create `register.service.js` (email sending flow)
- Extend `progress.service.js` with pagination + free logic
- Create `calendar.service.js` (personal timeline + schedule merge)

### Option C: Production Ops
- **Rate limiting improvements** — per-route limits, IP-based for auth
- **HTTPS/TLS** — production SSL termination
- **Containerization** — Docker + docker-compose for consistent deploys

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
│   └── requestId.js      — X-Request-Id
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
│   ├── schedule.service.js — Calendar/timeline logic (NOT WIRED)
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
3. **727/727 tests must pass** after every change
4. **Push to GitHub** after every commit
5. **Never modify MWH APK** — illegal (DRM)
6. **Subscription model**: 7 days free WITHOUT payment card
7. **Pricing**: 89₽/year or 12₽/month
8. **DB**: sql.js, seeded on first start at `data/qigong.db`
9. **Admin**: admin@qigong.com / admin123
10. **Subscribers**: maria@, elena@, sergey@, anna@, olga@example.com — all password123
