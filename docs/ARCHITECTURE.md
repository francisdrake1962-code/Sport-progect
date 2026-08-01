# ARCHITECTURE.md — Проект «Цигун и суставная разминка»

## Обзор системы

Проект «Цигун и суставная разминка» — это платформа для онлайн-занятий цигун и суставной разминкой. Пользователи (подписчики) могут просматривать видеоуроки, отслеживать прогресс, получать персональные рекомендации и пользоваться расписанием занятий. Администраторы управляют контентом, подписчиками и настройками через админ-панель.

**Ключевые возможности:**
- Каталог видеоуроков с фильтрацией по зонам тела, настроению и длительности
- Персональное расписание и календарь занятий
- Система подписок: бесплатный пробный период (7 уроков), Stripe ежемесячная и годовая подписки с автопродлением
- Обратная связь (тикеты) между подписчиками и администрацией
- Рекомендательная система на основе предпочтений и настроения
- Версионирование контента уроков
- Аудит всех действий администраторов
- Аналитика использования платформы

---

## Архитектурные слои

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                           │
│           (SPA: /dist, /dist/admin)                    │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / REST API
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   Express Server                        │
│              (server/index.js)                          │
├─────────────────────────────────────────────────────────┤
│  Middlewares:                                            │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ │
│  │helmet/CSP│ │  CORS    │ │ rateLimit │ │ requestId│ │
│  └──────────┘ └──────────┘ └───────────┘ └──────────┘ │
│  ┌───────────┐ ┌────────────┐ ┌──────────────────────┐ │
│  │apiVersion │ │  logging   │ │   RBAC (3 роли)      │ │
│  └───────────┘ └────────────┘ └──────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐                     │
│  │ validation   │ │ confirmation │                     │
│  └──────────────┘ └──────────────┘                     │
├─────────────────────────────────────────────────────────┤
│                      Routes                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────────┐ │
│  │  auth.js │ │  user.js │ │payment.js│ │  crud.js (generic)  │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────────────────┘ │
│  Inline routes в index.js (уроки, расписание, настройки)│
│  Feedback router (тикеты)                               │
├─────────────────────────────────────────────────────────┤
│                     Services                            │
│  ┌──────────────────┐ ┌───────────────────┐ ┌───────────────┐  │
│  │ auth.service.js  │ │analytics.svc.js   │ │feedback.svc   │  │
│  │ progress.svc.js  │ │dashboard.svc.js   │ │recommendation │  │
│  │ content-ver.svc  │ │schedule.svc.js    │ │  mailer.js    │  │
│  │ audit.svc.js     │ │stream.js          │ │payment.svc.js │  │
│  └──────────────────┘ └───────────────────┘ └───────────────┘  │
├─────────────────────────────────────────────────────────┤
│                   Repositories                          │
│  ┌───────────────────┐ ┌─────────────────────────────┐  │
│  │ BaseRepository    │ │  LessonRepository           │  │
│  │ SubscriberRepo    │ │  ComplexRepository          │  │
│  │ SettingsRepo      │ │  UserRepository / FaqRepo   │  │
│  │ ReviewRepo        │ │                             │  │
│  └───────────────────┘ └─────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                     Helpers                             │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐  │
│  │ errors  │ │ logger  │ │pagination│ │ db-utils   │  │
│  │ config  │ │migrations│ │          │ │            │  │
│  └─────────┘ └─────────┘ └──────────┘ └────────────┘  │
├─────────────────────────────────────────────────────────┤
│                  Database (SQLite)                       │
│           sql.js (in-memory + file persistence)         │
│           data/qigong.db                                │
└─────────────────────────────────────────────────────────┘
```

---

## Таблица функциональных контуров

| Функция | Endpoint | Route / Handler | Service | Repository | DB Таблицы |
|---------|----------|----------------|---------|------------|------------|
| **Аутентификация (Admin)** | | | | | |
| Вход админа | `POST /api/auth/login` | `routes/auth.js` | `authService.loginAdmin` | — | `users` |
| Профиль админа | `GET /api/auth/me` | `routes/auth.js` | `authService.getAdminProfile` | — | `users` |
| Выход (revoke) | `POST /api/auth/logout` | `routes/auth.js` | `authService.revokeCurrentToken` | — | `token_blocklist` |
| Смена пароля | `PUT /api/auth/password` | `routes/auth.js` | `authService.changeAdminPassword` | — | `users` |
| **Аутентификация (Subscriber)** | | | | | |
| Регистрация | `POST /api/user/register` | `routes/user.js` | `mailer.sendConfirmationEmail` | — | `subscribers` |
| Вход подписчика | `POST /api/user/login` | `routes/user.js` | `authService.loginSubscriber` | — | `subscribers` |
| Подтверждение email | `GET /api/user/confirm/:token` | `routes/user.js` | — | — | `subscribers` |
| Повторная отправка | `POST /api/user/confirm/resend` | `routes/user.js` | `mailer.sendConfirmationEmail` | — | `subscribers` |
| Выход подписчика | `POST /api/user/logout` | `routes/user.js` | `authService.revokeCurrentToken` | — | `token_blocklist` |
| **Профиль подписчика** | | | | | |
| Мой профиль | `GET /api/user/me` | `routes/user.js` | `progressService.getSubscriberProfile` | — | `subscribers` |
| Обновить профиль | `PUT /api/user/me` | `routes/user.js` | `progressService.updateSubscriberProfile` | — | `subscribers` |
| Удалить аккаунт | `DELETE /api/user/account` | `routes/user.js` | — | — | `subscribers`, `user_preferences`, `device_fingerprints`, `watched_lessons`, `workout_feedback`, `free_lesson_selections`, `tickets` |
| Экспорт данных | `GET /api/user/data-export` | `routes/user.js` | — | — | `subscribers`, `watched_lessons`, `workout_feedback`, `tickets`, `free_lesson_selections`, `user_preferences` |
| **Прогресс и просмотр** | | | | | |
| Сохранить прогресс | `POST /api/user/watch-progress` | `routes/user.js` | `analyticsService.trackEvent` | — | `watched_lessons`, `subscribers` |
| Список прогресса | `GET /api/user/progress` | `routes/user.js` | — | — | `watched_lessons`, `lessons` |
| Прогресс по уроку | `GET /api/user/progress/:lessonId` | `routes/user.js` | — | — | `watched_lessons`, `lessons` |
| Проверка доступа | `GET /api/user/can-watch/:lessonId` | `routes/user.js` | — | — | `subscribers`, `lessons`, `free_lesson_selections` |
| Cloudflare Stream токен | `GET /api/user/stream-token/:lessonId` | `routes/user.js` | `stream.generateSignedToken` | — | `subscribers`, `lessons` |
| **Расписание** | | | | | |
| Календарь | `GET /api/user/calendar` | `routes/user.js` | — | — | `schedule`, `lessons`, `watched_lessons`, `subscribers` |
| Публичное расписание | `GET /api/schedule` | `index.js` (inline) | — | — | `schedule` |
| Создать расписание | `POST /api/schedule` | `index.js` (api) | — | — | `schedule` |
| Обновить расписание | `PUT /api/schedule/:id` | `index.js` (api) | — | — | `schedule` |
| Удалить расписание | `DELETE /api/schedule/:id` | `index.js` (api) | — | — | `schedule` |
| **Уроки (публичные)** | | | | | |
| Список уроков | `GET /api/lessons` | `index.js` (inline) | — | — | `lessons` |
| Урок по ID | `GET /api/lessons/:id` | `index.js` (inline) | — | — | `lessons` |
| Избранные уроки | `GET /api/lessons/featured` | `index.js` (inline) | — | — | `lessons` |
| Комплекс урока | `GET /api/lessons/:id/complex` | `index.js` (inline) | — | — | `complex_lessons`, `complexes` |
| Зоны урока | `GET /api/lesson-zones/:lessonId` | `index.js` (inline) | — | — | `lesson_zones` |
| **Уроки (админ CRUD)** | | | | | |
| CRUD уроков | `GET/POST/PUT/DELETE /api/lessons` | `routes/crud.js` | `analyticsService`, `contentVersionService` | `lessonRepo` | `lessons` |
| Зоны урока (admin) | `PUT /api/lessons/:id/zones` | `index.js` (api) | — | — | `lesson_zones` |
| **Комплексы** | | | | | |
| Список комплексов | `GET /api/complexes` | `index.js` (inline) | — | — | `complexes`, `complex_lessons` |
| Комплекс по ID | `GET /api/complexes/:id` | `index.js` (inline) | — | — | `complexes`, `complex_lessons`, `lessons` |
| CRUD комплексов | `GET/POST/PUT/DELETE /api/complexes` | `routes/crud.js` | — | — | `complexes` |
| Связь комплекс-урок | `GET/POST/PUT/DELETE /api/complex-lessons` | `index.js` (api) | — | `complexRepo` | `complex_lessons` |
| **Фильтрация уроков** | | | | | |
| Уроки с фильтрами | `GET /api/user/lessons-filter` | `routes/user.js` | — | — | `lessons`, `lesson_zones`, `subscribers` |
| Категории | `GET /api/user/categories` | `routes/user.js` | — | — | `lesson_zones`, `lessons` |
| **Рекомендации** | | | | | |
| Рекомендации | `GET /api/user/recommendations` | `routes/user.js` | `recommendationService` | — | `subscribers`, `watched_lessons`, `workout_feedback`, `user_preferences`, `schedule`, `lessons`, `lesson_zones` |
| **Onboarding** | | | | | |
| Получить предпочтения | `GET /api/user/onboarding` | `routes/user.js` | — | — | `user_preferences` |
| Сохранить предпочтения | `POST /api/user/onboarding` | `routes/user.js` | — | — | `user_preferences` |
| **Обратная связь (workout)** | | | | | |
| Оценка тренировки | `POST /api/user/workout-feedback` | `routes/user.js` | `analyticsService.trackEvent` | — | `workout_feedback` |
| История оценок | `GET /api/user/workout-feedback` | `routes/user.js` | — | — | `workout_feedback`, `lessons` |
| Оценка по уроку | `GET /api/user/workout-feedback/:lessonId` | `routes/user.js` | — | — | `workout_feedback` |
| **Тикеты (Subscriber)** | | | | | |
| Создать тикет | `POST /api/feedback` | `feedbackRouter` | `feedbackService.createTicket` | — | `tickets`, `ticket_messages` |
| Мои тикеты | `GET /api/feedback` | `feedbackRouter` | `feedbackService.getSubscriberTickets` | — | `tickets` |
| Тикет по ID | `GET /api/feedback/:id` | `feedbackRouter` | `feedbackService.getTicketById` | — | `tickets`, `ticket_messages` |
| Ответ на тикет | `POST /api/feedback/:id/reply` | `feedbackRouter` | `feedbackService.replyToTicket` | — | `ticket_messages` |
| **Тикеты (Admin)** | | | | | |
| Все тикеты | `GET /api/admin/feedback` | `index.js` (api) | `feedbackService.adminListTickets` | — | `tickets`, `ticket_messages`, `subscribers` |
| Тикет (admin) | `GET /api/admin/feedback/:id` | `index.js` (api) | `feedbackService.adminGetTicketById` | — | `tickets`, `ticket_messages`, `subscribers` |
| Обновить тикет | `PUT /api/admin/feedback/:id` | `index.js` (api) | `feedbackService.adminUpdateTicket` | — | `tickets` |
| Ответ (admin) | `POST /api/admin/feedback/:id/reply` | `index.js` (api) | `feedbackService.replyToTicket` | — | `ticket_messages` |
| **Настройки** | | | | | |
| Все настройки | `GET /api/settings` | `index.js` (api) | — | `settingsRepo` | `settings` |
| Обновить настройки | `PUT /api/settings` | `index.js` (api) | — | `settingsRepo` | `settings` |
| Создать/обновить | `POST /api/settings` | `index.js` (api) | — | `settingsRepo` | `settings` |
| Тест email | `POST /api/settings/test-email` | `index.js` (api) | `mailer.sendConfirmationEmail` | — | — |
| Тест Stream | `POST /api/settings/test-stream` | `index.js` (api) | `stream.isStreamConfigured` | — | — |
| **Дашборд (Admin)** | | | | | |
| Статистика | `GET /api/dashboard` | `index.js` (api) | `dashboardService.getStats` | — | `subscribers`, `lessons`, `reviews`, `transactions`, `tickets` |
| **Аудит (Admin)** | | | | | |
| Логи аудита | `GET /api/admin/audit-logs` | `index.js` (api) | `auditService.getAuditLogs` | — | `audit_log`, `users` |
| **Аналитика (Admin)** | | | | | |
| Аналитический дашборд | `GET /api/admin/analytics/dashboard` | `index.js` (api) | `analyticsService.getDashboard` | — | `analytics_events` |
| Статистика событий | `GET /api/admin/analytics/stats` | `index.js` (api) | `analyticsService.getEventStats` | — | `analytics_events` |
| Таймлайн | `GET /api/admin/analytics/timeline` | `index.js` (api) | `analyticsService.getEventTimeline` | — | `analytics_events` |
| Активность пользователя | `GET /api/admin/analytics/user/:userId` | `index.js` (api) | `analyticsService.getUserActivity` | — | `analytics_events` |
| **Рекомендации (Admin)** | | | | | |
| Рекомендации подписчика | `GET /api/admin/recommendations/:subscriberId` | `index.js` (api) | `recommendationService` | — | `subscribers`, `lessons`, `lesson_zones`, `watched_lessons`, `workout_feedback`, `user_preferences` |
| **Версионирование контента** | | | | | |
| Создать версию | `POST /api/admin/lessons/:id/version` | `index.js` (api) | `contentVersionService.createVersion` | — | `lessons`, `lesson_versions` |
| Список версий | `GET /api/admin/lessons/:id/versions` | `index.js` (api) | `contentVersionService.getVersions` | — | `lesson_versions`, `users` |
| Версия | `GET /api/admin/lessons/:id/versions/:version` | `index.js` (api) | `contentVersionService.getVersion` | — | `lesson_versions`, `users` |
| Восстановление | `POST /api/admin/lessons/:id/restore/:version` | `index.js` (api) | `contentVersionService.restoreVersion` | — | `lessons`, `lesson_versions` |
| Сравнение версий | `GET /api/admin/lessons/:id/compare` | `index.js` (api) | `contentVersionService.compareVersions` | — | `lesson_versions` |
| **Backup / Restore** | | | | | |
| Бэкап БД | `POST /api/admin/backup` | `index.js` (api) | — | — | файловая система |
| Восстановление БД | `POST /api/admin/restore` | `index.js` (api) | — | — | файловая система |
| **Dashboard (Subscriber)** | | | | | |
| Панель подписчика | `GET /api/user/dashboard` | `routes/user.js` | — | — | `subscribers`, `watched_lessons`, `lessons`, `schedule`, `lesson_zones`, `complexes`, `complex_lessons` |
| **Free Lessons** | | | | | |
| Выбранные бесплатные | `GET /api/user/free-selections` | `routes/user.js` | — | — | `free_lesson_selections`, `lessons` |
| Выбрать бесплатные | `POST /api/user/free-selections` | `routes/user.js` | — | — | `free_lesson_selections`, `subscribers` |
| **Device Fingerprint** | | | | | |
| Отправить отпечаток | `POST /api/user/fingerprint` | `routes/user.js` | — | — | `device_fingerprints` |
| **Публичные данные** | | | | | |
| Статистика | `GET /api/user/stats` | `routes/user.js` | — | — | `lessons`, `subscribers` |
| Отзывы | `GET /api/reviews` | `index.js` (inline) | — | — | `reviews` |
| FAQ | `GET /api/faq` | `index.js` (inline) | — | — | `faq` |
| CRUD отзывов | `GET/POST/PUT/DELETE /api/reviews` | `routes/crud.js` | — | — | `reviews` |
| CRUD FAQ | `GET/POST/PUT/DELETE /api/faq` | `routes/crud.js` | — | — | `faq` |
| CRUD промо-кодов | `GET/POST/PUT/DELETE /api/promo-codes` | `routes/crud.js` | — | — | `promo_codes` |
| CRUD транзакций | `GET/POST/PUT/DELETE /api/transactions` | `routes/crud.js` | — | — | `transactions` |
| CRUD уведомлений | `GET/POST/PUT/DELETE /api/notifications` | `routes/crud.js` | — | — | `notifications` |
| CRUD пользователей | `GET/POST/PUT/DELETE /api/users` | `routes/crud.js` | — | — | `users` |
| CRUD просмотров | `GET/POST/PUT/DELETE /api/watched-lessons` | `routes/crud.js` | — | — | `watched_lessons` |
| **Загрузка файлов** | | | | | |
| Загрузка изображений | `POST /api/upload` | `index.js` (api) | multer (diskStorage) | — | файловая система |
| Загрузка фото тренера | `POST /api/upload-trainer-photo` | `index.js` (api) | — | — | файловая система |
| **Серверная доставка видео** | | | | | |
| Потоковая передача | `GET /videos/:filename` | `index.js` | jwt.verify | — | `lessons`, `subscribers` |
| **Оплата (Payment)** | | | | | |
| Планы подписок | `GET /api/payment/plans` | `routes/payment.js` | — | — | `settings` |
| Checkout-сессия | `POST /api/payment/create` | `routes/payment.js` | `paymentService.createCheckoutSession` | — | `subscribers` |
| Статус платежа | `GET /api/payment/status` | `routes/payment.js` | `paymentService.getPaymentStatus` | — | `payments` |
| Статус подписки | `GET /api/payment/subscription` | `routes/payment.js` | `paymentService.getSubscriptionStatus` | — | `subscribers` |
| Отмена подписки | `POST /api/payment/cancel` | `routes/payment.js` | `paymentService.cancelSubscription` | — | `subscribers` |
| Stripe webhook | `POST /api/payment/webhook` | `routes/payment.js` | `paymentService.handleWebhookEvent` | — | `payments`, `subscribers`, `payment_events` |
| Ручные выдачи | `GET /api/payment/admin/grants` | `routes/payment.js` | `paymentService.getAdminGrants` | — | `manual_access_grants` |
| Выдать доступ | `POST /api/payment/admin/grant` | `routes/payment.js` | `paymentService.adminGrantAccess` | — | `manual_access_grants`, `subscribers` |
| Отозвать доступ | `POST /api/payment/admin/revoke` | `routes/payment.js` | `paymentService.adminRevokeAccess` | — | `manual_access_grants`, `subscribers` |
| История платежей | `GET /api/payment/admin/history` | `routes/payment.js` | `paymentService.getPaymentHistory` | — | `payments` |
| **Health / Readiness** | | | | | |
| Health check | `GET /api/health` | `index.js` (inline) | — | — | — |
| Readiness check | `GET /api/ready` | `index.js` (inline) | — | — | — |
| Detailed health | `GET /api/health/detailed` | `index.js` (inline) | — | — | `lessons`, `subscribers`, `tickets` |

---

## Схема базы данных

База данных: **SQLite** (sql.js, in-memory с дампом на диск). Файл: `data/qigong.db`.

### Таблицы и связи

```
┌──────────────────────┐
│        users         │
├──────────────────────┤
│ id (PK, INTEGER)     │
│ email (UNIQUE)       │
│ password (bcrypt)    │
│ name                 │
│ role                 │  subscriber | admin | super_admin
│ created_at           │
└──────────┬───────────┘
           │
           │ Связь через user_id
           ▼
