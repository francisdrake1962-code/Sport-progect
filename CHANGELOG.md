# Changelog

Все заметные изменения проекта «Цигун и суставная разминка».

---

## [5.6.0] - 2026-07-27

### Added — Tech Spec Compliance (AUTH-002, SEC-003/006, API-003/008, OPS-004, OBS-003, ADMIN-006)

#### RBAC (AUTH-002)
- `server/middleware/rbac.js` — 3 roles: subscriber(1) < admin(2) < super_admin(3)
- Hierarchy-based access: admin includes subscriber, super_admin includes admin
- `requireRole()`, `requireAdmin()`, `requireSuperAdmin()` middleware
- All inline role checks replaced with middleware (index.js, user.js)
- `superadmin@qigong.com` / `super123` seeded

#### Security Headers (SEC-003/006)
- HSTS with preload (1 year max-age)
- Referrer-Policy: strict-origin-when-cross-origin
- CSP enhanced: frameAncestors 'none', objectSrc 'none'
- CORS: multi-origin support via comma-separated ALLOWED_ORIGIN env

#### Input Validation (API-008)
- `server/middleware/validation.js` — validateBody() middleware
- Applied to: admin login, subscriber login, register, password change
- Validates: required, type, minLength, maxLength, min, max, enum, pattern

#### API Versioning (API-003)
- `server/middleware/api-version.js` — X-API-Version header
- X-API-Version and X-API-Supported in all responses
- Rejects unsupported versions with 400

#### Graceful Shutdown (OPS-004)
- SIGTERM/SIGINT: stop accepting → finish requests → save DB → exit
- 10s forced shutdown timeout
- Readiness endpoint returns 503 during shutdown

#### Readiness Endpoint (OBS-003)
- `GET /api/ready` — returns 503 until server is fully started, then 200

#### Session Invalidation (AUTH-006)
- Password change now revokes current token (was already working, verified)

#### Dangerous Action Confirmation (ADMIN-006)
- `server/middleware/confirmation.js` — X-Confirm-Action header required
- DELETE /api/user/account requires `confirm: true` in body or `X-Confirm-Action: true` header
- Returns 428 (Precondition Required) without confirmation

#### Documentation
- `docs/ARCHITECTURE.md` — full architecture doc (52KB)
- `docs/API.md` — complete API reference (42KB, 71 endpoints)

#### Tests (9 new)
- RBAC: subscriber blocked, admin/super_admin allowed, unauthenticated blocked
- Input Validation: empty email, empty password, short password, invalid email
- Readiness endpoint
- Dangerous action confirmation (428 without, 200 with)

#### Version bump: 5.5.1 → 5.6.0

---

## [5.5.1] - 2026-07-27

### Fixed — Devil's Advocate Round 1: Critical Security & Data Integrity (P0)

#### Security Fixes
- **auth.js**: JWT algorithm pinning (HS256 only), fail-closed token revocation (was fail-open on DB error)
- **db.js**: `role` DEFAULT changed from `'admin'` to `'subscriber'` (privilege escalation fix), added `idx_token_blocklist_hash` index
- **user.js**: Fingerprint endpoint uses `req.ip` (not client-supplied `ip`), account deletion now calls `revokeToken()`, full GDPR erasure (deleted `watched_lessons`, `workout_feedback`, `free_lesson_selections`, anonymized `tickets`)
- **base.repository.js**: Removed `raw()` method (SQL injection vector), added column whitelist validation for `findByColumn()`
- **user.js**: Removed `?token=` query string auth (JWT leakage vector), JSON.parse wrapped in try/catch (onboarding, lessons-filter), free-selections DELETE+INSERT wrapped in `transaction()` with `Set` dedup

