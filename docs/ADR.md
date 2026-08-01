# ADR-001: SQLite via sql.js for Data Storage

## Статус
Принято

## Контекст
Нужно хранилище данных для платформы онлайн-занятий. Требования: простота деплоя, zero-config, отдельный процесс, файловый формат.

## Решение
SQLite через `sql.js` (WebAssembly port) с WAL mode.

## Аргументы

**За:**
- Единый файл `data/qigong.db`, не нужен отдельный сервер
- sql.js работает в любом окружении (Node.js, браузер, Edge)
- `PRAGMA foreign_keys = ON` обеспечивает целостность данных
- saveDb() с 300ms debounce для batch записей
- transaction() helper для атомарных операций

**Против:**
- Не горизонтально масштабируется (один writer)
- Нет replication из коробки
- sql.js загружает весь DB в память

**Альтернативы:**
- PostgreSQL — перебор для текущего масштаба
- better-sqlite3 — нет WASM, сложнее деплой
- LevelDB — нет SQL

## Последствия
- Для горизонтального масштабирования потребуется миграция на PostgreSQL
- Текущий лимит: ~10k активных пользователей без деградации
- Бэкапы = копирование одного файла

---

# ADR-002: JWT (HS256) for Authentication

## Статус
Принято

## Контекст
Нужна stateless аутентификация для API + клиентских приложений.

## Решение
JWT с HS256 (HMAC-SHA256), токены через `Authorization: Bearer` header.

## Аргументы

**За:**
- Stateless: сервер не хранит сессии
- Алгоритм зафиксирован: `algorithms: ['HS256']` — защита от algorithm confusion
- Токены могут быть отозваны через `token_blocklist` (SQLite)
- 24 часа TTL, с индексом на `expires_at` для автоочистки

**Против:**
- Не могу отозвать токен мгновенно (токен живёт до истечения)
- Secret management — критичен для безопасности

**Последствия:**
- `cleanupBlocklist()` запускается периодически для удаления истёкших
- При смене пароля токен блокируется (GDPR)
- JWT secret обязателен в production

---

# ADR-003: sql.js over better-sqlite3

## Статус
Принято

## Контекст
Нужна SQLite-библиотека для Node.js.

## Решение
sql.js (WebAssembly) вместо better-sqlite3 (native addon).

## Аргументы

**За:**
- Не требует node-gyp/compilation при установке
- Работает на любом CPU/ОС без native bindings
- Тестируемо в Jest без проблем с нативными модулями
- Портативность: можно переносить DB между средами

**Против:**
- Медленнее (~2-3x) для тяжёлых запросов
- Весь DB загружается в RAM
- Нет WAL mode из коробки (sql.js использует свой механизм)

**Последствия:**
- При масштабировании > 10k пользователей — миграция на better-sqlite3 или PostgreSQL
- Текущий размер DB seed: ~1MB, room для роста

---

# ADR-004: RBAC with Role Hierarchy

## Статус
Принято

## Контекст
Нужна ролевая модель для контроля доступа: подписчики, админы, супер-админы.

## Решение
3 роли с иерархией: `subscriber(1)` < `admin(2)` < `super_admin(3)`. Middleware `requireRole()` проверяет минимальную роль.

## Аргументы

**За:**
- Иерархия: `requireAdmin()` автоматически включает `subscriber`
- Простая модель — 3 роли покрывают все use-cases
- CHECK constraints в DB: `CHECK(role IN ('subscriber', 'admin', 'super_admin'))`
- `role` column default = `subscriber` при регистрации

**Против:**
- Нет granular permissions (например, "только создание уроков")
- Иерархия жёсткая — нельзя дать admin'у subset прав без новой роли

**Последствия:**
- Если понадобятся细粒о permissions — добавить permissions table

---

# ADR-005: Subscription Model — Free + Paid

## Статус
Принято

## Контекст
Бизнес-модель: привлечь через бесплатный контент, конвертировать в подписку.

## Решение
3 плана: `trial` (бесплатно, 7 уроков) → `annual` (89₽/год) → `monthly` (12₽/месяц).

## АргUMENTы

**За:**
- Trial без банковской карты — низкий барьер входа
- 7 бесплатных уроков — достаточно для оценки контента
- Anti-abuse: fingerprint + IP + atomic transactions
- Free selections через `free_lesson_selections` (max 7, CHECK constraint)

**Против:**
- Нет payment gateway (упрощение по требованию)
- Нет промо-кодов для пробного периода (только для оплаты)

**Последствия:**
- При добавлении платежей — интеграция с YooKassa/Stripe
- Promo codes уже поддерживаются на уровне API

---

# ADR-006: Content Versioning for Lessons

## Статус
Принято

## Контекст
Админы редактируют уроки. Нужна история изменений и возможность отката.

## Решение
Таблица `lesson_versions` с полным снапшотом урока при каждом изменении.

## Аргументы

**За:**
- `createVersion()` автоматически вызывается при CRUD update
- `restoreVersion()` использует `transaction()` для атомарного отката
- Сравнение версий через `compareVersions()`
- `ON DELETE CASCADE`: при удалении урока версии тоже удаляются

**Против:**
- Полные снапшоты — много данных при частых изменениях
- Нет diff-based хранения

**Последствия:**
- При большом объёме — добавить архивацию старых версий
- Аудит лог `audit_log` дополняет версионирование

---

# ADR-007: Security Hardening (Helmet, CORS, Rate Limiting)

## Статус
Принято

## Контекст
Платформа открыта в интернете. Нужна базовая защита от атак.

