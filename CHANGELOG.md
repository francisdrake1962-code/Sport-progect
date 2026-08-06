# Changelog

Все заметные изменения проекта «Цигун и суставная разминка».

---

## [5.24.1] - 2026-08-06

### Fixed — picker «Подобрать занятие» (вкладка подбора признаков) + UI wording

- **Корень проблемы**: на вкладке «Подобрать занятие» фильтры «Зона тела»/«Самочувствие» вообще не показывались — скрипт `src/pages/picker.html` падал с `ReferenceError` (`activeZones`/`activeMoods` использовались в `renderChips`/`applyFilters`, но нигде не объявлялись). Добавлены объявления `var activeZones = {}; var activeMoods = {};`.
- **Смысл «Самочувствия» разъяснён в интерфейсе**: заголовок секции теперь «Самочувствие после занятия» с подсказкой «Каким хотите себя чувствовать по завершении — бодрым, спокойным, в балансе» (признак = желаемое состояние **после** занятия, а не текущее).
- **Окно «Подобрать» → «Подобрать занятие»**: `src/pages/dashboard.html` (окошко в разделе «Все занятия» и шапка), `src/pages/lessons.html` (ссылка «🔍 Подобрать занятие»).
- **Признаки видны в карточках подбора**: `/api/user/lessons-filter` теперь возвращает `zones`/`moods` для каждого урока; карточка показывает метки «Зона» и «Эффект».
- **URL-параметры**: вкладка подбора учитывает `?zone=…&mood=…` из ссылок с главной (карточки зон).
- Full suite: **1021/1021 tests, 21 suites** (randomized); eslint 0 errors; build passes.

---

## [5.24.0] - 2026-08-06

### Added — lesson features: body zones + moods (справочник, авто-классификация, фильтр)

По запросу клиента добавлены признаки занятий «Зона тела» (8) и «Самочувствие» (4): справочник, авто-определение при импорте каталога, ручная правка в админке, фильтр подбора занятий, колонка в списке уроков. Также в админке исправлена пустота списка занятий (тянулся только публичный `active`-список) и удалён негодный урок №1031 из каталога (33→34 записи).

- `server/constants/lesson-features.js` — справочник: 8 зон (`шея`, `плечи_руки`, `грудной_отдел`, `поясница`, `спина_осанка`, `колени`, `ноги_таз`, `баланс_общее`) и 4 настроения (`энергия`, `снятие стресса`, `баланс`, `поток`) с метками (single source of truth).
- `server/services/lesson-features.js` — `inferLessonFeatures()` эвристическая авто-классификация по теме/цели/эффекту (zonе/mood keyword matching, фолбэк зоны `баланс_общее`).
- `server/migrations/019_lesson_moods.sql` + базовая схема в `server/db.js` — таблица `lesson_moods` (lesson_id, mood, PK, FK `ON DELETE CASCADE`, индекс).
- `server/index.js`:
  - `GET /api/lesson-features` (публичный справочник);
  - `GET /api/lesson-moods/:lessonId`, `PUT /api/lessons/:id/moods` (валидация `MOOD_IDS`, транзакция, saveDb);
  - `GET /api/admin/lessons` — все статусы (вкл. `draft`) + `zones`/`moods`/`zones_labels`/`moods_labels`;
  - импорт каталога preview/apply теперь пишет `zones`/`moods` через `inferLessonFeatures` в `lesson_zones`/`lesson_moods`.
- `server/routes/user.js` — фильтр `mood` в `/api/user/lessons-filter` ищет и в `lesson_moods`, и в `tags` (fallback); `catalog_no` добавлен в ответ фильтра.
- `src/admin/lessons.html` — список тянет `/api/admin/lessons` (все статусы), колонка «Самочувствие» (`zones_labels`/`moods_labels`), чекбоксы настроений в форме, сохранение через `PUT /api/lessons/:id/moods`.
- `src/pages/picker.html` — подгрузка справочника с `/api/lesson-features` (fallback на захардкоженный), убран двойной рендер чипсов.
- `tests/lesson-features.test.js` — новый файл, `TEST_PORT=3013`: unit справочника и `inferLessonFeatures`, API round-trip moods (вкл. 400/404), админ-список с draft, публичный список скрывает draft, импорт заполняет зоны/настроения, фильтр подбора по mood/zone. Picker-тесты самодостаточны (не зависят от порядка при `--randomize`).
- Data: урок №1031 (id 31) удалён (CRUD DELETE), orphan-записей в `lesson_zones`/`video_uploads`/`lesson_media`/`lesson_versions`/`watched_lessons` нет.
- Full suite: **1021/1021 tests, 21 suites** (randomized); eslint 0 errors; build passes (2 pre-existing asset-size warnings).

---

## [5.23.0] - 2026-08-06

### Added — local video upload (no Mux) for the catalog

Работа с каталогом теперь возможна без внешних сервисов: загрузка `.mp4/.mov/.webm/.avi/.mkv` прямо из админки в папку `videos/`, урок получает `video_provider='local'` и `video_url='/videos/<файл>'`. Mux-загрузка и Stripe не требуются; почта остаётся на `console`-провайдере (подтверждения печатаются в лог).