#### Data Integrity Fixes
- **analytics.service.js**: `params` now passed to `db.exec()` (was completely broken — returned all rows), `saveDb()` called after tracking events
- **recommendation.service.js**: `GROUP_CONCAT` zones split to array (was string comparison failing), JSON.parse tags wrapped in try/catch
- **content-version.service.js**: `saveDb()` called after `createVersion`, `restoreVersion` wrapped in `transaction()`
- **progress.service.js**: Added `'calm'` and `'tired'` to valid moods, `workout_feedback` uses `INSERT ... ON CONFLICT DO UPDATE` (was throwing UNIQUE constraint errors)

#### New Tests (12 tests added)
- JWT algorithm none rejection, malformed header, subscriber token validity
- GDPR account deletion + token revocation verification
- Fingerprint IP trust, fingerprint validation
- Analytics dashboard/stats/timeline with filtering
- Content versioning create/list
- Recommendations endpoint verification

#### Other
- UI asset updates (hero-poster, screen images)
- Version bump 5.5.0 → 5.5.1

---

## [5.5.0] - 2026-07-27

### Added — Phase 5: Product Evolution (Step 1-3)

#### Analytics (ANALYTICS-001, ANALYTICS-002)
- `analytics_events` table — event_name, user_id, entity, entity_id, metadata, ip_address, user_agent, created_at
- `server/services/analytics.service.js` — trackEvent, getEventStats, getEventTimeline, getUserActivity, getDashboard
- Auto-tracked events: user_logged_in, user_registered, lesson_started, lesson_completed, lesson_created, lesson_updated, lesson_deleted, feedback_submitted, free_lesson_selected, recommendation_viewed
- `GET /api/admin/analytics/dashboard` — aggregated stats (total events, unique users, top events, daily activity)
- `GET /api/admin/analytics/stats` — grouped by event_name/entity/date/user_id with date range filters
- `GET /api/admin/analytics/timeline` — daily event counts
- `GET /api/admin/analytics/user/:userId` — user-specific event history

#### Recommendations (REC-001, REC-002)
- `server/services/recommendation.service.js` — RuleBasedRecommendationProvider
- Factors: focus_zones (30pts), goals (20pts), schedule/day-of-week (15pts), feedback mood (10pts), plan match (5pts)
- `GET /api/user/recommendations` — subscriber-facing, supports limit + exclude_watched params
- `GET /api/admin/recommendations/:subscriberId` — admin view for any subscriber
- Auto-tracked `recommendation_viewed` events

#### Content Versioning
- `lesson_versions` table — full snapshots of lesson state per version
- `server/services/content-version.service.js` — createVersion, getVersions, getVersion, restoreVersion, compareVersions
- Auto-versioning on lesson update via CRUD routes
- `POST /api/admin/lessons/:id/version` — manual snapshot
- `GET /api/admin/lessons/:id/versions` — version history
- `GET /api/admin/lessons/:id/versions/:version` — specific version
- `POST /api/admin/lessons/:id/restore/:version` — restore to previous version
- `GET /api/admin/lessons/:id/compare?a=1&b=2` — diff two versions

### Stats
- 715/715 tests passing
- 0 lint errors, 69 warnings
- Версия: 5.4.0 → 5.5.0

---

### Added — Phase 4: Production Hardening

#### CI/CD Pipeline
- `.github/workflows/ci.yml` — GitHub Actions: lint + test (Node 18+20 matrix) + build
- `eslint.config.js` — ESLint flat config, 0 errors, 65 warnings (unused vars)
- `package.json` — added `lint` / `lint:fix` scripts, version bumped to 5.4.0

#### Audit Logging
- `audit_log` table — action, entity, entity_id, user_id, user_role, details (JSON), ip_address, created_at
- `server/services/audit.service.js` — `logAction()` + `getAuditLogs()` with entity/user/action filters
- Automatic audit logging in `crud.js` for all CRUD tables (create/update/delete)
- Manual audit logging in `index.js` for settings, complex-lessons, admin feedback routes
- `GET /api/admin/audit-logs` — paginated, filterable by entity, user_id, action

