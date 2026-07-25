# Верификация изменений v3.4.0

**Дата:** 2026-07-24 | **ТЗ:** Переработка таблиц lessons/complexes | **Статус:** Выполнено

---

## 1. Схема БД — новые таблицы и колонки

### lesson_zones (новая таблица)

| Файл | Строка | Что |
|------|--------|-----|
| `server/db.js:207-212` | `CREATE TABLE IF NOT EXISTS lesson_zones` | Создание таблицы с PK (lesson_id, zone) и FK на lessons |
| `server/db.js:210` | `PRIMARY KEY (lesson_id, zone)` | Составной первичный ключ — одно занятие не может иметь дублирующую зону |
| `server/index.js:168-192` | `api.put('/lessons/:id/zones')` | Админский endpoint для сохранения зон (DELETE + INSERT) |
| `server/index.js:184` | `VALID_ZONES` | Валидный список зон: шея, поясница, грудной_отдел, колени, ноги_таз, спина_осанка, плечи_руки, баланс_общее |

### Новые колонки в lessons

| Файл | Строка | Колонка | Тип |
|------|--------|---------|-----|
| `server/db.js:195` | `ALTER TABLE lessons ADD COLUMN direction` | `direction` | TEXT CHECK IN ('суставная_разминка','занятие_в_потоке') |
| `server/db.js:196` | `ALTER TABLE lessons ADD COLUMN direction_source` | `direction_source` | TEXT DEFAULT 'нет_данных' CHECK IN ('заголовок','описание_неточно','нет_данных') |
| `server/db.js:197` | `ALTER TABLE lessons ADD COLUMN effect_description` | `effect_description` | TEXT |
| `server/db.js:198` | `ALTER TABLE lessons ADD COLUMN effect_is_draft` | `effect_is_draft` | INTEGER DEFAULT 0 |

---

## 2. Удаление exercises

| Файл | Строка | Что |
|------|--------|-----|
| `server/db.js:72-81` | `CREATE TABLE IF NOT EXISTS exercises` | Таблица оставлена для обратной совместимости (не DROP, т.к. sql.js не поддерживает DROP в migrate) |
| `server/routes/crud.js:3` | `VALID_TABLES` | `exercises` удалён из Set |
| `server/index.js:158` | CRUD route | `api.use('/exercises', ...)` удалён |
| `server/index.js:111-120` | Public route | `GET /api/exercises` заменён на `GET /api/lesson-zones/:lessonId` |
| `src/admin/js/sidebar.js:9` | Sidebar link | Ссылка «Упражнения» удалена из меню |
| `src/admin/exercises.html` | — | Файл удалён |
| `webpack.config.js:33` | `adminPages` | `'exercises'` удалён из массива |

---

## 3. CRUD lessons — обновлённые поля

| Файл | Строка | Что |
|------|--------|-----|
| `server/index.js:156` | CRUD route | Поля: `['title', 'complex_id', 'duration', 'status', 'description', 'video_url', 'cf_video_uid', 'is_free', 'free_order', 'date', 'tags', 'direction', 'direction_source', 'effect_description', 'effect_is_draft']` |

---

## 4. /lessons-filter — фильтрация по lesson_zones

| Файл | Строка | Что |
|------|--------|-----|
| `server/routes/user.js:423-459` | `GET /lessons-filter` | Фильтр `zone` теперь делает SQL `SELECT DISTINCT lesson_id FROM lesson_zones WHERE zone IN (...)` вместо фильтрации по JSON `tags` |

**Было:**
```js
lessons = lessons.filter(l => l.tags.some(t => zoneTags.includes(t.toLowerCase())));
```

**Стало:**
```js
const zoneResult = db.exec(
  `SELECT DISTINCT lesson_id FROM lesson_zones WHERE zone IN (${placeholders})`,
  zoneValues
);
const matchingIds = new Set(zoneResult.length ? zoneResult[0].values.map(r => r[0]) : []);
lessons = lessons.filter(l => matchingIds.has(l.id));
```

---

## 5. Админка — lessons.html

| Файл | Строка | Что |
|------|--------|-----|
| `src/admin/lessons.html:29-38` | Modal body | Переключатель «Направление» (2 radio: суставная_разминка / занятие_в_потоке) |
| `src/admin/lessons.html:39-51` | Modal body | Чекбоксы «Зоны тела» (8 зон в grid 4x2) |
| `src/admin/lessons.html:52-56` | Modal body | Textarea «Описание эффекта» + бейдж «Черновик — проверьте формулировку» |
| `src/admin/lessons.html:108-117` | `openEdit()` | Загрузка зон через `GET /api/lesson-zones/:id` и установка чекбоксов |
| `src/admin/lessons.html:131-148` | Save handler | Сохранение direction, direction_source, effect_description, effect_is_draft + вызов `PUT /api/lessons/:id/zones` |
| `src/admin/lessons.html:54-57` | Table header | Добавлена колонка «Направление» с бейджем |

---

## 6. Seed data — обновлённые данные

| Файл | Строка | Что |
|------|--------|-----|
| `server/index.js:577-596` | `seedData()` | 10 уроков с direction, direction_source, effect_description |
| `server/index.js:598-612` | `seedData()` | 14 записей lesson_zones (распределение зон по урокам) |

---

## 7. Тесты — обновления

| Файл | Что изменено |
|------|-------------|
| `tests/admin.test.js:10` | Убран `exercises.html` из `adminPages` |
| `tests/admin.test.js:117` | Убран `exercises.html` из `crudPages` |
| `tests/admin.test.js:130` | Убран `exercises.html` из `modalPages` |
| `tests/build.test.js:91` | Убран `exercises.html` из проверки admin pages |
| `tests/backend.test.js:287` | Убран `exercises` из endpoints |

**Результат:** 656/656 тестов пройдены

---

## 8. Сборка

| Файл | Что |
|------|-----|
| `webpack.config.js:33` | `adminPages` — 13 страниц (без exercises) |
| `dist/admin/` | Пересобран, exercises.html удалён |

---

## 9. GitHub

| Параметр | Значение |
|----------|---------|
| Репозиторий | https://github.com/francisdrake1962-code/Sport-progect |
| Ветка | `main` |
| Коммит | `7450d37` — "Переработка структуры БД: lesson_zones вместо exercises" |
| Дата push | 2026-07-24 |

---

## 10. Как проверить

### Через API (запущенный сервер)

```bash
# Получить все уроки с direction
curl http://localhost:3001/api/lessons

# Получить зоны конкретного урока
curl http://localhost:3001/api/lesson-zones/1

# Фильтр по зоне (требует JWT токен)
curl -H "Authorization: Bearer <token>" "http://localhost:3001/api/user/lessons-filter?zone=шея"
```

### Через админку

1. Запустить сервер: `npm start`
2. Открыть `http://localhost:3001/admin/`
3. Войти: `admin@qigong.com` / `admin123`
4. Раздел «Уроки» → нажать «Редактировать» на любом уроке
5. Проверить: переключатель направления, чекбоксы зон, описание эффекта

### Через тесты

```bash
npm test
# Ожидаемый результат: 656 passed, 8 suites
```

---

## Не выполнено (требует данных из архива)

- **Импорт реальных данных** из `Каталог_переработанный.xlsx` (1160 записей) — шаг 5 ТЗ
- Шаги 1-4 и 6 плана миграции выполнены; шаг 3 (импорт из xlsx) требует отдельного скрипта и данных