- `POST /api/admin/lessons/:id/video/local-upload` (multipart `file` + `language`): multer disk-storage → `videos/` (`VIDEOS_DIR` override для тестов), строка `video_uploads` (`provider='local'`, `status='ready'`, `original_filename`, `file_size`), `lessons.video_url`/`video_provider='local'`/`video_id=NULL`, `lesson_media` upsert (`status='ready'`), аудит-запись, чистка файла/строки при ошибках (в т.ч. отсутствующий урок не оставляет orphan-файл).
- Admin UI (`src/admin/js/stream-upload.js`): отдельный блок «Локальный файл (без Mux)» — выбор файла, прогресс, после загрузки URL подставляется в поле «URL видео», сообщение «нажмите Сохранить». Существующая Mux-секция не тронута.
- `videosDir` вынесен наверх (`server/index.js`) и используется и роутом загрузки, и роутом отдачи `/videos/{*splat}`.
- `tests/admin-video-uploads.test.js`: +8 тестов (auth 401, role 403, invalid id, unsupported ext, upload+link, 404 lesson, no orphan file, replace previous fields) — `VIDEOS_DIR` указывает на временную директорию; всего 21 тест в файле.
- Full suite: **1010/1010 tests, 20 suites** (randomized); eslint 0 errors.

---

## [5.22.0] - 2026-08-06

### Fixed — Devil's Advocate Round 14 (test isolation / DB-002 / ARCH-001)

- **DA-56 (test isolation)**: `tests/backend.test.js` hard-coded `TEST_PORT = 3001` (the default dev port). A leftover dev server on `:3001` silently hijacked the whole suite (51 false failures: empty catalog, 401 admin login). The suite now uses a dedicated `TEST_PORT = 3012` (convention: 3004/3005/3008/3010) and `apiRequest` reads `TEST_PORT`; a port-isolation regression test asserts the suite never uses the dev port.
- **DA-58 (DB-002 / PAY-001)**: `handlePaymentFailed` wrote the subscriber `plan` into `payments.plan`, whose CHECK allows only `monthly`/`annual`. A trial-plan subscriber hitting `invoice.payment_failed` violated the CHECK inside the webhook transaction — the event rolled back and stayed retryable forever. Now maps `trial → monthly` (same rule as `adminGrantAccess`).
- **DA-57 (ARCH-001)**: `FEATURE_REGISTRY.md` referenced the removed `server/services/schedule.service.js` and claimed v4.1.0. Added a reference-integrity test (every `server/…` reference must point to an existing file), removed the obsolete F126 row, bumped the header.
- Full suite: **1002/1002 tests, 20 suites** (randomized); eslint 0 errors.

---

## [5.21.1] - 2026-08-06

### Added — «Кому подойдёт занятие» (`lessons.audience`)

Поле для информационного блока об аудитории занятия (не показывается в каталоге как обязательное; выводится при выборе занятия и на странице плеера).

- Migration `018_lesson_audience.sql`: `ALTER TABLE lessons ADD COLUMN audience TEXT` (на свежих БД колонка уже есть в базовой схеме `server/db.js`, миграция — no-op через «duplicate column»).
- `server/db.js`: `audience TEXT` в базовую схему `lessons`.
- `server/index.js`: `audience` в публичном списке `/api/lessons` и в полях CRUD.
- Админка `src/admin/lessons.html`: поле «Кому подойдёт» (текстовая область) — создание и редактирование.
- `src/pages/player.html`: на странице занятия (перед запуском видео) — блоки «Цель» и «Кому подойдёт» рядом с эффектом.
- `src/pages/lessons.html`: в карточке каталога — колонка «Кому подойдёт»; в карточке «Сегодня» — строка «👥 …».

---

## [5.21.0] - 2026-08-05

### Changed — Cloudflare Stream removed; Mux-only video provider

Cloudflare Stream вычеркнут из экономики (хранение $0.005/мин + доставка $0.001/мин ≈ $310/мес на 50 роликов при 10k просмотров). Mux — единственный стриминг-провайдер; Bunny Stream остаётся запасным вариантом (не подключён).

- Migration `014_video_id.sql`: `cf_video_uid` → `video_id` во всех таблицах (`lessons`, `lesson_media`, `video_uploads`, `lesson_versions`); индекс `idx_video_uploads_cf_uid` → `idx_video_uploads_video_id`.
- `server/services/stream.js`: Cloudflare-модуль удалён полностью (`getConfig`/CF-функции/`processReadyVideo`/`startStatusPolling`/ES256-подпись). Осталось только Mux: `createMuxDirectUpload`, `getMuxAssetDetails`, `getMuxUploadStatus`, `deleteMuxAsset`, `signMuxPlaybackId` (HS256), `getMuxStreamUrl`.
- `server/index.js`: `ALLOWED_SETTINGS_KEYS` без `cf_stream_*`; удалён `POST /api/settings/test-stream`; `video_id` в публичном списке уроков, CRUD, `lesson-media`, статусе аплоадов; дефолты провайдера — `mux`.
- `server/routes/user.js`: `stream-token` строго Mux (`signMuxPlaybackId` + `getMuxStreamUrl`); `cf_video_uid` → `video_id` в запросах; `lessons-filter` отдаёт `video_id`.
- `server/services/content-version.service.js`: `cf_video_uid` → `video_id` (версии и restore).
- Админка: `settings.html` — блок Cloudflare Stream удалён (остался только Mux); `lessons.html` — селект «Хостинг» удалён, поле `f-cf-uid` → `f-video-id`; `stream-upload.js` — только Mux.
- Сид-данные: seed-уроки с локальными mp4 получают `video_provider = 'local'`.
- Тесты: `backend.test.js`, `stream-mux.test.js`, `admin-video-uploads.test.js`, `i18n.test.js` обновлены под `video_id`/Mux-only (легаси CF-кейсы убраны).
- Документация: `docs/API.md`, `docs/openapi.yaml`, `docs/ARCHITECTURE.md`, `VERIFICATION.md` актуализированы.