┌──────────────────────┐      ┌──────────────────────┐
│    subscribers       │      │      complexes       │
├──────────────────────┤      ├──────────────────────┤
│ id (PK, INTEGER)     │      │ id (PK, INTEGER)     │
│ name                 │      │ name                 │
│ email (UNIQUE)       │      │ description          │
│ password (bcrypt)    │      │ image_url            │
│ plan                 │      │ status               │
│ status               │      │ created_at           │
│ email_confirmed      │      └──────────┬───────────┘
│ confirmation_token   │                 │
│ free_sessions_used   │      ┌──────────┴───────────┐
│ subscription_started │      │  complex_lessons     │
│ next_billing_date    │      ├──────────────────────┤
│ joined_at            │      │ complex_id (FK→complexes) │
│ subscription_expires_at     │ lesson_id (FK→lessons)    │
│ stripe_customer_id   │      │ position              │
│ stripe_subscription_id│     └──────────┬────────────┘
└──────┬───────────────┘                 │
       │                      │ position              │
       │                      └──────────┬────────────┘
       │                                 │
       │                      ┌──────────┴───────────┐
       │                      │      lessons         │
       │                      ├──────────────────────┤
       │                      │ id (PK, INTEGER)     │
       │                      │ title                │
       │                      │ duration             │
       │                      │ status               │
       │                      │ description          │
       │                      │ video_url            │
       │                      │ cf_video_uid         │
       │                      │ image_url            │
       │                      │ is_free              │
       │                      │ free_order           │
       │                      │ date                 │
       │                      │ tags (JSON)          │
       │                      │ direction            │
       │                      │ direction_source     │
       │                      │ effect_description   │
       │                      │ effect_is_draft      │
       │                      │ created_at           │
       │                      └──────────┬───────────┘
       │                                 │
       │  ┌──────────────────────────────┼──────────────────────┐
       │  │                              │                      │
       │  ▼                              ▼                      ▼
