# Цигун и суставная разминка — Лендинг + Backend

Проект лендинга для платформы цигун и суставной разминки с честной моделью монетизации.

## Описание

Это лендинг для приложения, которое предлагает ежедневные занятия цигун и суставной разминки. Особенность проекта — честная модель монетизации: бесплатный старт без привязки карты.

## Структура проекта

```
├── src/
│   ├── index.html              # Главная страница лендинга
│   ├── styles/
│   │   └── main.css            # Основные стили
│   ├── js/
│   │   └── main.js             # JavaScript для интерактивности
│   ├── images/                 # Изображения лендинга
│   ├── pages/                  # Страницы подписчика (dashboard, picker, onboarding, profile, lessons, player, календарь)
│   ├── admin/                  # Админ-панель (14 страниц)
│   │   ├── lessons.html        # Уроки (direction, zones, effect_description)
│   │   ├── complexes.html      # Комплексы
│   │   ├── schedule.html       # Расписание
│   │   ├── settings.html       # Настройки
│   │   └── ...
│   └── admin/js/               # JS модули админки (sidebar, api, admin)
├── server/
│   ├── index.js                # Express сервер, API, seed data
│   ├── db.js                   # sql.js БД (SQLite), миграции
│   ├── auth.js                 # JWT аутентификация
│   ├── routes/
│   │   ├── user.js             # Subscriber API (регистрация, календарь, фильтр)
│   │   ├── crud.js             # Generic CRUD factory
│   │   └── auth.js             # Auth routes
│   └── services/
│       ├── mailer.js           # Email (console/gmail/resend)
│       └── stream.js           # Cloudflare Stream
├── tests/                      # 656 тестов (8 сьютов)
├── data/                       # SQLite БД (gitignored)
├── videos/                     # Видеофайлы (gitignored)
├── dist/                       # Собранный фронтенд (gitignored)
├── webpack.config.js
├── Dockerfile / render.yaml / vercel.json
└── package.json
```

## База данных — схема v3.4.0

```
lessons ──< lesson_zones     (многие-ко-многим: зоны тела)
lessons ──< watched_lessons  (прогресс пользователей)
lessons >── complexes        (традиционные комплексы)
subscribers ──< watched_lessons
subscribers ──< transactions
subscribers ──< user_preferences (настройки из onboarding)
subscribers ──< workout_feedback (оценки настроений после занятий)
schedule ──> lessons
tickets ──< ticket_messages (обратная связь подписчик-админ)
```

**Ключевые поля lessons:** `direction` (суставная_разминка / занятие_в_потоке), `direction_source` (заголовок / описание_неточно / нет_данных), `effect_description`, `effect_is_draft`

**Зоны тела (lesson_zones):** шея, плечи_руки, грудной_отдел, поясница, спина_осанка, колени, ноги_таз, баланс_общее

## Установка

```bash
npm install
```

## Тестирование

```bash
npm test
```

## Разработка

```bash
npm run dev
```

## Сборка

```bash
npm run build
```

## API endpoints

| Endpoint | Описание |
|----------|----------|
| `GET /api/lessons` | Активные уроки |
| `GET /api/lesson-zones/:id` | Зоны урока |
| `GET /api/user/lessons-filter?zone=шея&duration=30` | Фильтр уроков по зоне/настроению/длительности |
| `GET /api/user/calendar` | Календарь с прогрессом |
| `POST /api/user/register` | Регистрация |
| `POST /api/user/login` | Вход |
| `PUT /api/admin/lessons/:id/zones` | Обновление зон (admin) |

## Документация

- [CHANGELOG.md](CHANGELOG.md) — история изменений
- [FEATURE_REGISTRY.md](FEATURE_REGISTRY.md) — реестр фич
- [DEVIL_ADVOCATE_REPORT.md](DEVIL_ADVOCATE_REPORT.md) — отчёт анализа
- [VERIFICATION.md](VERIFICATION.md) — верификация изменений v3.4.0

## GitHub

- Репозиторий: https://github.com/francisdrake1962-code/Sport-progect

## Лицензия

ISC