#### GDPR Compliance
- `GET /api/user/data-export` — subscriber data export (profile, watched lessons, workout feedback, tickets, free selections, preferences)
- `DELETE /api/user/account` — account anonymization (PII scrubbed, status set to 'deleted')

#### Monitoring
- `GET /api/health/detailed` — admin-only: uptime, memory usage, entity counts, DB size, node version
- Basic `/api/health` remains public and unauthenticated

#### Backup & Restore
- `POST /api/admin/backup` — timestamped DB copy to `data/backups/` + audit log entry
- `POST /api/admin/restore` — restore from backup file (path traversal protection: restricted to backup directory)

### Fixed
- `feedback.service.js` `closeTicket()` — added missing ticketId validation (was passing raw string to SQL)
- `repositories/index.js` — added missing `saveDb` import (complex-lessons POST/PUT/DELETE were failing with 500)
- `feedback.service.js` — fixed circular dependency (moved `queryToObjects` to `helpers/db-utils.js`)

### Stats
- 715/715 tests passing
- 0 lint errors, 65 warnings
- Версия: 5.3.0 → 5.4.0

---

### Changed — Phase 3 Route Wiring (Steps 1-3)

#### Step 1: Auth Routes Wired (v5.2.2)
- `server/routes/auth.js` — replaced all inline DB calls with `authService` methods
  - POST /login → `authService.loginAdmin()`
  - GET /me → `authService.getAdminProfile()`
  - POST /logout → `authService.revokeCurrentToken()`
  - PUT /password → `authService.changeAdminPassword()`
- Added `jti` (UUID) claim to JWT tokens to prevent identical token generation

#### Step 2: User Routes Partially Wired
- `server/routes/user.js` — 4 of ~20 routes wired to services:
  - POST /login → `authService.loginSubscriber()`
  - GET /me → `progressService.getSubscriberProfile()`
  - PUT /me → `progressService.updateSubscriberProfile()` + `authService.revokeCurrentToken()`
  - POST /logout → `authService.revokeCurrentToken()`
- Removed local `revokeCurrentToken()` function (using authService)

#### Step 3: Index.js Routes Wired
- `server/index.js` — 15 routes replaced with service/repository calls:
  - **Feedback** (8 routes): subscriber CRUD → `feedbackService`, admin CRUD → `feedbackService`
  - **Settings** (3 routes): GET/PUT/POST → `settingsRepo.getAll()` + `settingsRepo.set()`
  - **Dashboard** (1 route): GET → `dashboardService.getStats()`
  - **Complex Lessons** (4 routes): GET/POST/PUT/DELETE → `complexRepo` methods

#### New Service Created
- `server/services/dashboard.service.js` — admin dashboard stats aggregation (replaces 8 inline DB queries)

#### Repository Extensions
- `SettingsRepository.getAll()` — returns flat `{key: value}` object (no `id` column in settings table)
- `SettingsRepository.set()` — fixed column quoting for SQLite reserved word `key`
- `ComplexRepository` — added `listComplexLessons()`, `upsertComplexLesson()`, `updateComplexLessonPosition()`, `deleteComplexLesson()`

#### Bug Fixes
- Fixed `SettingsRepository.set()` selecting nonexistent `id` column from settings table
- Fixed `feedbackService.replyToTicket()` missing NaN validation for invalid ticket IDs (was returning 404 instead of 400)

#### Routes Still Inline (intentionally)
- **user.js**: register (email sending), watch-progress (free logic), progress (pagination mismatch), calendar (complex logic), lessons-filter, onboarding, categories, workout-feedback (mood mismatch), dashboard, free-selections, fingerprint
- **index.js**: public routes (simple read-only), settings test-email/stream, video streaming, trainer photo upload, lesson-zones

### Stats
- 715/715 tests passing (132 backend + 38 security + 545 frontend)
- 30 routes wired to services/repos (from ~2100 lines of inline DB calls)
- ~20 routes intentionally left inline
- Версия: 5.2.1 → 5.3.0

---