---

## [5.20.0] - 2026-08-01

### Fixed — stream-token per-code frontend (API-003 residual)

Round 13 of the Devil's Advocate audit.

- `src/pages/player.html`: `api()` helper now parses the API-001 error body and attaches `err.status` + `err.code` to thrown errors (no more regex-parsing the message for the status).
- Extracted `renderDenied(lesson, complexName, code, freeUsed, freeLimit)` — the access-denial screen is now defined once and shared by the `can-watch` and `stream-token` branches.
- Replaced the `stream-token` `} catch(_){}` (which swallowed every refusal) with per-code actions: 403 `EMAIL_CONFIRMATION_REQUIRED` → «Подтвердите email», gate 403s (`PAYMENT_PAST_DUE`/`SUBSCRIPTION_EXPIRED`/`SUBSCRIPTION_REQUIRED`/`FREE_LIMIT_REACHED`) → `renderDenied`, 503 `STREAMING_NOT_CONFIGURED` → «Видео временно недоступно»; unknown failures fall through to the outer error UI.
- `tests/integrity.test.js`: **3 new assertions** (page references `STREAMING_NOT_CONFIGURED` and `EMAIL_CONFIRMATION_REQUIRED`; the `stream-token` catch is no longer a bare `catch(_)`).
- Full suite: **949/949 tests, 20 suites** (randomized); eslint 0 errors; build passes.

---

## [5.19.0] - 2026-08-01

### Added — Password reset (AUTH-001)

Round 12 of the Devil's Advocate audit.

- `POST /api/user/request-reset` — always answers `{ success: true }` (never reveals whether the email exists); 1-hour one-time token stored as SHA-256 hash; rate-limited (`RATE_LIMIT_MAX_RESET`, default 3/min, `ipKeyGenerator`-safe, test-only `x-test-key` isolation).
- `POST /api/user/reset-password` — one-time TTL token, `INVALID_RESET_TOKEN` / `VALIDATION_ERROR` / `RESET_FAILED` codes, rate-limited (`RATE_LIMIT_MAX_RESET_PASSWORD`, default 5/min). Bumps `subscribers.token_version`; subscriber JWTs carry `ver` and auth middleware rejects any token whose `ver` differs — **all old sessions are invalidated after a reset**.
- Migration `009_password_reset.sql` (+ base schema in `server/db.js`): `password_reset_token`, `password_reset_expires_at`, `token_version` on `subscribers`.
- Mailer: `sendPasswordResetEmail` + exported `RESET_PASSWORD_HTML` — the email contains only the reset link, never a password; console mode logs the link.
- Frontend: new `src/pages/reset-password.html` (request + set-password views), `login.html` "Забыли пароль?" link, clean URL `/reset-password`, webpack page entry; `tests/integrity.test.js` exempt lists updated for the standalone auth page.
- `tests/password-reset.test.js` — **9 tests** (no-reveal, TTL stored, invalid/missing/expired token, short password, full flow with session revocation + one-time reuse, email template, rate limit).
- Full suite: **946/946 tests, 20 suites** (randomized); eslint 0 errors; build passes.

---

## [5.18.0] - 2026-08-01

### Added — Unified error format (API-001)

Round 11 of the Devil's Advocate audit.

- `server/helpers/errors.js` — new `sendError(res, status, code, message, requestId, extra)` helper; `formatError` now also returns `requestId` at the top level (still mirrored in `error.requestId` for old clients). Canonical shape: `{ success:false, error:{code,message}, requestId }`.
- Converted **every** inline `{ error: 'text' }` response in `routes/payment.js`, `routes/user.js` (incl. 4 rate-limiters), `routes/auth.js`, `middleware/validation.js`, `middleware/rbac.js` and `server/auth.js` to stable codes (`INVALID_PLAN`, `VALIDATION_ERROR`, `EMAIL_ALREADY_REGISTERED`, `INVALID_CONFIRMATION_TOKEN`, `NO_TOKEN`/`TOKEN_REVOKED`/`INVALID_TOKEN`, `FORBIDDEN`, `RATE_LIMITED`, gate codes, `STREAMING_NOT_CONFIGURED`, payment/user domain 500 codes). `error` stays a top-level key (transition); gate 403s keep the top-level `code` (API-003 compatibility).
- `src/pages/profile.html` — `errText()` helper so structured errors render `.message` instead of `[object Object]`; `src/pages/plans.html` same inline. `login.html` already switches on `error.code`.
- `tests/error-format.test.js` — **10 contract tests** (register, duplicate, login, confirm, can-watch, stream-token, payment create, admin RBAC, admin login) asserting `success:false` + `error.code` + `error.message` + `requestId`. 6 existing tests updated from string `error` assertions.
- `docs/API.md` — error-format section + stable-code table; `docs/openapi.yaml` — `Error` schema with top-level `requestId`, gate 403 schemas reference it.
- Full suite: **934/934 tests, 19 suites** (randomized); eslint 0 errors; build passes.

