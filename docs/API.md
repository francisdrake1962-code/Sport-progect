# API документация — Qigong Platform

> **Версия API:** `v1`  
> **Дата:** 2026-07-27  
> **Базовый URL:** `http://localhost:3001/api`

---

## Содержание

1. [Обзор](#1-обзор)
2. [Общие правила](#2-общие-правила)
3. [Аутентификация и авторизация (RBAC)](#3-аутентификация-и-авторизация-rbac)
4. [Цепочка middleware](#4-цепочка-middleware)
5. [Политика CORS](#5-политика-cors)
6. [Коды ошибок](#6-коды-ошибок)
7. [Публичные эндпоинты (Public)](#7-публичные-эндпоинты-public)
8. [Аутентификация (Auth)](#8-аутентификация-auth)
9. [Пользователь (User / Subscriber)](#9-пользователь-user--subscriber)
10. [Админ-панель (Admin)](#10-админ-панель-admin)
11. [Обратная связь (Feedback / Tickets)](#11-обратная-связь-feedback--tickets)
12. [Видеоплеер (Video)](#12-видеоплеер-video)
13. [Сводная таблица всех эндпоинтов](#13-сводная-таблица-всех-эндпоинтов)

---

## 1. Обзор

Qigong Platform — REST API для платформы онлайн-занятий цигун. Сервер построен на Express.js (Node.js), данные хранятся в SQLite (WAL mode), аутентификация — JWT (HS256).

### Базовый URL

```
http://<host>:<port>/api
```

По умолчанию: `http://localhost:3001/api`.

### Аутентификация

Все защищённые эндпоинты требуют заголовок:

```
Authorization: Bearer <JWT-token>
```

Токен выдаётся при входе (`POST /api/auth/login` или `POST /api/user/login`). Срок жизни — **24 часа**. Алгоритм подписи — HS256. Токены могут быть отозваны (revoked) при выходе из системы.

### Версионирование

API поддерживает заголовок версии:

```
X-API-Version: v1
```

- Текущая версия: `v1`
- Поддерживаемые версии: `v1`
- Сервер всегда возвращает заголовки `X-API-Version` и `X-API-Supported` в ответах.
- Если запрошена неподдерживаемая версия — `400`.

---

## 2. Общие правила

### Формат ошибок

Все ошибки возвращаются в едином формате:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Человеко-читаемое описание",
    "details": null,
    "requestId": "uuid-..."
  }
}
```

Коды ошибок (`error.code`):

| Код | Описание |
|-----|----------|
| `VALIDATION_ERROR` | Невалидный ввод |
| `UNAUTHORIZED` | Не авторизован |
| `FORBIDDEN` | Нет прав |
| `NOT_FOUND` | Ресурс не найден |
| `CONFLICT` | Конфликт (дубликат) |
| `RATE_LIMITED` | Превышен лимит запросов |
| `PAYLOAD_TOO_LARGE` | Тело запроса слишком велико |
| `INTERNAL_ERROR` | Внутренняя ошибка сервера |

### Формат успешных ответов (массовые операции)

```json
{
  "success": true,
  "data": {}
}
```

### Пагинация

Эндпоинты, возвращающие списки, поддерживают пагинацию через query-параметры:

| Параметр | По умолчанию | Описание |
|----------|-------------|----------|
| `page` | `1` | Номер страницы (начиная с 1) |
| `limit` | `20` | Количество элементов на странице |

Ответ содержит объект `pagination`:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Rate Limiting

| Область | Окно | Макс. запросов | Описание |
|---------|------|---------------|----------|
| Глобальный (`/api/*`) | 1 мин | 200 | Пропускает `/api/auth` и `/api/user` |
| Авторизация (register/login) | 1 мин | 15 | Защита от брутфорса |
| Вход админа (`POST /api/auth/login`) | 1 мин | 100 | Защита от брутфорса |
| Повторная отправка подтверждения | 1 мин | 3 | Защита от спама |

При превышении лимита сервер возвращает `429` с заголовками:
- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset`

---

## 3. Аутентификация и авторизация (RBAC)

### Роли

| Роль | Уровень | Описание |
|------|---------|----------|
| `subscriber` | 1 | Подписчик (пользователь) |
| `admin` | 2 | Администратор |
| `super_admin` | 3 | Суперадминистратор |

### Иерархия

Права проверяются по **уровню**: `super_admin (3) > admin (2) > subscriber (1)`.

- `requireRole('admin')` — допускает `admin` и `super_admin`.
- `requireRole('subscriber')` — допускает все три роли.
- `requireRole('super_admin')` — допускает только `super_admin`.

### JWT Payload

```json
{
  "id": 1,
  "email": "user@example.com",
  "role": "subscriber",
  "jti": "uuid-v4",
  "iat": 1700000000,
  "exp": 1700086400
}
```

---

## 4. Цепочка middleware

Запрос проходит через следующую цепочку middleware (в порядке выполнения):

```
apiVersion -> requestId -> requestLogger -> globalLimiter -> [authMiddleware] -> [requireAdmin/requireRole] -> [validateBody] -> handler
```

| # | Middleware | Описание |
|---|-----------|----------|
| 1 | `apiVersionMiddleware` | Проверяет `X-API-Version`, устанавливает заголовки ответа |
| 2 | `requestIdMiddleware` | Генерирует уникальный `requestId` для каждого запроса |
| 3 | `requestLogger` | Логирует method, path, статус, время |
| 4 | `globalLimiter` | Глобальный rate limiter (200 req/min для `/api/*`) |
| 5 | `authMiddleware` | Проверяет JWT токен в `Authorization: Bearer ...` |
| 6 | `requireAdmin` / `requireRole` | Проверяет роль пользователя |
| 7 | `validateBody` | Валидация тела запроса по JSON-схеме |
| 8 | `requireDangerousActionConfirmation` | Требует `X-Confirm-Action: true` для опасных операций |

---

## 5. Политика CORS

В продакшене разрешённые источники задаются переменной окружения:

```
ALLOWED_ORIGIN=https://example.com,https://admin.example.com
```

- Формат: запятая-separated список доменов.
- В dev/тестовом режиме (`NODE_ENV !== 'production'`) CORS принимает **любой** origin.
- `credentials: true` — разрешены куки и Authorization-заголовки.
- `maxAge: 86400` — preflight кэшируется 24 часа.

---

## 6. Коды ошибок

| HTTP | Код | Описание | Пример |
|------|-----|----------|--------|
| `400` | `VALIDATION_ERROR` | Невалидный ввод, неверный формат данных | Невалидный email, пустое имя |
| `401` | `UNAUTHORIZED` | Токен отсутствует, невалидён или отозван | Нет заголовка `Authorization` |
| `403` | `FORBIDDEN` | Недостаточно прав (role < required) | Subscriber вызывает admin-эндпоинт |
| `404` | `NOT_FOUND` | Ресурс не найден | Несуществующий урок, тикет |
| `409` | `CONFLICT` | Дубликат ресурса | Email уже зарегистрирован |
| `413` | `PAYLOAD_TOO_LARGE` | Тело запроса > 1 MB | Слишком большой JSON |
| `428` | (без кода) | Требуется подтверждение | DELETE без `X-Confirm-Action: true` |
| `429` | `RATE_LIMITED` | Превышен лимит запросов | Больше 15 попыток входа в минуту |
| `500` | `INTERNAL_ERROR` | Внутренняя ошибка сервера | Unexpected exception |
| `503` | (базовый) | Сервис недоступен | База данных не отвечает |

---

## 7. Публичные эндпоинты (Public)

Эндпоинты доступны без аутентификации.

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/health` | Health-check (БД + сервер) |
| GET | `/api/ready` | Readiness-check (после старта) |
| GET | `/api/lessons` | Список активных уроков (пагинация) |
| GET | `/api/lessons/:id` | Урок по ID |
| GET | `/api/lessons/featured` | Избранные уроки (с изображениями) |
| GET | `/api/lessons/:id/complex` | Комплекс, содержащий урок |
| GET | `/api/complexes` | Список комплексов (пагинация) |
| GET | `/api/complexes/:id` | Комплекс по ID (с уроками) |
| GET | `/api/lesson-zones/:lessonId` | Зоны тела урока |
| GET | `/api/schedule` | Расписание занятий (пагинация) |
| GET | `/api/reviews` | Отзывы (пагинация) |
| GET | `/api/faq` | FAQ (пагинация) |
| GET | `/api/user/stats` | Агрегированная статистика |

### GET /api/health

Health-check эндпоинт. Проверяет доступность БД.

**Ответ (200):**
```json
{ "status": "ok", "db": "ok", "timestamp": 1700000000000 }
```

**Ответ (503):**
```json
{ "status": "error", "db": "error", "timestamp": 1700000000000 }
```

### GET /api/ready

Readiness-check. Возвращает 503 до момента полной инициализации сервера.

**Ответ (200):**
```json
{ "status": "ready", "timestamp": 1700000000000 }
```

### GET /api/lessons

Список активных уроков с пагинацией.

**Query-параметры:** `page`, `limit`

**Ответ (200):**
```json
{
  "data": [
    {
      "id": 1,
      "title": "Утренняя разминка шеи",
      "duration": 27,
      "status": "active",
      "description": "...",
      "video_url": "/videos/filename.mp4",
      "cf_video_uid": "...",
      "image_url": "...",
      "is_free": 1,
      "free_order": 1,
      "date": "2026-07-21",
      "tags": "[\"шея\",\"осанка\"]",
      "direction": "суставная_разминка",
      "effect_description": "..."
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 10, "totalPages": 1 }
}
```

### GET /api/lessons/featured

Избранные уроки (с изображениями). Возвращает массив (без пагинации).

**Query-параметры:** `limit` (по умолчанию 10)

### GET /api/complexes

Список комплексов. Включает `lesson_count` (количество уроков в комплексе).

### GET /api/complexes/:id

Комплекс по ID. Включает вложенный массив `lessons` с позициями.

### GET /api/faq

FAQ. Отсортировано по `sort_order`. Возвращает: `id`, `question`, `answer`, `sort_order`.

---

## 8. Аутентификация (Auth)

### Admin Auth — `/api/auth`

| Метод | Путь | Auth | Роль | Описание |
|-------|------|------|------|----------|
| POST | `/api/auth/login` | Нет | — | Вход администратора |
| GET | `/api/auth/me` | JWT | admin | Текущий профиль админа |
| PUT | `/api/auth/password` | JWT | admin | Смена пароля админа |
| POST | `/api/auth/logout` | JWT | admin | Выход (отзыв токена) |

#### POST /api/auth/login

Вход в админ-панель.

**Body (JSON):**
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

**Валидация:** `email` — обязателен, строка, до 255 символов. `password` — обязателен, строка, до 128 символов.

**Ответ (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "admin": {
    "id": 1,
    "email": "admin@example.com",
    "role": "admin",
    "name": "Admin"
  }
}
```

**Ошибки:** `429` — слишком много попыток входа.

#### GET /api/auth/me

Получение профиля текущего администратора.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):** Объект с данными администратора (id, email, name, role).

#### PUT /api/auth/password

Смена пароля администратора.

**Body (JSON):**
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword456"
}
```

**Валидация:** `currentPassword` — обязателен, до 128 символов. `newPassword` — обязателен, минимум 8 символов, до 128.

**Ответ (200):** `{ "success": true }`

#### POST /api/auth/logout

Выход из системы. Текущий токен добавляется в blocklist.

**Ответ (200):** `{ "success": true }`

---

## 9. Пользователь (User / Subscriber)

Все маршруты подключены через `/api/user`.

| Метод | Путь | Auth | Роль | Описание |
|-------|------|------|------|----------|
| POST | `/api/user/register` | Нет | — | Регистрация нового подписчика |
| POST | `/api/user/login` | Нет | — | Вход подписчика |
| POST | `/api/user/logout` | JWT | subscriber | Выход подписчика |
| GET | `/api/user/me` | JWT | subscriber | Профиль подписчика с прогрессом |
| PUT | `/api/user/me` | JWT | subscriber | Обновление профиля |
| GET | `/api/user/confirm/:token` | Нет | — | Подтверждение email (HTML) |
| POST | `/api/user/confirm/:token` | Нет | — | Подтверждение email (JSON) |
| POST | `/api/user/confirm/resend` | Нет | — | Повторная отправка подтверждения |
| GET | `/api/user/data-export` | JWT | subscriber | Экспорт данных (GDPR) |
| DELETE | `/api/user/account` | JWT | subscriber | Анонимизация и удаление аккаунта |
| POST | `/api/user/fingerprint` | JWT | subscriber | Отправка отпечатка устройства |
| GET | `/api/user/recommendations` | JWT | subscriber | Персональные рекомендации |
| GET | `/api/user/stats` | Нет | — | Агрегированная статистика |
| POST | `/api/user/watch-progress` | JWT | subscriber | Сохранение прогресса просмотра |
| GET | `/api/user/progress` | JWT | subscriber | Список просмотренных уроков |
| GET | `/api/user/progress/:lessonId` | JWT | subscriber | Прогресс конкретного урока |
| GET | `/api/user/can-watch/:lessonId` | JWT | subscriber | Проверка доступа к уроку |
| GET | `/api/user/stream-token/:lessonId` | JWT | subscriber | Токен Cloudflare Stream |
| GET | `/api/user/calendar` | JWT | subscriber | Персональный календарь |
| GET | `/api/user/lessons-filter` | JWT | subscriber | Фильтрация уроков |
| GET | `/api/user/onboarding` | JWT | subscriber | Получение предпочтений |
| POST | `/api/user/onboarding` | JWT | subscriber | Сохранение предпочтений |
| GET | `/api/user/categories` | JWT | subscriber | Категории зон и направлений |
| POST | `/api/user/workout-feedback` | JWT | subscriber | Отправка отзыва по уроку |
| GET | `/api/user/workout-feedback` | JWT | subscriber | Список отзывов по урокам |
| GET | `/api/user/workout-feedback/:lessonId` | JWT | subscriber | Отзыв по конкретному уроку |
| GET | `/api/user/dashboard` | JWT | subscriber | Дашборд пользователя |
| GET | `/api/user/free-selections` | JWT | subscriber | Текущие бесплатные выборы |
| POST | `/api/user/free-selections` | JWT | subscriber | Выбор бесплатных уроков (trial) |

#### POST /api/user/register

Регистрация нового подписчика. Отправляет email для подтверждения.

**Body (JSON):**
```json
{
  "name": "Иван Иванов",
  "email": "ivan@example.com",
  "password": "password123"
}
```

**Валидация:** `name` — обязателен, 1-100 символов. `email` — обязателен, валидный формат, до 255 символов. `password` — обязателен, минимум 8 символов, до 128.

**Ответ (201):**
```json
{ "message": "Проверьте почту для подтверждения регистрации" }
```

**Ошибки:**
- `409` — Email уже зарегистрирован.
- `429` — Слишком много регистраций.

#### POST /api/user/login

Вход подписчика.

**Body (JSON):**
```json
{
  "email": "ivan@example.com",
  "password": "password123"
}
```

**Ответ (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "subscriber_id": 1,
  "name": "Иван Иванов",
  "email": "ivan@example.com",
  "plan": "trial",
  "status": "active",
  "email_confirmed": true
}
```

**Ошибки:**
- `400` — Неверный email или пароль.
- `403` — Email не подтверждён.

#### GET /api/user/me

Получение профиля текущего подписчика с прогрессом и настройками.

**Ответ (200):** Объект подписчика (id, name, email, plan, status, free_sessions_used, subscription_started_at, onboarding_completed и др.).

#### PUT /api/user/me

Обновление имени и/или пароля. Если передан `new_password`, текущий токен отзывается.

**Body (JSON):**
```json
{
  "name": "Новое Имя",
  "current_password": "oldPassword",
  "new_password": "newPassword123"
}
```

**Ответ (200):** Обновлённый профиль.

#### POST /api/user/confirm/:token

API-вариант подтверждения email (возвращает JSON).

**Ответ (200):** `{ "success": true }`

**Ответ (400):** `{ "error": "Invalid or expired confirmation token" }`

#### DELETE /api/user/account

Анонимизация и удаление аккаунта. **Опасная операция.**

**Обязательный заголовок:** `X-Confirm-Action: true`

**Ответ (428) без заголовка:**
```json
{
  "error": "Confirmation required",
  "message": "Dangerous action requires confirmation",
  "header": "X-Confirm-Action: true"
}
```

**Ответ (200):**
```json
{ "success": true, "message": "Account anonymized and deleted" }
```

Данные анонимизируются: имя -> `Deleted User`, email -> `deleted_<id>@anonymized.local`, plan -> `deleted`, status -> `deleted`. Связанные данные (preferences, fingerprints, watched_lessons, feedback) удаляются. Текущий JWT отзывается.

#### POST /api/user/fingerprint

Отправка отпечатка устройства для обнаружения abuse.

**Body (JSON):**
```json
{ "fingerprint": "device-hash-string" }
```

**Ответ (200):**
```json
{ "success": true, "accountsFromThisDevice": 2 }
```

#### GET /api/user/recommendations

Персональные рекомендации уроков.

**Query-параметры:**
- `limit` — максимум рекомендаций (по умолчанию 5, макс. 20)
- `exclude_watched` — исключать просмотренные (по умолчанию `true`)

**Ответ (200):**
```json
{
  "recommendations": [
    { "id": 3, "title": "Баланс и координация", "duration": 29, "score": 0.95, "reason": "highly_rated" }
  ]
}
```

#### GET /api/user/data-export

Экспорт всех данных пользователя (GDPR).

**Ответ (200):**
```json
{
  "export_date": "2026-07-27T12:00:00.000Z",
  "profile": { "id": 1, "email": "...", "name": "..." },
  "watched_lessons": [],
  "workout_feedback": [],
  "tickets": [],
  "free_lesson_selections": [],
  "preferences": {}
}
```

---

## 10. Админ-панель (Admin)

Все эндпоинты в `/api/*` (не `/api/auth/` и `/api/user/`) требуют JWT + роль `admin` (или `super_admin`).

### Health

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/health/detailed` | Детальный health-check (память, БД, counts) |

### CRUD операции (generic)

CRUD-эндпоинты генерируются автоматически для каждой таблицы. Все поддерживают:
- `GET /` — список с пагинацией
- `GET /:id` — получение по ID
- `POST /` — создание
- `PUT /:id` — обновление
- `DELETE /:id` — удаление

| Ресурс | Путь | Поля (create/update) |
|--------|------|----------------------|
| Уроки | `/api/lessons` | title, duration, status, description, video_url, cf_video_uid, image_url, is_free, free_order, date, tags, direction, direction_source, effect_description, effect_is_draft |
| Комплексы | `/api/complexes` | name, description, image_url, status |
| Подписчики | `/api/subscribers` | name, email, plan, status, email_confirmed, free_sessions_used, subscription_started_at, next_billing_date |
| Отзывы | `/api/reviews` | author, text, rating, status, date |
| FAQ | `/api/faq` | question, answer, sort_order |
| Промокоды | `/api/promo-codes` | code, discount, max_uses, current_uses, active |
| Транзакции | `/api/transactions` | subscriber_id, type, amount, status, date |
| Уведомления | `/api/notifications` | title, type, text, recipients, sent_at |
| Пользователи | `/api/users` | email, name, role |
| Просм. уроки | `/api/watched-lessons` | subscriber_id, lesson_id, position_seconds, completed |

**Пример POST /api/lessons:**
```json
{
  "title": "Новое занятие",
  "duration": 30,
  "status": "active",
  "description": "Описание занятия",
  "video_url": "/videos/file.mp4",
  "is_free": 0,
  "date": "2026-07-27"
}
```

**Ответ (201):** Созданный объект с `id`.

**Пример PUT /api/lessons/5:**
```json
{ "title": "Обновлённое название", "status": "draft" }
```

**Ответ (200):** Обновлённый объект.

### Зоны уроков

| Метод | Путь | Описание |
|-------|------|----------|
| PUT | `/api/lessons/:id/zones` | Обновить зоны тела урока |

**Body:**
```json
{ "zones": ["шея", "плечи_руки", "поясница"] }
```

Допустимые зоны: `шея`, `поясница`, `грудной_отдел`, `колени`, `ноги_таз`, `спина_осанка`, `плечи_руки`, `баланс_общее`.

### Расписание (Admin)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/schedule` | Создать запись |
| PUT | `/api/schedule/:id` | Обновить запись |
| DELETE | `/api/schedule/:id` | Удалить запись |

**Body (POST/PUT):**
```json
{
  "date": "2026-07-27",
  "theme": "Шея и плечи",
  "complex_id": 1,
  "lesson_id": 3
}
```

Формат даты: `YYYY-MM-DD`. Уникальность по дате (`409` при дубликате).

### Связь комплекс-уроки (Complex Lessons)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/complex-lessons` | Список связей (пагинация) |
| POST | `/api/complex-lessons` | Добавить урок в комплекс |
| PUT | `/api/complex-lessons/:key` | Обновить позицию (key = `cid_lid`) |
| DELETE | `/api/complex-lessons/:key` | Удалить связь |

**Body (POST):**
```json
{ "complex_id": 1, "lesson_id": 5, "position": 2 }
```

### Настройки (Settings)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/settings` | Получить все настройки |
| PUT | `/api/settings` | Массовое обновление настроек |
| POST | `/api/settings` | Обновление одной/нескольких |
| POST | `/api/settings/test-email` | Тест отправки email |
| POST | `/api/settings/test-stream` | Тест Cloudflare Stream |

Допустимые ключи настроек:
`app_name`, `domain`, `logo_url`, `theme_color`, `contact_email`, `support_email`, `phone`, `address`, `social_vk`, `social_telegram`, `trial_days`, `annual_price`, `monthly_price`, `trainer_photo_mode`, `trainer_photo_url`, `trainer_photos`, `trainer_photo_interval`, `promo_discount`, `promo_code`, `promo_expiry_hours`, `mail_provider`, `gmail_user`, `gmail_app_password`, `email_from`, `cf_stream_signing_key_id`, `cf_stream_signing_key`, `cf_stream_customer_code`.

**Body (PUT) — массовое:**
```json
{ "app_name": "Qigong Pro", "trial_days": 7 }
```

**Body (POST) — одиночное:**
```json
{ "key": "app_name", "value": "Qigong Pro" }
```

### Дашборд и аналитика

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/dashboard` | Сводка для админ-дашборда |
| GET | `/api/admin/analytics/dashboard` | Аналитический дашборд |
| GET | `/api/admin/analytics/stats` | Статистика событий |
| GET | `/api/admin/analytics/timeline` | Таймлайн событий |
| GET | `/api/admin/analytics/user/:userId` | Активность пользователя |

**GET /api/admin/analytics/dashboard?days=30** — Возвращает: totalEvents, eventsByName, topEntities, uniqueUsers, timeline.

**GET /api/admin/analytics/stats?start_date=2026-07-01&end_date=2026-07-31&event_name=lesson_completed&entity=lessons&group_by=day**

**GET /api/admin/analytics/timeline?days=30&event_name=lesson_completed**

**GET /api/admin/analytics/user/:userId?limit=50**

### Рекомендации (Admin)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/admin/recommendations/:subscriberId` | Рекомендации для подписчика |

**Query:** `limit` (по умолчанию 5, макс. 20)

### Аудит-логи

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/admin/audit-logs` | Журнал действий |

**Query-параметры:**
- `entity` — фильтр по сущности (lessons, tickets, settings и др.)
- `user_id` — фильтр по пользователю
- `action` — фильтр по типу (create, update, delete, backup, restore, reply)
- `page`, `limit` — пагинация

### Загрузка файлов

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/upload` | Загрузка изображения (multipart/form-data) |
| POST | `/api/upload-trainer-photo` | Загрузка фото тренера (base64) |

**POST /api/upload:**
- Форма: `multipart/form-data`
- Поле: `file`
- Query: `type=general` (подпапка в `uploads/`)
- Допустимые форматы: .jpg, .jpeg, .png, .webp, .gif
- Максимум: 5 MB

**Ответ (200):** `{ "success": true, "url": "/uploads/general/1700000000_abc123.jpg" }`

**POST /api/upload-trainer-photo:**
```json
{ "filename": "photo.jpg", "data": "<base64-encoded-image>" }
```

**Ответ (200):** `{ "success": true, "url": "/images/trainers/trainer_1700000000.jpg" }`

### Управление версиями контента

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/admin/lessons/:id/version` | Создать версию урока |
| GET | `/api/admin/lessons/:id/versions` | Список версий |
| GET | `/api/admin/lessons/:id/versions/:version` | Детали версии |
| POST | `/api/admin/lessons/:id/restore/:version` | Восстановить версию |
| GET | `/api/admin/lessons/:id/compare` | Сравнение двух версий |

**POST /api/admin/lessons/:id/version:**
```json
{ "change_summary": "Обновлено описание" }
```

**GET /api/admin/lessons/:id/compare?a=1&b=2** — Сравнение версий `a` и `b`.

### Backup / Restore

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/admin/backup` | Создать бэкап БД |
| POST | `/api/admin/restore` | Восстановить БД из бэкапа |

**POST /api/admin/backup — Ответ (200):**
```json
{
  "success": true,
  "path": "/path/to/data/backups/qigong-2026-07-27T12-00-00.db",
  "size_bytes": 1048576
}
```

**POST /api/admin/restore:**
```json
{ "backup_path": "/path/to/data/backups/qigong-2026-07-27T12-00-00.db" }
```

Восстановление возможно **только** из директории `data/backups/`. Путь проверяется на соответствие (защита от path traversal).

---

## 11. Обратная связь (Feedback / Tickets)

Система тикетов поддерживает создание, просмотр и переписку между подписчиками и администраторами.

### Subscriber — `/api/feedback`

| Метод | Путь | Auth | Роль | Описание |
|-------|------|------|------|----------|
| POST | `/api/feedback` | JWT | subscriber | Создать тикет |
| GET | `/api/feedback` | JWT | subscriber | Мои тикеты (пагинация) |
| GET | `/api/feedback/:id` | JWT | subscriber | Тикет с сообщениями |
| POST | `/api/feedback/:id/reply` | JWT | subscriber | Ответить в тикет |

#### POST /api/feedback

Создание нового тикета.

**Body (JSON):**
```json
{
  "category": "technical",
  "subject": "Видео не загружается",
  "message": "При попытке воспроизвести видео на iPhone появляется ошибка..."
}
```

Допустимые категории: `trainer`, `technical`, `admin`.

**Ответ (200):** `{ "success": true, "ticketId": 42 }`

**Ошибки:** `400` — `category`, `subject`, `message` обязательны.

#### GET /api/feedback (subscriber)

Список тикетов текущего подписчика.

**Ответ (200):**
```json
{
  "data": [
    {
      "id": 42,
      "category": "technical",
      "subject": "Видео не загружается",
      "status": "open",
      "created_at": "2026-07-27T12:00:00.000Z",
      "subscriber_id": 1
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

#### POST /api/feedback/:id/reply (subscriber)

Ответ подписчика в тикет. Максимальная длина сообщения: 5000 символов.

**Body:** `{ "message": "Дополнительная информация..." }`

### Admin — `/api/admin/feedback`

| Метод | Путь | Auth | Роль | Описание |
|-------|------|------|------|----------|
| GET | `/api/admin/feedback` | JWT | admin | Все тикеты (фильтры + пагинация) |
| GET | `/api/admin/feedback/:id` | JWT | admin | Тикет с сообщениями |
| PUT | `/api/admin/feedback/:id` | JWT | admin | Обновить статус / назначить |
| POST | `/api/admin/feedback/:id/reply` | JWT | admin | Ответ администратора |

#### GET /api/admin/feedback

**Query-параметры:**
- `category` — фильтр по категории
- `status` — фильтр (`open`, `in_progress`, `resolved`, `closed`)
- `page`, `limit` — пагинация

**Ответ (200):** Список тикетов с полями `subscriber_name`, `subscriber_email`, `last_message`, `message_count`.

#### PUT /api/admin/feedback/:id

Обновление статуса и/или назначение исполнителя.

**Body:**
```json
{ "status": "in_progress", "assigned_to": "admin_name" }
```

Допустимые статусы: `open`, `in_progress`, `resolved`, `closed`.

При ответе администратора (POST /reply) статус автоматически меняется на `in_progress`, если был `open`.

---

## 12. Видеоплеер (Video)

### GET /videos/:filename

Потоковая передача видеофайлов с поддержкой Range-запросов.

**Аутентификация:** Требуется JWT-токен (через `Authorization: Bearer ...` **или** query-параметр `?token=...`).

**Проверки доступа:**
1. Если роль `subscriber`:
   - Файл должен быть привязан к уроку (по полю `video_url`).
   - Если урок `is_free = 0` и план `trial`: проверяется лимит бесплатных сессий (7 уроков).

**Поддержка Range-заголовка (HTTP 206):**

Запрос:
```
Range: bytes=0-1048575
```

Ответ (206):
```
Content-Range: bytes 0-1048575/5242880
Accept-Ranges: bytes
Content-Length: 1048576
Content-Type: video/mp4
```

**Защита от path traversal:** Путь файла проверяется на соответствие директории `videos/`.

**Ошибки:**
- `401` — Токен отсутствует или невалиден.
- `403` — Видео не привязано к уроку или лимит исчерпан.
- `404` — Файл не найден.
- `416` — Невалидный диапазон (Range not satisfiable).

---

## 13. Сводная таблица всех эндпоинтов

| # | Метод | Путь | Auth | Роль | Описание |
|---|-------|------|------|------|----------|
| 1 | GET | `/api/health` | Нет | — | Health-check |
| 2 | GET | `/api/ready` | Нет | — | Readiness-check |
| 3 | GET | `/api/health/detailed` | JWT | admin | Детальный health-check |
| 4 | GET | `/api/lessons` | Нет | — | Список активных уроков |
| 5 | GET | `/api/lessons/:id` | Нет | — | Урок по ID |
| 6 | GET | `/api/lessons/featured` | Нет | — | Избранные уроки |
| 7 | GET | `/api/lessons/:id/complex` | Нет | — | Комплекс урока |
| 8 | GET | `/api/complexes` | Нет | — | Список комплексов |
| 9 | GET | `/api/complexes/:id` | Нет | — | Комплекс по ID |
| 10 | GET | `/api/lesson-zones/:lessonId` | Нет | — | Зоны тела урока |
| 11 | GET | `/api/schedule` | Нет | — | Расписание |
| 12 | GET | `/api/reviews` | Нет | — | Отзывы |
| 13 | GET | `/api/faq` | Нет | — | FAQ |
| 14 | GET | `/api/user/stats` | Нет | — | Статистика |
| 15 | POST | `/api/auth/login` | Нет | — | Вход админа |
| 16 | GET | `/api/auth/me` | JWT | admin | Профиль админа |
| 17 | PUT | `/api/auth/password` | JWT | admin | Смена пароля админа |
| 18 | POST | `/api/auth/logout` | JWT | admin | Выход админа |
| 19 | POST | `/api/user/register` | Нет | — | Регистрация |
| 20 | POST | `/api/user/login` | Нет | — | Вход подписчика |
| 21 | POST | `/api/user/logout` | JWT | subscriber | Выход подписчика |
| 22 | GET | `/api/user/me` | JWT | subscriber | Профиль подписчика |
| 23 | PUT | `/api/user/me` | JWT | subscriber | Обновление профиля |
| 24 | GET | `/api/user/confirm/:token` | Нет | — | Подтверждение email (HTML) |
| 25 | POST | `/api/user/confirm/:token` | Нет | — | Подтверждение email (JSON) |
| 26 | POST | `/api/user/confirm/resend` | Нет | — | Повторное подтверждение |
| 27 | GET | `/api/user/data-export` | JWT | subscriber | Экспорт данных (GDPR) |
| 28 | DELETE | `/api/user/account` | JWT | subscriber | Удаление аккаунта |
| 29 | POST | `/api/user/fingerprint` | JWT | subscriber | Отпечаток устройства |
| 30 | GET | `/api/user/recommendations` | JWT | subscriber | Рекомендации уроков |
| 31 | POST | `/api/user/watch-progress` | JWT | subscriber | Сохранение прогресса |
| 32 | GET | `/api/user/progress` | JWT | subscriber | История просмотров |
| 33 | GET | `/api/user/progress/:lessonId` | JWT | subscriber | Прогресс урока |
| 34 | GET | `/api/user/can-watch/:lessonId` | JWT | subscriber | Проверка доступа |
| 35 | GET | `/api/user/stream-token/:lessonId` | JWT | subscriber | Токен Cloudflare Stream |
| 36 | GET | `/api/user/calendar` | JWT | subscriber | Календарь занятий |
| 37 | GET | `/api/user/lessons-filter` | JWT | subscriber | Фильтрация уроков |
| 38 | GET | `/api/user/onboarding` | JWT | subscriber | Получение предпочтений |
| 39 | POST | `/api/user/onboarding` | JWT | subscriber | Сохранение предпочтений |
| 40 | GET | `/api/user/categories` | JWT | subscriber | Категории зон/направлений |
| 41 | POST | `/api/user/workout-feedback` | JWT | subscriber | Отзыв по уроку |
| 42 | GET | `/api/user/workout-feedback` | JWT | subscriber | Список отзывов |
| 43 | GET | `/api/user/workout-feedback/:lessonId` | JWT | subscriber | Отзыв по уроку |
| 44 | GET | `/api/user/dashboard` | JWT | subscriber | Дашборд |
| 45 | GET | `/api/user/free-selections` | JWT | subscriber | Бесплатные выборы |
| 46 | POST | `/api/user/free-selections` | JWT | subscriber | Установить выборы |
| 47 | GET | `/api/dashboard` | JWT | admin | Админ-дашборд |
| 48 | GET | `/api/admin/analytics/dashboard` | JWT | admin | Аналитический дашборд |
| 49 | GET | `/api/admin/analytics/stats` | JWT | admin | Статистика событий |
| 50 | GET | `/api/admin/analytics/timeline` | JWT | admin | Таймлайн событий |
| 51 | GET | `/api/admin/analytics/user/:userId` | JWT | admin | Активность пользователя |
| 52 | GET | `/api/admin/recommendations/:sid` | JWT | admin | Рекомендации для подписчика |
| 53 | GET | `/api/admin/audit-logs` | JWT | admin | Журнал аудита |
| 54 | GET | `/api/admin/feedback` | JWT | admin | Все тикеты |
| 55 | GET | `/api/admin/feedback/:id` | JWT | admin | Тикет с сообщениями |
| 56 | PUT | `/api/admin/feedback/:id` | JWT | admin | Обновить тикет |
| 57 | POST | `/api/admin/feedback/:id/reply` | JWT | admin | Ответ в тикет |
| 58 | POST | `/api/admin/lessons/:id/version` | JWT | admin | Создать версию |
| 59 | GET | `/api/admin/lessons/:id/versions` | JWT | admin | Версии урока |
| 60 | GET | `/api/admin/lessons/:id/versions/:v` | JWT | admin | Детали версии |
| 61 | POST | `/api/admin/lessons/:id/restore/:v` | JWT | admin | Восстановить версию |
| 62 | GET | `/api/admin/lessons/:id/compare` | JWT | admin | Сравнение версий (a, b) |
| 63 | POST | `/api/admin/backup` | JWT | admin | Бэкап БД |
| 64 | POST | `/api/admin/restore` | JWT | admin | Восстановление БД |
| 65 | POST | `/api/upload` | JWT | admin | Загрузка изображения |
| 66 | POST | `/api/upload-trainer-photo` | JWT | admin | Загрузка фото тренера |
| 67 | GET | `/api/feedback` | JWT | subscriber | Мои тикеты |
| 68 | POST | `/api/feedback` | JWT | subscriber | Создать тикет |
| 69 | GET | `/api/feedback/:id` | JWT | subscriber | Тикет с сообщениями |
| 70 | POST | `/api/feedback/:id/reply` | JWT | subscriber | Ответить в тикет |
| 71 | GET | `/videos/:filename` | JWT | any | Видеопоток (Range + JWT) |

---

## Приложение: переменные окружения

| Переменная | По умолчанию | Описание |
|------------|-------------|----------|
| `PORT` | `3001` | Порт сервера |
| `NODE_ENV` | `development` | Режим (development / production / test) |
| `JWT_SECRET` | (random) | Секрет для подписи JWT |
| `ALLOWED_ORIGIN` | (пусто) | CORS allowlist, через запятую |
| `VIDEOS_DIR` | `./videos` | Директория с видеофайлами |
| `MAIL_PROVIDER` | `console` | Провайдер почты (console / gmail / smtp) |
| `GMAIL_USER` | — | Gmail адрес |
| `GMAIL_APP_PASSWORD` | — | Gmail App Password |
| `EMAIL_FROM` | — | Email отправителя |
| `CF_STREAM_CUSTOMER_CODE` | — | Cloudflare Stream customer code |
| `CF_STREAM_SIGNING_KEY_ID` | — | Cloudflare Stream signing key ID |
| `CF_STREAM_SIGNING_KEY` | — | Cloudflare Stream signing key |
