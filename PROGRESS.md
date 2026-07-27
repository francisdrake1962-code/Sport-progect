# PROGRESS — Roadmap Bookmark

> This file is a resume-point for the next AI session.
> Read this file first, then continue from "NEXT ACTIONS".
> Last updated: 2026-07-27 v5.5.0

---

## CURRENT STATE

**Version**: 5.5.0
**Tests**: 715/715 passing (9 test suites)
**GitHub**: All commits pushed to `francisdrake1962-code/Sport-progect`

### Git Log (recent)
```
pending commit: feat(v5.5.0): Phase 5 — Analytics, Recommendations, Content Versioning
0145ce2 docs(v5.4.0): update CHANGELOG + PROGRESS for Phase 4 completion
1cc78d9 feat(v5.4.0): GDPR + monitoring + backup — Phase 4 complete
51f2a5a feat(v5.4.0): CI/CD + ESLint + audit logging — Phase 4 first steps
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

### Option A: Phase 5 remaining — Personalization (Recommended)
- Content versioning endpoints for admin UI integration
- Recommendation click tracking + scoring feedback loop
- A/B testing framework for recommendation algorithms

### Option B: Service Layer Cleanup (optional)
Extend services to cover remaining inline routes:
- Create `register.service.js` (email sending flow)
- Extend `progress.service.js` with pagination + free logic
- Create `calendar.service.js` (personal timeline + schedule merge)
- Fix mood validation mismatch in progress service

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
│   ├── progress.service.js — Progress/feedback logic (PARTIALLY WIRED)
│   ├── schedule.service.js — Calendar/timeline logic (NOT WIRED)
│   ├── feedback.service.js — Ticket system logic (WIRED)
│   ├── dashboard.service.js — Dashboard stats (WIRED)
│   ├── audit.service.js  — Audit logging (WIRED into crud.js + index.js)
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
3. **715/715 tests must pass** after every change
4. **Push to GitHub** after every commit
5. **Never modify MWH APK** — illegal (DRM)
6. **Subscription model**: 7 days free WITHOUT payment card
7. **Pricing**: 89₽/year or 12₽/month
8. **DB**: sql.js, seeded on first start at `data/qigong.db`
9. **Admin**: admin@qigong.com / admin123
10. **Subscribers**: maria@, elena@, sergey@, anna@, olga@example.com — all password123
