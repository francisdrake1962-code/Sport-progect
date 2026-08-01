# DB Runbook — Qigong Platform

Дата: 2026-08-01 | Версия: 5.14.0 | Владелец решения о восстановлении: администратор проекта (настройщик `data/qigong.db`).

> См. также: `docs/ARCHITECTURE.md` (схема БД), `docs/DEPLOYMENT.md` (бэкапы), `docs/IMPROVEMENT_TZ.md` (DB-001).

## Общая модель

- База — единый файл SQLite (`data/qigong.db`), в памяти через `sql.js`.
- **Схема создаётся при старте** (`getDb()`: `CREATE TABLE IF NOT EXISTS`).
- **Версионирование схемы** — папка `server/migrations/*.sql`, применяется при старте сервера (`runMigrations()`) в порядке имени файла, отслеживается таблицей `migrations`.
- Платёжные данные, подписки и доступ — только в этой БД. **Нет отдельного сервера БД.**

## Бэкап перед миграцией (DB-001)

Перед применением любых не применённых миграций `runMigrations()` создаёт снапшот:

- путь: `data/backups/pre-migration-<ISO-timestamp>.db`;
- содержимое: экспорт БД **до** изменения схемы;
- журнал: строка `Pre-migration backup created: <path>` в stdout сервера.

В `NODE_ENV=test` снапшоты не создаются (тестовая БД пересоздаётся целиком).

## Восстановление (rollback)

Политика: **миграции forward-only**. Обратных (`down`) миграций нет. Откат выполняется восстановлением бэкапа:

1. Остановить сервер (`SIGTERM`/`SIGINT` — graceful shutdown).
2. `copy data/backups/pre-migration-<timestamp>.db data/qigong.db` (заменить файл).
3. Удалить строки миграций, применённых после снапшота: вручную не нужно — старый бинарник не знает про новые файлы миграций; при необходимости вернуться к конкретному набору миграций — восстановить и строки из таблицы `migrations`, соответствующие тому состоянию.
4. Запустить сервер.

Проверка: `POST /api/admin/backup` создаёт timestamped копию; `POST /api/admin/restore` восстанавливает (с защитой от path traversal). Проверяйте целостность: `node -e "..."` или тестовая загрузка через sql.js.

## Каталог миграций и правила трансформации

| Миграция | Что делает | Обратный путь | Влияние на существующие данные |
|---|---|---|---|
| `001_initial.sql` | базовая схема | forward-only | — |
| `002_*.sql` | расширение таблиц | forward-only | только ADD COLUMN |
| `003_*.sql` | `subscribers` ALTER (preferred_language и др.) | forward-only | только ADD COLUMN; `plan`/`status`/даты доступа не меняются |
| `004_*`–`006_*` | расширение | forward-only | только ADD COLUMN |
| `007_mux_uploads.sql` | `video_uploads` + `provider DEFAULT 'cloudflare'`, `mux_*` | forward-only | существующие записи получают `provider='cloudflare'`, `mux_*` = NULL; **платежи не трогаются** |
| `008_subscription_state.sql` | пересоздание `subscribers` (CHECK включает `'past_due'`) | forward-only (восстановление из бэкапа) | данные копируются 1:1; колонки `plan`/`status`/`subscription_expires_at`/`next_billing_date`/платёжные ссылки сохраняются как есть; статусы `past_due` становятся допустимыми; индексы пересоздаются |

Правила для существующих пользователей (общие):

- `plan` (`trial`/`monthly`/`annual`) — независим от `status`, при миграциях не преобразуется.
- `status` (`trial`/`active`/`past_due`/`cancelled`/`expired`/легаси `inactive`/`suspended`) — не пересчитывается миграциями.
- Даты доступа — UTC; `current_period_end` из Stripe синхронизируется событием `customer.subscription.updated` и **не уменьшает** уже оплаченный срок (PAY-003).
- Платёжные записи (`payments`, `payment_events`) миграциями **не удаляются и не изменяются**.

## Проверка миграций на production-like БД (dry-run)

1. Скопировать production-файл: `copy data/qigong.db data/qigong.dryrun.db`.
2. Прогнать старт с копией (временный `DATA_DIR` или локальный запуск) — убедиться, что `runMigrations()` применяет только новые файлы и не падает.
3. Сравнить количество строк `payments`/`subscribers` до и после.
4. Удалить копию.

## Владелец решения о восстановлении

Администратор проекта. Порядок при аварии: `data/backups/` → восстановить → проверить `payments` и `subscribers` → сообщить о случившемся (аудит-лог/тикет). Сервер сам никогда не удаляет бэкапы — чистит вручную владелец.
