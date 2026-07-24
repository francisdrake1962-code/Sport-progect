# Changelog

Все заметные изменения проекта «Цигун и суставная разминка».

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
- CSP отключён в Express (нужно вынести inline JS)
- Нет пагинации на CRUD эндпоинтах
- Нет `<noscript>` fallback
- JWT_SECRET генерируется случайно при каждом рестарте
