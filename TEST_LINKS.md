# Ссылки для проверки v3.4.0

**Сервер запущен:** http://localhost:3001

---

## Админ-панель (без авторизации)

| Страница | URL | Что проверить |
|----------|-----|---------------|
| Логин | http://localhost:3001/admin/login.html | Форма входа |
| Дашборд | http://localhost:3001/admin/ | Статистика, навигация |
| **Уроки** | http://localhost:3001/admin/lessons.html | Новая колонка «Направление», модалка с direction/zones/effect |
| Комплексы | http://localhost:3001/admin/complexes.html | CRUD комплексов |
| Расписание | http://localhost:3001/admin/schedule.html | Календарь |
| Настройки | http://localhost:3001/admin/settings.html | Настройки приложения |

**Логин админки:** `admin@qigong.com` / `admin123`

---

## Лендинг (публичные страницы)

| Страница | URL |
|----------|-----|
| Главная | http://localhost:3001/ |
| Тарифы | http://localhost:3001/plans |
| Календарь | http://localhost:3001/calendar |
| Уроки | http://localhost:3001/lessons |
| FAQ | http://localhost:3001/faq |
| Игрок | http://localhost:3001/player |

---

## API — проверка изменений

### 1. Уроки с direction

```
GET http://localhost:3001/api/lessons
```
Ожидаемое: каждый урок имеет поля `direction`, `direction_source`, `effect_description`, `effect_is_draft`

### 2. Зоны урока

```
GET http://localhost:3001/api/lesson-zones/1    → ["шея", "плечи_руки"]
GET http://localhost:3001/api/lesson-zones/7    → ["поясница", "спина_осанка"]
GET http://localhost:3001/api/lesson-zones/10   → ["поясница", "спина_осанка"]
```

### 3. Exercises удалён

```
GET http://localhost:3001/api/exercises         → 403 (маршрут не существует)
```

### 4. Фильтр по зоне (требует JWT токен подписчика)

**Получение токена:**
```
POST http://localhost:3001/api/user/login
{"email":"maria@example.com","password":"password123"}
```

**Фильтры:**
```
GET /api/user/lessons-filter?zone=шея                    → 1 урок (ID=1)
GET /api/user/lessons-filter?zone=колени                 → 1 урок (ID=6)
GET /api/user/lessons-filter?zone=шея,плечи_руки         → 2 урока (ID=1, ID=5)
GET /api/user/lessons-filter?zone=поясница               → 2 урока (ID=2, ID=7)
GET /api/user/lessons-filter?duration=25                 → уроки ≤25 мин
GET /api/user/lessons-filter?zone=шея&duration=30        → комбинированный фильтр
```

### 5. Другие endpoints (без изменений)

```
GET http://localhost:3001/api/health                    → {"status":"ok"}
GET http://localhost:3001/api/complexes                 → список комплексов
GET http://localhost:3001/api/schedule                  → расписание
GET http://localhost:3001/api/reviews                   → отзывы
GET http://localhost:3001/api/user/calendar             → календарь (JWT)
GET http://localhost:3001/api/user/can-watch/1          → проверка доступа (JWT)
```

---

## Тесты

```bash
cd "C:\Users\admin\Documents\Default Project"
npm test
```
Ожидаемое: **648 passed, 0 failed**

---

## Что именно проверять

### В админке «Уроки» (http://localhost:3001/admin/lessons.html)

1. Таблица — колонка «Направление» с бейджем (Разминка / Поток / —)
2. Кнопка «Редактировать» → модалка содержит:
   - Переключатель «Направление» (суставная_разминка / занятие_в_потоке)
   - Чекбоксы «Зоны тела» (8 зон, выбранные для урока)
   - Текстовое поле «Описание эффекта»
   - Жёлтая плашка «Черновик» если effect_is_draft=1
3. Кнопка «Новый урок» → все поля пустые, направление не выбрано

### В админке — отсутствие «Упражнения»

1. Сайдбар — нет пункта «Упражнения»
2. Нет файла exercises.html

### В API

1. `GET /api/lessons` — direction, effect_description присутствуют
2. `GET /api/lesson-zons/:id` — возвращает массив зон
3. Фильтр по зоне работает через SQL, а не JSON
4. `GET /api/exercises` — не существует (404/403)