┌──────┴───────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  watched_lessons     │  │   lesson_zones       │  │  lesson_versions     │
├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤
│ id (PK)              │  │ lesson_id (FK→lessons)│  │ id (PK)              │
│ subscriber_id (FK)   │  │ zone (PK)            │  │ lesson_id (FK→lessons)│
│ lesson_id (FK)       │  └──────────────────────┘  │ version              │
│ watched_at           │                             │ title, description...│
│ position_seconds     │  ┌──────────────────────┐  │ changed_by           │
│ completed            │  │  user_preferences    │  │ change_summary       │
└──────────────────────┘  ├──────────────────────┤  │ created_at           │
                          │ subscriber_id (FK,PK)│  └──────────────────────┘
┌──────────────────────┐  │ experience           │
│   free_lesson_       │  │ goals (JSON)         │  ┌──────────────────────┐
│   selections         │  │ preferred_duration   │  │    schedule          │
├──────────────────────┤  │ preferred_time       │  ├──────────────────────┤
│ subscriber_id (FK,PK)│  │ focus_zones (JSON)   │  │ id (PK)              │
│ lesson_id (FK,PK)    │  │ onboarding_completed │  │ date (UNIQUE)        │
│ selected_at          │  │ created_at, updated  │  │ theme                │
└──────────────────────┘  └──────────────────────┘  │ complex_id (FK)      │
                                                    │ lesson_id (FK)       │