---

## [5.17.0] - 2026-08-01

### Added — Machine-readable access denial codes (API-003)

Round 10 of the Devil's Advocate audit.

- `server/routes/user.js` — `GET /api/user/can-watch/:lessonId` and `GET /api/user/stream-token/:lessonId` now return a stable `code` alongside existing fields (`allowed`, `reason`, `freeUsed`, `freeLimit`): `GRANTED`, `SUBSCRIPTION_EXPIRED`, `PAYMENT_PAST_DUE`, `FREE_LIMIT_REACHED`, `SUBSCRIPTION_REQUIRED`, `EMAIL_CONFIRMATION_REQUIRED`. HTTP statuses for existing clients are unchanged (`can-watch` keeps `200 + allowed:false` for plan denials; 403 only for unconfirmed email). `stream-token` now checks access **before** provider availability, so a denied user gets a `403` with a code instead of a misleading `503`.
- `server/helpers/errors.js` / `server/services/auth.service.js` — `ForbiddenError` gained an optional machine code; `POST /api/user/login` for an unconfirmed email returns `403` with `error.code = 'EMAIL_CONFIRMATION_REQUIRED'` (the real gate unconfirmed users hit — login rejects before any token is issued).
- `src/pages/player.html` — denial UI now switches on the code: «Подписка истекла», «Оплата не прошла», «Подписка требуется», plus the existing «Бесплатный период окончен» and «Подтвердите email».
- `src/pages/login.html` — email-confirmation branch now matches the machine code `EMAIL_CONFIRMATION_REQUIRED` (the old `EMAIL_NOT_CONFIRMED` string check never matched the structured error).
- `docs/API.md`, `docs/openapi.yaml` — code table + contract guarantees (no video path/Stripe internals leaked; access-before-provider; login code).
- Contract tests for each code in `tests/payment.test.js` (8 tests); one existing `past_due` test now asserts `code: 'PAYMENT_PAST_DUE'`.
- Full suite: **924/924 tests, 18 suites**; eslint 0 errors; build passes.

---

## [5.16.0] - 2026-08-01

### Changed — Honest CI quality gate (OPS-002)

Round 9 of the Devil's Advocate audit.

- `.github/workflows/ci.yml` — the gate is now **honest**: removed both `continue-on-error` flags (lint and build no longer silently pass when they fail) and lint now covers the project's real scope (`npm run lint` → `server/ src/ tests/`, not just `server/`). The test step runs the full suite **in randomized order** (`npm run test:ci` → `jest --runInBand --randomize --forceExit`) to prove order-independence, and uses npm scripts as the single source of truth.
- `package.json` — added `test:ci` script (`jest --runInBand --randomize --forceExit`).
- `docs/DEPLOYMENT.md` — CI section rewritten; documents the required-status-check step (branch protection) so a red CI can never be merged.
- Full suite locally: **916/916 tests, 18 suites** (randomized); eslint 0 errors; build passes.

---

## [5.15.0] - 2026-08-01

### Added — Pre-migration backups + DB runbook (DB-001)

Round 8 of the Devil's Advocate audit.

- `server/helpers/migrations.js` — `runMigrations()` now creates a snapshot `data/backups/pre-migration-<ts>.db` (in-memory export) **before** applying any pending schema migration (skipped in `NODE_ENV=test`, where the DB is recreated anyway). `createPreMigrationBackup(db)` exported for tests.
- `docs/DB_RUNBOOK.md` — new: backup/restore procedures, forward-only migration policy (rollback = restore snapshot), migration catalog with per-file data-transform rules (nothing touches `payments`/`payment_events`; `008` copies `subscribers` 1:1), dry-run checklist on a production-like DB copy, and the restore decision owner.
- `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` — cross-linked to the runbook.
- `tests/db.test.js` — +1 test: the pre-migration backup is a valid sql.js snapshot of the current DB (DB-001).
- Full suite: **916/916 tests, 18 suites**; eslint 0 errors.

---

## [5.14.0] - 2026-08-01

### Documentation — Payment Flow, state machine, provider strategy (DOC-001/DOC-002)

Round 7 of the Devil's Advocate audit.

- `docs/API.md` — Payment section rewritten: **subscription state machine** (Stripe→local statuses, access rules), **webhook atomicity + retry semantics** (PAY-002), **period source of truth + never-shrink rule** (PAY-003), Stripe/Mux **configuration table** (required Price IDs, Mux all-or-none), and a **scenario table** for `card_declined`, timeout/provider-unavailable, delayed/repeated webhook, cancel-at-period-end and manual revoke — each with server result, user-facing message, retry rule and the test that covers it.
- `docs/ARCHITECTURE.md` — «Внешние интеграции» gained **Stripe (подписки)** and **Mux (видео)** subsections (provider/recurrence strategy, DOC-002); env-var table updated with the 6 Stripe vars (4 required in prod) and the 4 Mux vars (all-or-none).
- `docs/ADR.md` — **ADR-010**: Subscription State Machine, Atomic Webhook Processing, Period Integrity — records the Round 4–5 decisions, alternatives considered and consequences.
- Docs-only change; no code touched. Test count unchanged: **915/915, 18 suites**.

