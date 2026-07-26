# PROGRESS — Roadmap Bookmark

> This file is a resume-point for the next AI session.
> Read this file first, then continue from "NEXT ACTIONS".
> Last updated: 2026-07-26 v5.2.0

---

## CURRENT STATE

**Version**: 5.2.0
**Tests**: 715/715 passing (9 test suites)
**GitHub**: All commits pushed to `francisdrake1962-code/Sport-progect`

### Git Log (recent)
```
991147d feat(v5.2.0): Phase 3 — Repository Layer + updated CHANGELOG
10748af feat(v5.2.0): Phase 3 foundation — Error Model, Request ID, Structured Logging, Service Layer
4afea66 fix(security): strengthen security tests, fix JWT duplicate token bug, fix error handler
115c2b0 feat(v5.1.0): Phase 2 — Security test suite (33→38 tests) + Phase 1 QA fixes
d513a78 fix(v5.0.0): Phase 1 QA fixes — paginate feedback endpoint, cleanup blocklist, remove dead code
f7f330f feat(v5.0.0): Phase 1 Stabilization — P0 pagination, token revocation, P1 config validation, transactions, migrations
6b34537 fix(v4.1.0): devil's advocate audit round 2 — 5 additional fixes
d4507f9 fix(v4.1.0): devil's advocate audit round 1 — 28 fixes, 674 tests
```

---

## TECH SPEC COMPLIANCE

Source: `C:\Ded\спорт\Разное\Аналиp-аудит GPT.txt`
Plan: `C:\Ded\спорт\Разное\План корректировки после аудита от Опен.txt`

| Phase | Content | Status |
|-------|---------|--------|
| Phase 1 — Stabilization | Pagination, Token Revocation, Config Validation, DB Transactions, DB Migrations | ✅ DONE (v5.0.0) |
| Phase 2 — Testing | Security tests (38 tests), JWT bug fix, Error handler fix | ✅ DONE (v5.1.1) |
| Phase 3 — Refactoring | Error Model, Request ID, Logging, Service Layer, Repository Layer | ⬅️ IN PROGRESS (v5.2.0) |
| Phase 4 — Production Hardening | CI/CD, Audit logging, GDPR, Monitoring, Backup/Restore | 🔜 PENDING |
| Phase 5 — Product Evolution | Analytics, Recommendations, Content Versioning | 🔜 PENDING |

---

## PHASE 3 STATUS (what's done, what remains)

### ✅ Done in Phase 3 (v5.2.0)

**Infrastructure** — all created and tested, no routes broken:
- `server/helpers/errors.js` — AppError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError, RateLimitError, PayloadTooLargeError + formatSuccess/formatError
- `server/middleware/requestId.js` — X-Request-Id auto-generation
- `server/helpers/logger.js` — createLogger(component), requestLogger middleware, JSON structured logging
- Global error handler in `server/index.js` updated to use unified error model

**Service Layer** — created but NOT YET WIRED into routes:
- `server/services/auth.service.js` — loginAdmin, loginSubscriber, registerSubscriber, changeAdminPassword, revokeCurrentToken
- `server/services/progress.service.js` — recordWatchProgress, getProgress, getWorkoutFeedback, recordWorkoutFeedback, getSubscriberProfile, updateSubscriberProfile
- `server/services/schedule.service.js` — getSchedule, getPersonalTimeline
- `server/services/feedback.service.js` — createTicket, getSubscriberTickets, replyToTicket, closeTicket

**Repository Layer** — created but NOT YET WIRED into services:
- `server/repositories/base.repository.js` — BaseRepository with generic CRUD (findAll, findById, create, update, delete, count, raw)
- `server/repositories/subscriber.repository.js` — SubscriberRepository (findByEmail, getPublicProfile, confirmEmail)
- `server/repositories/index.js` — LessonRepository, UserRepository, FaqRepository, ReviewRepository, ComplexRepository, SettingsRepository

### ❌ Remaining in Phase 3

**Wire services into routes** — THE BIG TASK (~2100 lines to refactor):
- `server/index.js` (~1275 lines) — replace all inline DB calls with service/repository calls
  - Ticket routes (lines 645-730): replace with feedbackService
  - Settings routes (lines 100-142): replace with settingsRepo
  - Dashboard routes (lines 145-169): create dashboard service
  - Complex lessons routes (lines 312-370): replace with complexRepo
  - Public routes (lessons/complexes/faq/reviews): keep using repos for read-only