┌──────────────────────┐  ┌──────────────────────┐  │ created_at           │
│  device_fingerprints │  │  workout_feedback    │  └──────────────────────┘
├──────────────────────┤  ├──────────────────────┤
│ id (PK)              │  │ id (PK)              │  ┌──────────────────────┐
│ fingerprint          │  │ subscriber_id (FK)   │  │      reviews         │
│ ip_address           │  │ lesson_id (FK)       │  ├──────────────────────┤
│ subscriber_id (FK)   │  │ mood                 │  │ id (PK)              │
│ created_at           │  │ created_at           │  │ author               │
└──────────────────────┘  │ UNIQUE(sub,lesson)   │  │ text                 │
                          └──────────────────────┘  │ rating               │
┌──────────────────────┐                            │ status               │
│      tickets         │  ┌──────────────────────┐  │ date                 │
├──────────────────────┤  │  ticket_messages     │  │ created_at           │
│ id (PK)              │  ├──────────────────────┤  └──────────────────────┘
│ subscriber_id (FK)   │  │ id (PK)              │
│ category             │  │ ticket_id (FK→tickets)│  ┌──────────────────────┐
│ subject              │  │ sender_type          │  │       faq            │
│ status               │  │ sender_id            │  ├──────────────────────┤
│ assigned_to          │  │ message              │  │ id (PK)              │
│ created_at           │  │ created_at           │  │ question             │
└──────────────────────┘  └──────────────────────┘  │ answer               │
                                                    │ sort_order           │