---

## [5.13.0] - 2026-08-01

### Fixed — Atomic database writes (OPS-001)

Round 6 of the Devil's Advocate audit.

- `server/db.js` — `saveDb()` no longer writes the sql.js export directly to `qigong.db` (a crash mid-write could truncate/corrupt the file in place). It now writes to a temp file in the same directory and atomically renames it over the real DB; the last good file always survives, and a failed write cleans up the temp file.
- `tests/db.test.js` — new suite (3 tests): temp-file-then-rename is used, a saved DB round-trips through a reload, and a simulated failed write keeps the previous DB intact with no temp litter.
- Full suite: **915/915 tests, 18 suites** (order-independent, verified with `jest --randomize`); eslint 0 errors.

---

## [5.12.0] - 2026-08-01

### Fixed — Paid-period integrity (PAY-003), failed-payment plan, honest production config

Round 5 of the Devil's Advocate audit.

- `server/services/payment.service.js` — **PAY-003**: `customer.subscription.updated` (active) now treats Stripe `current_period_end` as the source of truth but **never shrinks already-paid time** — a late/delayed event reporting an earlier period end leaves the existing `subscription_expires_at` intact. The local plan-duration expiry in `checkout.session.completed` is explicitly marked as a temporary fallback (authoritative value arrives with the follow-up `subscription.updated` event).
- `server/services/payment.service.js` — `invoice.payment_failed` no longer hard-codes `plan = 'monthly'` in the recorded payment: it now stores the subscriber's actual plan.
- `server/helpers/config.js` — **honest production config**: `STRIPE_MONTHLY_PRICE_ID` and `STRIPE_ANNUAL_PRICE_ID` added to `REQUIRED_IN_PRODUCTION` (a production deploy without them cannot create a checkout). Mux keys are optional but now validated **all-or-none** (`MUX_ACCESS_TOKEN_ID/SECRET`, `MUX_SIGNING_KEY_ID/SIGNING_KEY`): a partial set is an error in production (silently breaks only some video paths) and a warning in development.
- `tests/payment.test.js` — 3 new tests (PAY-003: never-shrink guard, later `current_period_end` extends, payment_failed records the real plan).
- `tests/config.test.js` — 3 new tests (production without Price IDs rejected, partial Mux credentials rejected, complete Mux set accepted).
- Full suite: **912/912 tests, 17 suites**; eslint 0 errors.

---



### Fixed — Subscription state machine (PAY-001) + atomic webhook processing (PAY-002)

Round 4 of the Devil's Advocate audit (`AUDIT_REPORT_2026-08-01.md`), starting from the P0 chain in `docs/IMPROVEMENT_TZ.md`.