### Added
- `PROGRESS.md` — comprehensive roadmap bookmark file for session continuity, contains full Phase 3 status, next actions, architecture reference, and key rules

### Updated
- `FEATURE_REGISTRY.md` — updated test suite counts to 715, added Phase 3 features (F121-F130), added security test suite

### Stats
- 715/715 tests passing
- Версия: 5.2.0 → 5.2.1

---

## [5.2.0] - 2026-07-26

### Added — Phase 3 Refactoring (Foundation)

#### Unified Error Model
- Классы ошибок: `AppError`, `ValidationError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `RateLimitError`, `PayloadTooLargeError`
- `formatSuccess(res, data)` и `formatError(res, error, requestId)` — единый формат API-ответов
- Глобальный error handler использует unified error model

#### Request ID Middleware
- `X-Request-Id` header автоматически генерируется для каждого запроса
- Каждый ответ содержит `X-Request-Id` header

#### Structured Logging
- `createLogger(component)` — JSON логирование с level, timestamp, component, meta
- `requestLogger` middleware — автоматически логирует method, url, status, duration
- Supports `LOG_LEVEL` env var (error/warn/info/debug)

#### Service Layer
- `auth.service.js` — loginAdmin, loginSubscriber, registerSubscriber, changeAdminPassword, revokeCurrentToken
- `progress.service.js` — recordWatchProgress, getProgress, getWorkoutFeedback, recordWorkoutFeedback, getSubscriberProfile, updateSubscriberProfile
- `schedule.service.js` — getSchedule, getPersonalTimeline
- `feedback.service.js` — createTicket, getSubscriberTickets, replyToTicket, closeTicket
- Все сервисы бросают AppError subclasses

#### Repository Layer
- `BaseRepository` — generic CRUD: findAll, findById, create, update, delete, count, raw
- `SubscriberRepository` — findByEmail, getPublicProfile, confirmEmail
- `LessonRepository` — findByStatus, getZones, setZones
- `UserRepository` — findByEmail
- `FaqRepository`, `ReviewRepository`, `ComplexRepository`, `SettingsRepository`

### Stats
- 715/715 tests passing
- Версия: 5.1.1 → 5.2.0

---

## [5.1.1] - 2026-07-26

### Fixed — Security Tests Strengthening + Error Handler Bug + JWT Uniqueness

#### Server Fixes
- **CRITICAL:** JWT `generateToken()` теперь добавляет `jti` (random UUID) в payload — предотвращает генерацию идентичных токенов для одного пользователя в ту же секунду (ранее токены с одинаковым `iat` получали одинаковый хеш и ломали token revocation)
- **HIGH:** Error handler теперь корректно возвращает 413 для oversized bodies (PayloadTooLargeError) вместо generic 500

#### Security Tests (38 tests, all specific assertions)
- **Переписан `tests/security.test.js`**: все 11 "no-op" тестов с catch-all assertions заменены на конкретные проверки
- Добавлены тесты: SQL injection in CRUD (parameterized queries), request size limits (413), Content-Type validation (JSON), admin panel accessibility
- Исправлен `confirmation_token` property name (snake_case)
- Все тесты теперь проверяют конкретные HTTP статусы
- CRUD Authorization тесты используют свежий токен для каждого запроса (fresh login)

### Stats
- 715/715 tests passing (was 710)
- Версия: 5.0.0 → 5.1.1

---

## [5.0.0] - 2026-07-26

### Added — Phase 1 Stabilization (Technical Specification Compliance)

#### P0: API Pagination
- Добавлена пагинация `?page=&limit=` на все list endpoints
- Все list endpoints теперь возвращают `{ data: [], pagination: { page, limit, total, totalPages } }`
- Max limit: 100, default: 50
- Затронуто: `/api/lessons`, `/api/complexes`, `/api/schedule`, `/api/reviews`, `/api/faq`, `/api/complex-lessons`, `/api/admin/feedback`, CRUD GET routes, `/api/user/progress`, `/api/user/workout-feedback`, `/api/user/lessons-filter`
- Создан `server/helpers/pagination.js` — общий модуль пагинации

#### P0: Token Revocation
- Добавлена таблица `token_blocklist` в схему БД
- JWT tokens теперь проверяются на блоклисте при каждом запросе
- `POST /api/auth/logout` — админ logout с ревокацией токена
- `POST /api/user/logout` — subscriber logout с ревокацией токена
- Смена пароля автоматически отзывает текущий токен (admin + subscriber)
- Добавлен индекс `idx_token_blocklist_expires`
- Созданы тесты для token revocation (3 новых теста)

#### P1: Config Validation
- Приложение завершает запуск при отсутствии обязательных env vars в production
- `JWT_SECRET` и `ALLOWED_ORIGIN` обязательны в production mode
- В dev/test mode — предупреждения вместо ошибок
- Создан `server/helpers/config.js`

#### P1: DB Transaction Boundaries
- Добавлен `transaction(fn)` helper в `server/db.js`
- Транзакции применены к: создание тикета (tickets + ticket_messages), обновление зон урока (lesson_zones DELETE + INSERT)
- Все транзакции используют BEGIN/COMMIT/ROLLBACK

#### P1: DB Migration System
- Создан `server/helpers/migrations.js` — система versioned migrations
- Таблица `migrations` для отслеживания применённых миграций
- Создан `server/migrations/001_performance_indexes.sql` — 20+ индексов для часто запрашиваемых колонок
- Миграции автоматически применяются при запуске сервера
- Поддержка ручного запуска: `require('./helpers/migrations').runMigrations()`

### Changed
- API list endpoints теперь возвращают `{ data, pagination }` вместо голого массива
- Тесты обновлены для проверки нового формата ответа
- Версия: 4.1.0 → 5.0.0

---

## [4.1.0] - 2026-07-26

### Fixed — Адвокат дьявола, Раунд 1+2 (33 исправления)

- **CRITICAL:** Исправлены 8 сломанных тестов (FAQ переключён на динамическую загрузку через `/api/faq`, тесты проверяли статический HTML)
- **HIGH:** Multer directory injection — `req.query.type` санитизируется (только `[a-zA-Z0-9_-]`), предотвращает запись файлов за пределы uploads/
- **HIGH:** `fs.statSync` race condition — обёрнут в try/catch для корректной обработки удаления файла между проверкой существования и получением размера
- **MEDIUM:** Health check `/api/health` теперь проверяет подключение к БД (возвращает `db: 'ok'` или 503 с `db: 'error'`)
- **MEDIUM:** Все CRUD обработчики (`crud.js`) теперь логируют ошибки через `console.error` вместо молчаливого проглатывания
- **MEDIUM:** Ticket routes — `req.params.id` конвертируется в `Number` с валидацией (все 6 хендлеров: subscriber GET, subscriber reply, admin GET, admin PUT, admin reply)
- **MEDIUM:** Ticket subject/message — добавлены лимиты длины (subject: 200, message: 5000 символов)
- **MEDIUM:** `assigned_to` — санитизируется (trim + limit 100 символов)
- **MEDIUM:** `position_seconds` — валидация диапазона [0, 86400], отрицательные и экстремальные значения clamped
- **LOW:** Длина пароля подписчика — повышена с 6 до 8 символов (согласовано с регистрацией)
- **LOW:** `require()` внутри request handlers вынесен на верхний уровень модуля (`index.js`, `routes/auth.js`)
- **LOW:** Добавлен graceful shutdown (SIGTERM/SIGINT) — `saveDb()` перед выходом
- **LOW:** Subscriber ticket reply — `message` проверяется на `trim()` (пустые сообщения отклоняются)

### Fixed — Раунд 2 (5 дополнительных исправлений)
- **MEDIUM:** `require('jsonwebtoken')` внутри video handler вынесен на верхний уровень модуля
- **MEDIUM:** SQL LIKE wildcard injection — экранирование `%` и `_` в filename при проверке video URL
- **MEDIUM:** Дублирующийся `GET /api/schedule` (admin) удалён — уже есть публичный эндпоинт
- **LOW:** `require()` внутри `checkSubscriptions()` вынесен на верхний уровень модуля
- **MEDIUM:** Добавлен глобальный rate limiter (200 req/min) на все `/api/*` кроме auth/user

### Changed

- `package.json` version → 4.1.0
- Тесты: **674/674** (8 сьютов) — +20 новых интеграционных тестов
- Новые тест-сьюты: Health Check with DB, Security Hardening, Feedback Ticket Flow, FAQ Public Endpoint, Lessons Public Endpoints

---

## [4.0.0] - 2026-07-25

### Added

- **Dashboard подписчика** (`/dashboard.html`) — приветствие, статистика, «Продолжить», сегодняшний урок, зоны, расписание, быстрые ссылки
- **Onboarding** (`/onboarding.html`) — 5-шаговый визард настроек (опыт, цели, длительность, время, зоны)
- **Picker уроков** (`/picker.html`) — фильтрация по зоне, длительности, настроению
- **Профиль** (`/profile.html`) — информация о подписке + календарь настроения (7 дней)
- **Обратная связь по уроку** — emoji-оценка после завершения (6 настроений: 😊⚡🧘😐😴😞), сохранение в `workout_feedback`
- **Cast to TV** — кнопка 📺 в плеере: Presentation API (Chrome Cast), Screen Mirroring (navigator.share), fallback (открыть URL)
- **Раздел «Как вы хотите себя чувствовать?»** на лендинге — 8 целей с emoji (Взбодриться/Успокоиться/Лучше спать и т.д.)
- **Бейдж «⭐ Популярное»** на карточке формата «На полу»
- **API обратной связи** — `POST /api/user/workout-feedback`, `GET /api/user/workout-feedback`, `GET /api/user/workout-feedback/:lessonId`
- **API настроек пользователя** — `GET/POST /api/user/onboarding`
- **API дашборда** — `GET /api/user/dashboard`, `GET /api/user/categories`
- **Таблица `workout_feedback`** — оценки настроений после занятий
- **Таблица `user_preferences`** — настройки подписчиков из onboarding
- **Skip-to-content ссылки** на dashboard.html и onboarding.html (accessibility)

### Changed

- `package.json` version → 3.5.0
- Тесты: **656/656** (8 сьютов)
- `jest.config.js` — исключена папка `references/` из тестов

---

## [3.4.0] - 2026-07-24

### Changed — Переработка структуры БД (ТЗ_переработка_таблиц)

- **BREAKING:** Таблица `exercises` удалена (DROP TABLE IF EXISTS)
- **BREAKING:** Строка `exercises.html` удалена из админки и webpack
- Новая таблица `lesson_zones` (lesson_id, zone) — связь многие-ко-многим
- Новые колонки в `lessons`: `direction` (суставная_разминка/занятие_в_потоке), `direction_source` (заголовок/описание_неточно/нет_данных), `effect_description`, `effect_is_draft`
- CRUD lessons обновлён — новые поля в валидации
- `VALID_TABLES` в crud.js — `exercises` заменён на `lesson_zones`
- Sidebar админки — раздел «Упражнения» удалён

### Added

- `GET /api/lesson-zones/:lessonId` — публичный эндпоинт зон урока
- `PUT /api/admin/lessons/:id/zones` — сохранение зон (admin only)
- `/lessons-filter` фильтрует по `lesson_zones` (точный SQL `WHERE zone IN (...)`) вместо JSON `tags`
- Админка lessons.html: переключатель «Направление», чекбоксы «Зоны тела» (8 зон), поле «Описание эффекта» с бейджем «Черновик»
- Seed data обновлён: 10 уроков с direction/zones/effect_description, 14 записей lesson_zones

---

## [3.3.5] - 2026-07-22

### Fixed
- **P0.4:** Hero CTA «Начать бесплатно» ведёт на `login.html?tab=register` (было «Войти» без переключения на вкладку регистрации)
- **P0.4:** `login.html` поддерживает `?tab=register` — автоматически открывает вкладку регистрации
- **P0.4:** Кнопка «Начать бесплатно» на странице тарифов также ведёт на `login.html?tab=register`
- **H1:** 25 обработчиков ошибок в `server/index.js` и `server/routes/crud.js` больше не утекают `err.message` — возвращается «Internal server error», 실제 오류 логируется через `console.error`
- **H2:** Admin login: исправлена проверка пустого результата sql.js (`result.length === 0` → `!result.length || !result[0].values.length`)
- **H4:** Валидация Range заголовка видео — NaN, выход за границы, перевёрнутые диапазоны → 416
- **H5/H8:** CRUD подписчиков больше не возвращает `password` и `confirmation_token` в GET-ответах
- **M5/M6:** Плеер показывает «Подтвердите email» при can-watch 403 (ранее молча пропускал)

### Changed
- Обновлены: CHANGELOG.md, DEVIL_ADVOCATE_REPORT.md
- Тесты: **658/658** (8 тест-сьютов)

---

## [3.3.4] - 2026-07-22

### Fixed
- **CRITICAL:** Email confirmation GET handler — ссылка из письма теперь работает (было только POST)
- **CRITICAL:** `confirmation_token` удалён из ответа login 403 (был утечка — можно было подтвердить чужой email)
- **CRITICAL:** SPA fallback path traversal — добавлена проверка `path.resolve` + `startsWith(distDir)`
- **CRITICAL:** Видео доступ — запрет по умолчанию если нет привязки к уроку
- **HIGH:** Admin settings: исправлены имена полей (`telegram` → `social_telegram`, `subscription_price` → `annual_price`); добавлены `promo_*` в allowlist
- **HIGH:** `VIDEOS_DIR` изменён с Windows-пути на кроссплатформенный `../videos`
- **MEDIUM:** Schedule: валидация формата YYYY-MM-DD
- **MEDIUM:** Dashboard conversion rate: формула `paid_subs / total_subs * 100%`
- **MEDIUM:** Все 6 admin `openCreate()` теперь открывают модалку
- **LOW:** Exercises `openCreate()` сбрасывает zone/difficulty

### Added
- `DEVIL_ADVOCATE_REPORT.md`

---

## [3.3.3] - 2026-07-22

### Fixed
- **CRITICAL:** Video access control — unauthenticated users не могут стримить видео
- **HIGH:** Admin schedule form — `<input type="date">` вместо day-of-week `<select>` (БД хранит `date TEXT UNIQUE`)
- **HIGH:** Duplicate schedule date → 409 «Запись на эту дату уже существует»
- **HIGH:** Admin password больше не перезаписывается при рестарте (`INSERT OR IGNORE`)
- **HIGH:** Все 6 admin страниц — edit кнопки корректно открываются
- **MEDIUM:** Admin lessons: `cf_video_uid` поле добавлено, `date` не отправляется при EDIT
- **MEDIUM:** `confirmation_token` не утекает в production ответе регистрации
- **MEDIUM:** Server-side email format validation
- **MEDIUM:** Schedule PUT валидирует `date`
- **MEDIUM:** watch-progress валидирует `lesson_id`

### Added
- Email provider switching: `MAIL_PROVIDER` env (console/gmail/resend)
- Gmail SMTP через nodemailer
- `localDateStr()` — исправление timezone bug

---

## [3.3.2] - 2026-07-22

### Fixed
- **CRITICAL:** Path traversal в `/videos/{*splat}`
- **CRITICAL:** Пустой catch в video auth handler
- **HIGH:** XSS в login.html
- **HIGH:** Dev confirmation link утекал в production
- **MEDIUM:** `FREE_LIMIT=7` дедуплицирован
- **MEDIUM:** Admin settings gallery исправлен
- **LOW:** `decodeURIComponent` обёрнут в try/catch

### Added
- `FREE_LIMIT` константа, экспортируемая из `user.js`
- `escHtml()` в login.html
- 4 security теста

---

## [3.2.0] - 2026-07-22

### Fixed
- Path traversal в `/videos/{*splat}` — `path.resolve` валидация
- Пустой catch block в video auth handler
- XSS в login.html — `escHtml()`
- Dev confirmation link только на localhost
- `FREE_LIMIT=7` дедуплицирован
- `admin/settings.html` gallery исправлен
- `decodeURIComponent` обёрнут в try/catch

### Test Results
- **658 тестов** (8 сьютов, все проходят)

---

## [3.1.0] - 2026-07-22

### Fixed
- `fs` не импортирован в server/index.js
- JWT_SECRET mismatch между video handler и auth middleware
- `free_sessions_used` не инкрементируется для бесплатных уроков
- Email confirmation endpoint возвращает 400 для невалидных токенов
- Dashboard schedule table `s.day` → `s.date`
- Calendar week view включает воскресенье
- `render.yaml` buildCommand исправлен
- Landing page testimonials orphaned div tags
- Schedule seed start date: 2025 → 2026

### Added
- `fs` импорт
- `JWT_SECRET` экспорт из auth.js
- Server-side access check в video endpoint
- Rate limiting на subscriber auth routes
- Admin lessons: `video_url`, `is_free`, `free_order`
- `GET /api/user/can-watch/:lessonId`
- `GET /api/user/calendar`
- Calendar page
- 24 backend integration теста

### Test Results
- **636 тестов** (8 сьютов)

---

## [2.2.0] - 2026-07-21

### Added
- Helmet security headers
- CSP через vercel.json
- Global Express error handler
- Password change endpoint
- Users CRUD endpoint
- Settings allowlist
- Input validation
- OG tags + Twitter Card
- Canonical URLs
- JSON-LD structured data
- Favicon на всех страницах
- `prefers-reduced-motion` CSS
- Tablet breakpoint
- `<caption>` на всех таблицах
- `aria-labelledby` на модалках
- `<meta name="robots">` на admin страницах
- Footer `<nav>` с `aria-label`
- `PRAGMA foreign_keys = ON`
- INSERT OR IGNORE на seed data
- Dockerfile + render.yaml + vercel.json

### Test Results
- **600 тестов** (8 сьютов)

---

## [2.1.0] - 2026-07-21

### Added
- Rate limiting на login
- PWA: manifest.json, service worker
- Health check endpoint
- Deploy configs
- Feature Registry

### Test Results
- **600 тестов**

---

## [1.6.0] - 2026-07-21

### Fixed
- Garbled text исправлен
- Placeholders `[Имя тренера]` заменены
- Logo paths исправлены
- Login/signup ссылки исправлены

### Added
- Skip-to-content links
- Focus-visible стили
- Escape key для закрытия меню

### Test Results
- **355 тестов** (6 сьютов)

---

## [1.0.0] - 2026-07-21

### Added
- Начальная структура проекта
- Landing page со всеми секциями
- Trust pages (Бесплатно?, Как отменить?, О тренере)
- SEO pages (8 кусков парчи, И Цзинь Цзин, Малый небесный круг)
- CSS стилизация с адаптивностью
- JavaScript интерактивность
- Тестовый набор

---

## Известные проблемы
- Нет оплаты (Stripe интеграция — по ТЗ P2)
- CSP настроен с `unsafe-inline` (нужно вынести inline JS в bundle)
- Нет пагинации на CRUD эндпоинтах
- JWT_SECRET генерируется случайно при каждом рестарте
- Нет rate limiting на watch-progress и admin CRUD
- saveDb() non-atomic (truncate + write) — приемлемо для MVP