┌──────────────────────┐  ┌──────────────────────┐  │ created_at           │
│    analytics_events  │  │     audit_log        │  └──────────────────────┘
├──────────────────────┤  ├──────────────────────┤
│ id (PK)              │  │ id (PK)              │  ┌──────────────────────┐
│ event_name           │  │ action               │  │    promo_codes       │
│ user_id              │  │ entity               │  ├──────────────────────┤
│ entity               │  │ entity_id            │  │ id (PK)              │
│ entity_id            │  │ user_id              │  │ code (UNIQUE)        │
│ metadata (JSON)      │  │ user_role            │  │ discount             │
│ ip_address           │  │ details (JSON)       │  │ max_uses             │
│ user_agent           │  │ ip_address           │  │ current_uses         │
│ created_at           │  │ created_at           │  │ active               │
└──────────────────────┘  └──────────────────────┘  │ created_at           │
                                                    └──────────────────────┘
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  transactions        │  │   notifications      │  │     settings         │
├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤
│ id (PK)              │  │ id (PK)              │  │ key (PK, TEXT)       │
│ subscriber_id (FK)   │  │ title                │  │ value (TEXT)         │
│ type                 │  │ type                 │  └──────────────────────┘
│ amount               │  │ text                 │
│ status               │  │ recipients           │  ┌──────────────────────┐
│ date                 │  │ sent_at              │  │   token_blocklist    │
│ created_at           │  │ created_at           │  ├──────────────────────┤
└──────────────────────┘  └──────────────────────┘  │ token_hash (PK,TEXT) │
                                                    │ expires_at           │