## Решение
Defense-in-depth: Helmet (CSP, HSTS, X-Frame-Options), CORS multi-origin, rate limiting.

## Компоненты

| Защита | Реализация |
|---|---|
| HSTS | `maxAge: 31536000, includeSubDomains, preload` |
| CSP | `self + unsafe-inline + cdn.jsdelivr.net` |
| X-Frame-Options | `SAMEORIGIN` |
| X-Content-Type-Options | `nosniff` |
| CORS | Multi-origin via `ALLOWED_ORIGIN` env |
| Rate Limiting | Global: 100/15min, Auth: 10/15min |
| Path Traversal | Video path validation, `..` blocked |
| SQL Injection | Parameterized queries throughout |
| XSS | `esc()` function on client + helmet CSP |
| JWT Security | Algorithm pinned to HS256 |
| API Versioning | `X-API-Version` header middleware |

**Известные ограничения:**
- CSP `unsafe-inline` необходим для inline scripts в текущей архитектуре
- При переходе на bundler — перейти на nonces/hashes

---

# ADR-008: E2E Testing Architecture

## Статус
Принято

## Контекст
Нужны интеграционные тесты, покрывающие реальные HTTP-запросы к запущенному серверу.

## Решение
Собственный E2E фреймворк на `http.request` с реальным сервером.

## Аргументы

**За:**
- Тестирует реальные HTTP ответы (status, body, headers)
- Один сервер на выделенном порту (3003) для изоляции
- `resetDb()` перед каждым запуском — чистое состояние
- 10 сценариев: registration → login → lessons → feedback → calendar → admin CRUD → RBAC → IDOR → video access

**Против:**
- Нет browser-level тестов (не проверяет JS клиент)
- Нет parallel execution (один сервер на порту)
- Нет retry/wait для async операций

**Последствия:**
- Для browser тестов — добавить Playwright/Cypress
- Тесты чувствительны к порядку (кэш токенов)

---

# ADR-009: Single-Binary Deployment

## Статус
Принято

## Контекст
Нужен простой деплой без оркестрации контейнеров.

## Решение
Node.js процесс + SQLite файл. Без Docker, без Kubernetes.

## Аргументы

**За:**
- `npm install && node server/index.js` — всё
- Нет зависимости от Docker registry
- Graceful shutdown через SIGTERM/SIGINT
- Автозапуск через systemd

**Против:**
- Нет изоляции (shared system libraries)
- Scaling manual
- Rollback = downgrade + restart

**Последствия:**
- При росте трафика — миграция на Docker + PostgreSQL
- CI/CD уже готов (GitHub Actions)

---

# ADR-010: Subscription State Machine, Atomic Webhook Processing, Period Integrity

## Статус
Принято (v5.11.0–v5.12.0, Devil's Advocate Rounds 4–5)

## Контекст
Stripe recurring-подписки, webhook-обработка и хранение `subscription_expires_at` были хрупкими: событие фиксировалось до бизнес-эффекта (retry был невозможен), `unpaid`/`canceled` неправильно убивали доступ, `past_due` не обрабатывался, а локальная оценка срока могла уменьшить уже оплаченное время.

## Решение

**PAY-002 — атомарный webhook.** Событие, изменения подписки/платежа и аудит выполняются в одной транзакции `BEGIN…COMMIT` (откат через `ROLLBACK` при ошибке). Обработчики синхронные — нет `await` между `BEGIN` и `COMMIT`, поэтому параллельные вебхуки не пересекаются и не вкладывают транзакции. Идемпотентность — по `event_id` в `payment_events`.

**PAY-001 — машина состояний.** `STRIPE_STATUS_TO_LOCAL`: `active→active`, `trialing→trial`, `past_due→past_due`, `unpaid→past_due`, `canceled→cancelled`, `paused` не маппится (доступ сохраняется моделью active+expiry), неизвестные статусы — no-op. `invoice.payment_failed` переводит `active` в `past_due`; `subscribers.status` CHECK расширен до `past_due` (миграция 008, пересоздание таблицы).

**PAY-003 — источник истины периода.** Авторитет — Stripe `current_period_end` из `customer.subscription.updated`; локальная оценка `now + duration` в `checkout.session.completed` — явно помеченный временный fallback. Правило целостности: **оплаченное время никогда не уменьшается** — `subscription.updated` с более ранним `current_period_end`, чем уже записанный срок, оставляет существующий срок.

## Аргументы

**За:**
- Отказ webhook больше не оставляет «обработанное» событие без эффекта — Stripe retry корректен
- Доступ подписчика соответствует фактическому состоянию платежа (должник не смотрит платный контент)
- Guard против поздних/повторных событий не отбирает оплаченное время (соответствует ТЗ)
- Атомарная запись БД (OPS-001): temp file + rename — крах при записи не повреждает `qigong.db`

**Против:**
- SQLite — один writer, транзакции сериализуются
- Пересоздание таблицы для изменения CHECK требует аккуратной миграции (foreign_keys OFF)

**Альтернативы:**
- Мягкая блокировка «grace period» для `past_due` — отложено, нет в ТЗ
- `expired` безусловно при `unpaid` — отклонено (терял оплаченный trial/период)

## Последствия
- Гейт доступа (`can-watch`/`stream-token`) — единственное место проверки платного доступа
- Новые Stripe-статусы добавляются только через явный маппинг
- Для production обязательны Price ID (`STRIPE_MONTHLY_PRICE_ID`/`STRIPE_ANNUAL_PRICE_ID`); Mux-ключи — all-or-none
