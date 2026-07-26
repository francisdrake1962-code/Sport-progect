# Changelog

Все заметные изменения проекта «Цигун и суставная разминка».

---

## [4.1.0] - 2026-07-26

### Fixed — Адвокат дьявола, Раунд 1 (28 исправлений)

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