- `server/routes/user.js` (~888 lines) — replace inline DB calls with service calls
  - Registration (lines 50-103): replace with authService.registerSubscriber
  - Login (lines 105-135): replace with authService.loginSubscriber
  - Profile (lines 137-187): replace with progressService
  - Logout (lines 189-192): replace with authService.revokeCurrentToken
  - Progress routes (lines 300-450): replace with progressService
  - Workout feedback (lines 666-745): replace with progressService
  - Free selections (lines 550-650): keep inline (complex logic)
  - Calendar (lines 460-530): replace with scheduleService
  - Feedback/ticket routes (lines 750-830): replace with feedbackService
- `server/routes/crud.js` — base CRUD is fine, no changes needed
- `server/routes/auth.js` — replace with authService

**Tests to update** after wiring:
- `tests/backend.test.js` — responses may change format (currently `{error: 'msg'}` → `{success:false, error:{code,msg}}`)
- `tests/security.test.js` — same format changes

---

## NEXT ACTIONS (for the next session)

### Step 1: Wire auth routes (smallest, safest start)
1. Read `server/routes/auth.js` — currently 108 lines with inline DB calls
2. Replace with `authService.loginAdmin()` and `authService.changeAdminPassword()`
3. Run `npx jest tests/backend.test.js` — fix any test assertion changes
4. Run `npx jest tests/security.test.js` — fix any test assertion changes
5. Commit + push

### Step 2: Wire user routes (biggest file, ~888 lines)
1. Read `server/routes/user.js` section by section
2. Replace registration with `authService.registerSubscriber()`
3. Replace login with `authService.loginSubscriber()`
4. Replace profile with `progressService.getSubscriberProfile()`
5. Replace progress routes with `progressService`
6. Replace workout feedback with `progressService`
7. Replace calendar with `scheduleService.getPersonalTimeline()`
8. Replace feedback/ticket routes with `feedbackService`
9. Run all tests, fix assertions
10. Commit + push

### Step 3: Wire index.js routes
1. Replace ticket routes with `feedbackService`
2. Replace settings with `settingsRepo`
3. Create `dashboard.service.js` for dashboard aggregation
4. Replace complex lessons with repository calls
5. Run all tests, fix assertions
6. Commit + push

### Step 4: Update error format in tests
After all routes are wired, the API error format changes from:
```json
{"error": "message"}
```
to:
```json
{"success": false, "error": {"code": "VALIDATION_ERROR", "message": "message"}}
```
This requires updating test assertions in backend.test.js and security.test.js.

### Step 5: Update CHANGELOG + commit + push
- Version bump to 5.2.1 or 5.3.0
- Update CHANGELOG with Phase 3 completion

---

## IMPORTANT FILES (read these first in next session)

### Must-read for context:
- `PROGRESS.md` (this file)
- `CHANGELOG.md` (full history)
- `C:\Ded\спорт\Разное\Аналиp-аудит GPT.txt` (tech spec, lines 884-900 for Phase 3)

### Files to modify in Phase 3 wiring:
- `server/routes/auth.js` (108 lines — auth routes)
- `server/routes/user.js` (888 lines — subscriber routes)
- `server/index.js` (1275 lines — server + all API routes)
- `server/routes/crud.js` (130 lines — generic CRUD, probably fine as-is)

### New files created in Phase 3 (read-only reference):
- `server/helpers/errors.js` — error classes
- `server/middleware/requestId.js` — request ID
- `server/helpers/logger.js` — structured logging
- `server/services/auth.service.js` — auth business logic
- `server/services/progress.service.js` — progress business logic
- `server/services/schedule.service.js` — schedule/calendar business logic
- `server/services/feedback.service.js` — ticket business logic
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
│   └── requestId.js      — X-Request-Id (NEW v5.2.0)
├── helpers/
│   ├── errors.js         — Unified error classes (NEW v5.2.0)
│   ├── logger.js         — Structured logging (NEW v5.2.0)
│   ├── pagination.js     — parsePagination
│   ├── config.js         — validateConfig
│   └── migrations.js     — DB migration runner
├── routes/
│   ├── auth.js           — Admin auth (login, logout, password)
│   ├── user.js           — Subscriber routes (~888 lines)
│   └── crud.js           — Generic CRUD factory
├── services/
│   ├── auth.service.js   — Auth business logic (NEW v5.2.0)
│   ├── progress.service.js — Progress/feedback logic (NEW v5.2.0)
│   ├── schedule.service.js — Calendar/timeline logic (NEW v5.2.0)
│   ├── feedback.service.js — Ticket system logic (NEW v5.2.0)
│   ├── mailer.js         — Email sending
│   └── stream.js         — Cloudflare Stream
├── repositories/
│   ├── base.repository.js — Generic CRUD repository (NEW v5.2.0)
│   ├── subscriber.repository.js (NEW v5.2.0)
│   └── index.js          — All other repos (NEW v5.2.0)
└── migrations/
    └── 001_performance_indexes.sql
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