┌──────────────────────┐                            │ created_at           │
│    exercises         │                            └──────────────────────┘
├──────────────────────┤
│ id (PK)              │  ┌──────────────────────┐
│ name                 │  │    migrations        │
│ zone                 │  ├──────────────────────┤
│ difficulty           │  │ id (PK)              │
│ description          │  │ name (UNIQUE)        │
│ created_at           │  │ applied_at           │
└──────────────────────┘  └──────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│     payments         │  │   payment_events     │  │ manual_access_grants │
├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤
│ id (PK)              │  │ id (PK)              │  │ id (PK)              │
│ subscriber_id (FK)   │  │ event_id (UNIQUE)    │  │ admin_id             │
│ amount               │  │ event_type           │  │ subscriber_id (FK)   │
│ currency             │  │ payload              │  │ action               │
│ status               │  │ processed_at         │  │ reason               │
│ provider             │  └──────────────────────┘  │ expires_at           │
│ provider_checkout_id │                            │ created_at           │
│ provider_payment_id  │                            └──────────────────────┘
│ provider_customer_id │
│ plan                 │
│ paid_at              │
│ failure_reason       │
│ created_at           │
└──────────────────────┘
```

### Индексы

| Таблица | Индекс | Колонки |
|---------|--------|---------|
| `token_blocklist` | `idx_token_blocklist_expires` | `expires_at` |
| `token_blocklist` | `idx_token_blocklist_hash` | `token_hash` |
| `audit_log` | `idx_audit_log_entity` | `entity`, `entity_id` |
| `audit_log` | `idx_audit_log_user` | `user_id` |
| `audit_log` | `idx_audit_log_created` | `created_at` |
| `analytics_events` | `idx_analytics_event_name` | `event_name` |
| `analytics_events` | `idx_analytics_user` | `user_id` |
| `analytics_events` | `idx_analytics_created` | `created_at` |
| `analytics_events` | `idx_analytics_entity` | `entity`, `entity_id` |
| `lesson_versions` | `idx_lesson_versions_lesson` | `lesson_id` |
| `lesson_versions` | `idx_lesson_versions_version` | `lesson_id`, `version` |
| `payments` | `idx_payments_subscriber` | `subscriber_id` |
| `payments` | `idx_payments_status` | `status` |
| `payments` | `idx_payments_created` | `created_at` |
| `manual_access_grants` | `idx_manual_grants_subscriber` | `subscriber_id` |
| `manual_access_grants` | `idx_manual_grants_created` | `created_at` |

### Валидные зоны уроков

`шея`, `поясница`, `грудной_отдел`, `колени`, `ноги_таз`, `спина_осанка`, `плечи_руки`, `баланс_общее`

---

## Аутентификация и авторизация

### JWT аутентификация

- **Алгоритм:** HS256
- **Срок жизни токена:** 24 часа
- **Структура payload:** `{ id, email, role, jti (UUID) }`
- **Секрет:** переменная `JWT_SECRET` (в dev — автоматическая генерация `crypto.randomBytes(32)`)
- **Проверка:** `authMiddleware` извлекает токен из `Authorization: Bearer <token>`, проверяет подпись и проверяет отсутствие в `token_blocklist`
- **Отзыв токена:** При logout или смене пароля токен добавляется в `token_blocklist` (SHA-256 хэш) с `expires_at`
- **Очистка:** `cleanupBlocklist()` удаляет просроченные записи

### RBAC (Role-Based Access Control)

Три роли с иерархией уровней:

| Роль | Уровень | Описание |
|------|---------|----------|
| `subscriber` | 1 | Подписчик — доступ к личному кабинету, видео, прогрессу |
| `admin` | 2 | Администратор — управление контентом, настройки, аналитика |
| `super_admin` | 3 | Суперадмин — полный доступ ко всему |

**Иерархия наследования:** `super_admin` ≥ `admin` ≥ `subscriber`

- `requireRole('subscriber')` — доступен подписчикам, админам и суперадминам
- `requireRole('admin')` — доступен админам и суперадминам
- `requireRole('super_admin')` — доступен только суперадминам
- `requireAdmin` — обёртка над `requireRole('admin')`
- `requireSuperAdmin` — обёртка над `requireRole('super_admin')`

### Раздельная аутентификация

- **Admin-вход** (`/api/auth/login`) — из таблицы `users`
- **Subscriber-вход** (`/api/user/login`) — из таблицы `subscribers`
- Требуется подтверждение email (`email_confirmed = 1`) для подписчиков
- Пробный тариф: 7 бесплатных платных уроков (`free_sessions_used`)
- Модель гибридного доступа: `is_free` уроки доступны всем, платные — по подписке или в рамках trial

---

## Безопасность

### Helmet (HTTP Security Headers)

```javascript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:", "data:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],         // защита от clickjacking
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,       // отключено для совместимости с видео
})
```

### CORS

- Белый список origins из переменной `ALLOWED_ORIGIN` (через запятую)
- В dev-режиме (`NODE_ENV !== 'production'`) все origins разрешены
- `credentials: true` для передачи cookies/auth
- `maxAge: 86400` (24ч кэш preflight)

### Rate Limiting

| Лимитер | Window | Max Requests | Применяется к |
|---------|--------|-------------|---------------|
| Global | 60 сек | 200 (10000 в test) | `/api/*` (кроме auth/user) |
| Login (admin) | 60 сек | 100 (10000 в test) | `POST /api/auth/login` |
| Auth (subscriber) | 60 сек | 15 (10000 в test) | `POST /api/user/register`, `/login` |
| Resend | 60 сек | 3 (10000 в test) | `POST /api/user/confirm/resend` |

### Валидация входных данных

Middleware `validateBody` проверяет:
- `required` — обязательность поля
- `type` — тип (string, number, array)
- `minLength` / `maxLength` — длина строки
- `min` / `max` — диапазон чисел
- `enum` — допустимые значения
- `pattern` — регулярное выражение

### XSS Protection

- Helmet CSP блокирует сторонные скрипты
- Валидация и санитизация полей ввода (обрезка по `maxLength`)
- `objectSrc: ['none']` — блокировка плагинов
- `frameAncestors: ['none']` — защита от встраивания

### Дополнительно

- **Пароли:** bcrypt (salt rounds: 10)
- **Ограничение размера тела:** `express.json({ limit: '1mb' })`
- **Ограничение загрузки файлов:** `multer` — max 5MB, только изображения (.jpg, .jpeg, .png, .webp, .gif)
- **Path traversal защита:** проверка `resolvedFile.startsWith(resolvedDir)` для видео и бэкапов
- **Подтверждение опасных действий:** заголовок `X-Confirm-Action: true` для DELETE операций
- **Device fingerprinting:** отслеживание устройств подписчиков для борьбы с злоупотреблениями

---

## Middlewares

### `requestIdMiddleware` (`middleware/requestId.js`)

- Генерирует уникальный `requestId` для каждого запроса
- Использует `X-Request-Id` из заголовка клиента или генерирует `req_<UUID>`
- Устанавливает `X-Request-Id` в ответе
- Используется в логах для трассировки запросов

### `requestLogger` (`helpers/logger.js`)

- Логирует все HTTP запросы с методом, URL, статусом и длительностью
- Уровень логирования зависит от статуса: `info` (2xx), `warn` (4xx), `error` (5xx)
- Включает `requestId` в метаданные
- Формат: JSON с timestamp, level, component, message, meta

### RBAC (`middleware/rbac.js`)

- `requireRole(...roles)` — проверяет уровень роли пользователя
- `requireAdmin` — обёртка для `requireRole('admin')`
- `requireSuperAdmin` — обёртка для `requireRole('super_admin')`
- Возвращает 403 с информацией о требуемых и текущих ролях

### Validation (`middleware/validation.js`)

- `validateBody(rules)` — декларативная валидация тела запроса
- Проверяет типы, обязательность, длину, диапазоны, паттерны, enum
- Возвращает 400 со списком ошибок валидации

### API Version (`middleware/api-version.js`)

- Текущая версия API: `v1`
- Устанавливает заголовки `X-API-Version` и `X-API-Supported`
- Проверяет заголовок `X-API-Version` или query `_api_version`
- Возвращает 400 для неподдерживаемых версий

### Confirmation (`middleware/confirmation.js`)

- `requireConfirmation` — проверяет `X-Confirm-Action: true` для опасных маршрутов
- `requireDangerousActionConfirmation` — требует подтверждение для всех DELETE запросов
- Возвращает 428 (Precondition Required) без подтверждения

---

## Внешние интеграции

### Stripe (подписки)

- **Назначение:** recurring-подписки через Stripe Checkout (`mode: 'subscription'`)
- **Конфигурация:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (fail-fast в production), плюс Price-объекты `STRIPE_MONTHLY_PRICE_ID` / `STRIPE_ANNUAL_PRICE_ID`
- **Вебхуки:** `POST /api/payment/webhook` — обработка **атомарна** (PAY-002): событие + изменение подписки/платежа + аудит в одной транзакции; сбой полностью откатывается и событие остаётся ретраябельным для Stripe. Идемпотентность по `event_id` в `payment_events`.
- **Машина состояний (PAY-001):** Stripe-статусы маппятся в `subscribers.status` (`active→active`, `trialing→trial`, `past_due→past_due`, `unpaid→past_due`, `canceled→cancelled`; неизвестные — no-op). `invoice.payment_failed` переводит `active` в `past_due` (доступ блокируется гейтом `can-watch`).
- **Источник истины периода (PAY-003):** `subscription_expires_at` синхронизируется из Stripe `current_period_end`; оплаченное время никогда не уменьшается. Локальная оценка в `checkout.session.completed` — временный fallback.

### Mux (видео — платные уроки)

- **Назначение:** Direct Upload и playback подписанных видеоуроков (провайдер `mux`)
- **Конфигурация:** `MUX_ACCESS_TOKEN_ID` + `MUX_ACCESS_TOKEN_SECRET` (upload/API), `MUX_SIGNING_KEY_ID` + `MUX_SIGNING_KEY` (подпись playback-токенов). Ключи **все-или-ничего**: частичный набор — ошибка конфигурации в production.
- **Поток:** `POST /api/admin/lessons/:id/video/mux-upload` создаёт direct-upload URL (Mux), браузер PUT-ит файл, `GET /api/admin/video-uploads/:id/status` опрашивает Mux до `asset_created` и сохраняет `mux_asset_id`/`mux_playback_id`.
- **Провайдеры:** урок задаёт `video_provider` (`cloudflare` | `mux`); по умолчанию `cloudflare`.

### Cloudflare Stream

- **Назначение:** Хранение и потоковая передача видеоуроков
- **Конфигурация:** Signing Key ID, Signing Key, Customer Code (хранятся в `settings` или env)
- **Подписанные токены:** JWT (ES256) с `accessRules` для конкретного видео
- **Срок жизни токена:** 6 часов (21600 сек)
- **Формат URL:** `https://{customer-code}.cloudflarestream.com/{signed-token}/manifest/video.m3u8`
- **Fallback:** Если CF Stream не настроен, видео раздаются локально через `GET /videos/:filename` с JWT-проверкой

### Email (Mailer)

**Три проводника:**

| Проводник | Описание | Конфигурация |
|-----------|----------|-------------|
| `console` | Dev-режим, письма в лог | Дефолт |
| `gmail` | Gmail SMTP через nodemailer | `gmail_user`, `gmail_app_password` |
| `resend` | Resend API | `resend_api_key`, `email_from` |

**Шаблоны писем:**
- Подтверждение регистрации (`CONFIRM_HTML`)
- Пробный период заканчивается (`TRIAL_EXPIRING_HTML`)
- Подписка заканчивается (`SUBSCRIPTION_EXPIRING_HTML`)
- Подписка истекла (`SUBSCRIPTION_EXPIRED_HTML`)
- Тестовое письмо (endpoint `POST /api/settings/test-email`)

Настройки почты динамически читаются из БД (`settings`) с fallback на env-переменные.

---

## Тестирование

### Инфраструктура

- **Режим:** `NODE_ENV=test` отключает загрузку `.env`, ослабляет rate limits (до 10000)
- **БД:** Создаётся чистая SQLite при каждом запуске тестов через `resetDb()`
- **Миграции:** Автоматически применяются при старте сервера
- **Seed данные:** Автоматическая генерация при пустой БД (5 подписчиков, 4 комплекса, 10 уроков, 365 дней расписания, отзывы, FAQ)

### Покрытие

- **18 тестовых сьютов**
- **915 тестов** (v5.13.0)

---

## Development / Production конфигурация

### Переменные окружения

| Переменная | Описание | Обязательна в prod |
|------------|----------|-------------------|
| `NODE_ENV` | Режим: `development`, `production`, `test` | — |
| `PORT` | Порт сервера (по умолчанию 3001) | Нет |
| `JWT_SECRET` | Секрет для JWT подписи | **Да** |
| `ALLOWED_ORIGIN` | Белый список origins (через запятую) | **Да** |
| `VIDEOS_DIR` | Путь к локальным видео | Нет |
| `MAIL_PROVIDER` | Проводник email: `console`, `gmail`, `resend` | Нет |
| `GMAIL_USER` | Email для Gmail SMTP | Нет |
| `GMAIL_APP_PASSWORD` | App password для Gmail | Нет |
| `RESEND_API_KEY` | API ключ Resend | Нет |
| `EMAIL_FROM` | Email отправителя | Нет |
| `APP_BASE_URL` | Базовый URL приложения | Нет |
| `CF_STREAM_SIGNING_KEY_ID` | Cloudflare Stream Key ID | Нет |
| `CF_STREAM_SIGNING_KEY` | Cloudflare Stream Signing Key | Нет |
| `CF_STREAM_CUSTOMER_CODE` | Cloudflare Stream Customer Code | Нет |
| `STRIPE_SECRET_KEY` | Stripe Secret Key | **Да** |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret | **Да** |
| `STRIPE_MONTHLY_PRICE_ID` | Stripe Price ID месячного плана | **Да** |
| `STRIPE_ANNUAL_PRICE_ID` | Stripe Price ID годового плана | **Да** |
| `MUX_ACCESS_TOKEN_ID` | Mux access token ID (upload/API) | Нет (все-или-ничего) |
| `MUX_ACCESS_TOKEN_SECRET` | Mux access token secret | Нет (все-или-ничего) |
| `MUX_SIGNING_KEY_ID` | Mux signing key ID | Нет (все-или-ничего) |
| `MUX_SIGNING_KEY` | Mux signing key | Нет (все-или-ничего) |
| `LOG_LEVEL` | Уровень логов: `error`, `warn`, `info`, `debug` | Нет |

### Startup Sequence

```
1. validateConfig()          — проверка обязательных env vars
2. getDb()                   — инициализация SQLite + CREATE TABLE
3. runMigrations()           — применение SQL-миграций из server/migrations/
4. seedData()                — заполнение пустой БД тестовыми данными
5. app.listen(PORT)          — запуск HTTP-сервера
6. isReady = true            — readiness check начинает отвечать 200
```

### Graceful Shutdown

- Перехват `SIGTERM` и `SIGINT`
- Установка `isReady = false` (readiness → 503)
- Закрытие HTTP-сервера
- `saveDb()` — принудительный дамп SQLite на диск
- Таймаут принудительного завершения: 10 секунд

### Статика

- `/dist` — SPA фронтенд (HTML: no-cache, остальные: immutable 1 год)
- `/uploads` — загруженные изображения
- `/videos` — локальные видео (с JWT-проверкой)
- `/admin/*` — SPA админ-панели (все маршруты → `admin/index.html`)
- Clean URLs: `/plans`, `/lessons`, `/login`, `/calendar`, `/faq` и др.

### Миграции

- SQL-файлы из `server/migrations/*.sql`
- Автоматическое определение применённых миграций через таблицу `migrations`
- Каждая миграция выполняется в транзакции (BEGIN/COMMIT/ROLLBACK)
- Отслеживание по имени файла

### Бэкап и восстановление

- **Бэкап:** `POST /api/admin/backup` — копирование `qigong.db` в `data/backups/qigong-{timestamp}.db`
- **Восстановление:** `POST /api/admin/restore` — копирование из бэкапа в основной файл (с проверкой пути)
- Ограничение: восстановление только из директории `data/backups`

---

## Структура проекта

```
server/
├── index.js                    # Express server, маршруты, middleware
├── auth.js                     # JWT middleware, генерация токенов
├── db.js                       # SQLite (sql.js), schema, транзакции
├── routes/
│   ├── auth.js                 # Admin auth (login, logout, password)
│   ├── user.js                 # Subscriber auth, profile, progress, calendar
│   ├── payment.js              # Stripe оплата, подписки, webhook
│   └── crud.js                 # Generic CRUD-роутер для таблиц
├── services/
│   ├── auth.service.js         # Логика аутентификации admin/subscriber
│   ├── analytics.service.js    # Трекинг и аналитика событий
│   ├── audit.service.js        # Аудит действий
│   ├── content-version.service.js # Версионирование уроков
│   ├── dashboard.service.js    # Статистика дашборда
│   ├── feedback.service.js     # Тикеты (создание, ответы, управление)
│   ├── mailer.js               # Отправка email (gmail/resend/console)
│   ├── progress.service.js     # Прогресс просмотра, профиль
│   ├── recommendation.service.js # Рекомендательная система
│   ├── schedule.service.js     # Расписание, персональный таймлайн
│   ├── payment.service.js      # Stripe: Checkout, webhook, подписки
│   └── stream.js               # Cloudflare Stream интеграция
├── repositories/
│   ├── base.repository.js      # Generic Repository (CRUD + query)
│   ├── index.js                # Конкретные репозитории
│   └── subscriber.repository.js # Репозиторий подписчиков
├── helpers/
│   ├── config.js               # Валидация конфигурации
│   ├── db-utils.js             # Конвертация результатов запросов
│   ├── errors.js               # Классы ошибок и форматирование
│   ├── logger.js               # Структурированное логирование
│   ├── migrations.js           # SQL-миграции
│   └── pagination.js           # Парсинг пагинации
├── middleware/
│   ├── api-version.js          # Контроль версий API
│   ├── confirmation.js         # Подтверждение опасных действий
│   ├── rbac.js                 # Role-Based Access Control
│   ├── requestId.js            # Генерация request ID
│   └── validation.js           # Валидация тела запроса
└── migrations/                 # SQL-файлы миграций
```