- `server/services/payment.service.js` — **atomic webhook (PAY-002)**: event record, payment/subscription changes and audit now run in one `BEGIN…COMMIT` (with `ROLLBACK` on failure). A failed event leaves no `payment_events` row, so Stripe's retry reprocesses it cleanly; two identical concurrent events produce exactly one business effect. Sub-handlers are synchronous — no `await` inside the critical section, so concurrent webhooks cannot interleave or nest transactions.
- `server/services/payment.service.js` — **state machine (PAY-001)**: documented `STRIPE_STATUS_TO_LOCAL` map — `active→active`, `trialing→trial`, `past_due→past_due`, `unpaid→past_due` (no unconditional `expired`), `canceled→cancelled` (access kept until expiry, not killed). Unknown Stripe statuses never change access. A Stripe `active` event restores local status and re-syncs `subscription_expires_at`/`next_billing_date` from `current_period_end`.
- `server/services/payment.service.js` — `invoice.payment_failed` now moves an `active` subscriber to `past_due` (access is blocked by the `can-watch`/`stream-token` gate); cancelled/expired subscribers are untouched.
- `server/migrations/008_subscription_state.sql` — recreates `subscribers` so the `status` CHECK includes `'past_due'` (SQLite cannot alter a CHECK). All 16 columns preserved, data copied 1:1, subscribers indexes restored.
- `server/helpers/migrations.js` — migration runner disables `PRAGMA foreign_keys` for the duration of each migration (so `DROP TABLE` doesn't cascade into referencing rows) and re-enables it afterwards.
- `tests/payment.test.js` — 11 new tests: PAY-002 (failed event retryable, retry completes, concurrent duplicates → one effect) and PAY-001 (past_due/unpaid/canceled/trialing/active transitions, unrecognized status no-op, past_due blocked at `/can-watch`, `invoice.payment_failed` → `past_due`).
- Full suite: **906/906 tests, 17 suites**; eslint 0 errors.

---

### Changed — Video uploads: Mux-first direct upload (Cloudflare disk-upload removed)
- `server/index.js`:
  - **Removed** `POST /api/admin/lessons/:id/video/upload` and `POST /api/admin/lessons/:id/video/migrate` plus the multer video disk-storage config (`videoStorage`/`videoFilter`/`uploadVideo`, 4 GB limit). No more video files on the server.
  - **Added** `POST /api/admin/lessons/:id/video/mux-upload` — creates a Mux direct upload via `createMuxDirectUpload()`, inserts a `video_uploads` row (`provider='mux'`, `mux_upload_id`, `status='uploading'`), returns `{ id, url }` so the browser PUTs the file straight to Mux. 400 when Mux tokens are not configured.
  - `GET /api/admin/video-uploads/:id/status` is now **provider-aware**: returns `provider`, `cf_video_uid`, `mux_upload_id`, `mux_asset_id`, `mux_playback_id`, `error_message`; for Mux uploads still `uploading` it polls the Mux API — on `asset_created` fetches the asset and flips the row to `ready` with asset/playback ids, on `errored` records the message.
  - `DELETE /api/admin/lessons/:id/video` now preserves the lesson's own `video_provider` (no longer hard-codes `cloudflare`).
  - Lessons CRUD field list now includes `video_provider`; `GET /api/lessons` returns `video_provider`; `lesson_media` POST/PUT accept `video_provider`.
  - **Added** `POST /api/admin/settings/test-mux` — reports `{ configured, signing, upload }` (signing keys present / access token present).
- `server/migrations/007_mux_uploads.sql` — `video_uploads` gains `provider TEXT DEFAULT 'cloudflare'`, `mux_upload_id`, `mux_asset_id`, `mux_playback_id`.
- `server/services/stream.js` — added `getMuxUploadStatus(uploadId)` (polls `/uploads/:id`, returns `{ status, assetId, errorMessage }`).
- `src/admin/lessons.html` — new «Хостинг» select (Cloudflare/Mux), field relabelled to «Видео ID (плеер)», provider saved with the lesson and with localized `lesson_media`.
- `src/admin/js/stream-upload.js` — Mux-first: requests a direct-upload URL, PUTs the file to Mux with progress, polls status, then fills «Видео ID» with the Mux playback ID and switches provider to `mux`. «Migrate to Cloudflare» button removed.
- `src/admin/settings.html` — new **Mux (видео — платные уроки)** card with 4 fields (`mux_signing_key_id`, `mux_signing_key`, `mux_access_token_id`, `mux_access_token_secret`), «Сохранить Mux» and «Проверить» buttons wired to `/api/settings` and `/api/settings/test-mux`.
- `tests/admin-video-uploads.test.js` — reworked to the Mux flow: not-configured/missing-lesson/invalid-id, direct-upload creation (stubbed Mux API) writes `provider='mux'`, provider-aware status shape, Mux `uploading → ready` flow storing asset/playback ids, delete preserves provider; new `test-mux` endpoint tests (unconfigured / configured).
- Full suite: **895/895 tests, 17 suites**; eslint 0 errors.

---

## [5.10.3] - 2026-07-31

### Added — Admin video upload/migrate for Cloudflare Stream + native-app playback guidance
- `server/index.js` — admin video endpoints (all admin-gated):
  - `POST /api/admin/lessons/:id/video/upload` — multipart (`video` file + `language`), multer disk storage (`uploads/videos/`, 4 GB limit, video-ext filter), creates `video_uploads` row, uploads to Cloudflare in background, then status-polls until ready.
  - `POST /api/admin/lessons/:id/video/migrate` — takes a lesson's self-hosted `video_url` file and uploads it to Cloudflare (path-traversal-safe via `path.resolve` check; records old UID in `replaces_uid` for version restoration).
  - `GET /api/admin/video-uploads/:id/status` — `{ status, cf_video_uid, error_message }` for the admin polling UI.
  - `DELETE /api/admin/lessons/:id/video` — unlinks video (clears `cf_video_uid`/`video_url` on lesson + lesson_media; does NOT delete from Cloudflare, matching §29 version-restore rule).
  - `LIMIT_FILE_SIZE` multer errors now return 413 via the global error handler.
- `server/services/stream.js` — `processReadyVideo` now sets `video_provider = 'cloudflare'` on `lesson_media` and `lessons`; `signMuxPlaybackId` default expiry raised 900s → 21600s (6h) so a signed Mux HLS URL survives a full lesson on native players (client plays are often >15 min; player should still silently re-fetch the stream token on a 403).
- `src/admin/js/stream-upload.js` — Cloudflare-only WIP frontend now matches real endpoints (upload/migrate/delete/poll status).
- `tests/admin-video-uploads.test.js` — 13 tests (auth/role guards, upload not-configured/missing-lesson/invalid-id, migrate not-configured/no-local-video/missing-file, status shape, delete/unlink, `processReadyVideo` provider bookkeeping).
- **Native-app guidance recorded** (PROGRESS.md / EXTERNAL_SERVICES_PLAN.md): App Store "Reader Apps" (3.1.3a) — sell subscriptions on the web via Stripe, app only logs in and plays (Netflix model; no Apple IAP/commission). Player: iOS `AVPlayer`, Android `ExoPlayer/Media3` (play Mux signed HLS natively; do NOT use hls.js in a webview for production); Capacitor/PWA first, native players later for offline/AirPlay/Chromecast. No DRM for MVP — signed URLs + subscription gate suffice.
- Full suite: **894/894 tests, 17 suites**; eslint 0 errors.

---

## [5.10.2] - 2026-07-31

### Changed — Video providers: self-hosted free lessons (no YouTube) + Mux for paid
- **Decision (client-approved concern):** free lessons are served from the project's own server at 720p — NOT via YouTube embed. YouTube ads are uncontrollable (even on non-monetized channels YouTube may place ads; viewer view-count is irrelevant), and ads are a churn risk for the senior audience. YouTube stays a marketing channel only.
- Free-lesson self-hosting already worked end-to-end (`/videos/*` route with range requests + stream-scoped JWT + `video_url`); added `server/scripts/encode-720p.js` (ffmpeg wrapper: 720p, H.264 ~2.5 Mbps, AAC, `+faststart`) and updated `videos/README.md`.
- `server/migrations/006_video_provider.sql` — `video_provider` column on `lessons` and `lesson_media` (default `cloudflare`; values `cloudflare` | `mux` | `local`).
- `server/services/stream.js` — Mux provider: `isMuxConfigured`, `signMuxPlaybackId` (HS256 JWT, `sub`=playback_id, `kid` header), `getMuxStreamUrl`, `createMuxDirectUpload`, `getMuxAssetDetails`, `deleteMuxAsset` (fetch-based, no SDK).
- `server/routes/user.js` — `/stream-token` dispatches by provider: `mux` → signed Mux HLS URL; `cloudflare` → existing signed CF URL; guard passes if either provider is configured.
- `server/index.js` — Mux settings keys added to `ALLOWED_SETTINGS_KEYS`; `.env.example` documents the 4 Mux env vars.
- `tests/stream-mux.test.js` — 11 tests (schema, Mux signing/URL, provider dispatch). Full suite green.

---

## [5.10.1] - 2026-07-31

### Changed — Monetization prep: settings-driven price recording
- `server/services/payment.service.js` — `createCheckoutSession` now records the payment amount from admin settings (`monthly_price`/`annual_price`) via new `getPlanAmount()`, falling back to `PLAN_AMOUNTS` (12/89). Admin can set subscription prices manually (existing admin settings UI → `/plans` + payment records follow).
- `tests/payment.test.js` — added tests: plans reflect manually set price; `getPlanAmount` falls back to defaults. 42/42 payment tests pass.
- Currency stays USD (client decision). Cost model for price covering site expenses (Mux/hosting/email/Stripe fees + development fund ≈ $81/mo fixed+fund; breakeven ~8 monthly or ~12 annual subscribers at $12/$89) recorded in PROGRESS.md Option E.

---

## [5.10.0] - 2026-07-30

### Fixed — Security Hardening Round 4

#### P1-1: Stream-Scoped JWT for Video Streaming
- **Before:** Main 24h JWT accepted via `?token=` in `/videos/*` URL — leakage via logs, Referer, CDN
- **After:** `/videos/*` rejects tokens without `scope: 'stream'` claim
- `server/routes/user.js` — `stream-token/:lessonId` endpoint now returns `videoAccessToken` (15min, scope:stream, subscriberId, lessonId)
- `server/index.js` — `/videos/*` verifies `scope === 'stream'`, compares `decoded.lessonId` against DB lesson, uses `decoded.subscriberId` for access checks
- `src/pages/player.html` — uses `videoAccessToken` from stream-token response instead of `localStorage.getItem('user_token')` (main JWT)

#### P1-2: Rate Limiting on /api/user/*
- `globalLimiter` no longer skips `/api/user` (was completely unrated)
- `server/routes/user.js` — added `userApiLimiter` (120/min) applied to all user routes except those with stricter limits
- Added `confirmLimiter` (10/min) for `GET /confirm/:token` (no auth required, token-guessing vector)

#### P1-3: Stripe Config Validation
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` added to `REQUIRED_IN_PRODUCTION` — server won't start without them in production

#### P2-4: Dead Code Removal
- `server/services/schedule.service.js` — removed entirely (`getPersonalTimeline()` referenced nonexistent columns `day_of_week` and `title`, always returned empty result silently)
- Working calendar logic lives inline in `server/routes/user.js`

#### P2-5: user.js Service Layer Audit
- PROGRESS.md updated with accurate per-route audit of all 27 routes vs service layer
- `schedule.service.js` removed from architecture diagram

#### P2-6: Fixed pages.test.js Retention Test
- Now checks `expect(html).toMatch(/не будем предлагать[^.]*скидк/i)` — verifies actual negative statement, not just word presence

#### P2-7: Fixed backend.test.js Conditional Tests
- "admin can reply to ticket" and "admin can update ticket status" now create their own ticket in `beforeAll` — no longer silently skip expectations when DB state doesn't contain tickets

#### P3-8: Devil's Advocate audit round 3 (bootstrap + test infra)
- Removed hard-coded production administrator credentials. A new production database now requires `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` (minimum 12 characters).
- Added configuration tests, a secret-free `.env.example`, and required Render bootstrap variables.
- Repaired the ESLint environment configuration so `npm run lint` completes without errors.
- `server/auth.js` — `JWT_SECRET` now resolved dynamically via `getJwtSecret()` (reads `process.env.JWT_SECRET` at call time instead of module load)
- `jest.config.js` — added `setupFiles: ['./tests/setup.js']`; `tests/setup.js` sets test env vars before any module loads
- `tests/regression.test.js`, `tests/payment.test.js` — `require('../server/index')` moved into `beforeAll` after env vars are set
- `server/routes/user.js` — `stream-token/:lessonId` returns 503 when Cloudflare Stream is not configured (was 200 with `streamUrl: null`)
- Zombie Node.js process cleanup — killed stale listener on port 3001 that was returning 401 to integration tests
- CHANGELOG — added missing v5.7.0 (payment) and v5.8.0 (i18n) entries

#### Tests Added (v5.10.0)
- `tests/security.test.js` — 7 stream-scoped JWT tests: no token → 401, main JWT rejected (header + query), valid `scope:stream` token → 200, wrong lesson → 403, wrong scope → 403, expired → 401
- `tests/ratelimit.test.js` (new suite, port 3007) — verifies `RATE_LIMIT_MAX_USER_API`/`RATE_LIMIT_MAX_CONFIRM` env overrides return 429 when exceeded; all `/api/user/*` routes covered by `userApiLimiter`
- `tests/config.test.js` — Stripe config tests: production refuses to start without both `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, rejects partial config
- `tests/backend.test.js` — asserts `server/services/schedule.service.js` no longer exists (P2-4)
- Order-dependence eliminated across all 15 suites (verified with `jest --randomize`): merged stateful test flows into self-contained tests (ratelimit, e2e Scenario 1/6/7, security GDPR/confirmation/versioning, backend user-auth/me, i18n DB defaults, payment grant/revoke)

### Stats
- 868/868 tests passing (15 suites)
- Версия: 5.9.0 → 5.10.0

---

## [5.9.0] - 2026-07-29

### Fixed — Comprehensive Audit: API Response Unwrap + Frontend Bug Fixes

#### Systemic Fix: Paginated Response Unwrap
- **Root cause:** All CRUD endpoints return `{data: [...], pagination: {...}}` but frontend code treated responses as raw arrays
- `src/admin/js/api.js` — `api()` now auto-unwraps `{data, pagination}` → array for all admin pages
- `src/pages/lessons.html` — same unwrap pattern + removed `admin_token` fallback (security)
- `src/pages/player.html` — unwrap for lessons/schedule arrays
- `src/pages/faq.html` — unwrap FAQ paginated response before `.map()`
- `src/index.html` — unwrap reviews and FAQ responses on landing page
- `src/pages/profile.html` — unwrap feedback tickets + removed duplicate language API call

#### Frontend Bug Fixes
- `src/pages/dashboard.html` — progress percentage: `position_seconds / (duration * 60)` (was `/ duration / 60` — duration in minutes, position in seconds)
- `src/pages/onboarding.html` — `arr.indexOf(value)` instead of `arr.indexOf(step.value)` (step object has no `.value`)

#### Test Fix
- `tests/regression.test.js` — PORT changed from 3003 → 3006 (was colliding with e2e.test.js)

### Stats
- 863/863 tests passing (13 suites)
- Версия: 5.8.0 → 5.9.0

---

## [5.8.0] - 2026-07-29

### Added — i18n Internationalization

#### Multi-Language UI
- `src/locales/ru.json`, `src/locales/en.json` — translation files for Russian and English
- `src/js/i18n.js` — frontend i18n module with language detection, storage, and DOM translation
- `src/js/main.js` — i18n init + language switcher dropdown
- `src/styles/main.css` — language dropdown CSS
- `server/routes/i18n.js` — `GET /api/i18n/:lang` endpoint serving locale files
- IP-based language detection via ip-api.com (RU/BY/KZ/UA/UZ/KG/TJ/MD/AM/AZ/TM/GE → ru, else → en)

#### Multi-Language Video Tracks (lesson_media)
- `lesson_media` table — alternative video tracks per lesson per language
- `server/migrations/003_i18n_lesson_media.sql` — DB migration
- `server/routes/user.js` — `stream-token/:lessonId` returns `videoLanguage` and `isOriginal` flags
- Frontend player displays language note when showing original audio for non-Russian users

#### Device Fingerprint Fix
- Fingerprint computed fresh from device attributes at registration and login
- No localStorage caching for fingerprints

### Stats
- 840/840 tests passing (12 suites)
- Версия: 5.7.0 → 5.8.0

---

## [5.7.0] - 2026-07-28

### Added — Payment Module (Stripe Recurring)

#### Stripe Integration
- `server/routes/payment.js` — subscription checkout, cancellation, webhook handling
- `server/services/payment.service.js` — Stripe API client, session creation, event handling
- `server/db.js` — `payments` and `payment_events` tables via migration 002
- `POST /api/payment/create-checkout-session` — creates Stripe Checkout Session (monthly $12/yr or annual $89/yr)
- `POST /api/webhook` — Stripe webhook with signature verification, idempotency via payment_events table
- Webhook handler is BEFORE `express.json()` global middleware (uses `express.raw()`)

#### Subscription Management
- Auto-renewal via Stripe subscription model
- Cancellation: Stripe subscription cancel + continue access until period end
- `manual_access_grants` table — admin override for subscriber access
- `server/migrations/002_payment_module.sql` — schema migration

#### Admin Panel Updates
- Admin can view/manage subscriber subscriptions
- Manual access grant functionality
- Transaction history viewing

### Stats
- 800/800 tests passing (11 suites)
- Версия: 5.6.0 → 5.7.0

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
