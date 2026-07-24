# Гайд по проверке работоспособности

Пошаговая инструкция для полной проверки проекта. Сервер запускается на `http://localhost:3001`.

---

## Запуск

```bash
cd "C:\Users\Francis\Documents\Default Project"
npm install
npx webpack --mode production
node server/index.js
```

Сервер выведет:
```
Server running at http://localhost:3001
Admin panel at http://localhost:3001/admin/
API at http://localhost:3001/api/
[mailer] Console mode — emails will be logged to server output
```

---

## 1. Публичный API (без авторизации)

| # | Тест | Ссылка | Ожидаемый результат |
|---|------|--------|---------------------|
| 1.1 | Health check | `http://localhost:3001/api/health` | `{"status":"ok"}` |
| 1.2 | Список уроков | `http://localhost:3001/api/lessons` | JSON-массив уроков |
| 1.3 | Один урок | `http://localhost:3001/api/lessons/1` | JSON-объект урока |
| 1.4 | Комплексы | `http://localhost:3001/api/complexes` | JSON-массив комплексов |
| 1.5 | Упражнения | `http://localhost:3001/api/exercises` | JSON-массив упражнений |
| 1.6 | Расписание | `http://localhost:3001/api/schedule` | JSON-массив расписания |
| 1.7 | Отзывы | `http://localhost:3001/api/reviews` | JSON-массив отзывов |
| 1.8 | Настройки | `http://localhost:3001/api/settings` | JSON объект настроек |

---

## 2. Лендинг (публичные страницы)

| # | Страница | Ссылка |
|---|----------|--------|
| 2.1 | Главная | `http://localhost:3001/` |
| 2.2 | О тренере | `http://localhost:3001/about-trainer` |
| 2.3 | Это правда бесплатно? | `http://localhost:3001/is-it-really-free` |
| 2.4 | Как отменить подписку | `http://localhost:3001/how-to-cancel` |
| 2.5 | 8 кусков парчи | `http://localhost:3001/8-pieces-of-brocade` |
| 2.6 | И Цзинь Цзин | `http://localhost:3001/yijinjing` |
| 2.7 | Малый небесный круг | `http://localhost:3001/small-circulation` |
| 2.8 | FAQ | `http://localhost:3001/faq` |
| 2.9 | Контакты | `http://localhost:3001/contact` |
| 2.10 | Конфиденциальность | `http://localhost:3001/privacy` |
| 2.11 | Условия | `http://localhost:3001/terms` |
| 2.12 | Возврат | `http://localhost:3001/refund` |
| 2.13 | Тарифы | `http://localhost:3001/plans` |

**Что проверять на каждой странице:**
- Логотип кликабельный, ведёт на `/`
- Кнопка «Начать бесплатно» ведёт на `login.html?tab=register`
- Ссылка «Войти» ведёт на `login.html`
- Footer ссылки работают
- Нет 404 ошибок в консоли

---

## 3. Регистрация и вход подписчика

### 3.1 Регистрация
1. Открыть `http://localhost:3001/login.html?tab=register`
2. Заполнить: Имя, Email (например `test@example.com`), Пароль (мин 8 символов), Повтор пароля
3. Нажать «Зарегистрироваться»
4. **Ожидаемый результат:** сообщение «Письмо отправлено! Проверьте почту...»
5. В консоли сервера появится ссылка подтверждения:
   ```
   [mailer] DEV confirmation for test@example.com:
   [mailer] Link: http://localhost:3001/api/user/confirm/abc123...
   ```

### 3.2 Подтверждение email
1. Скопировать ссылку из консоли сервера
2. Открыть в браузере
3. **Ожидаемый результат:** «Почта подтверждена! Теперь вы можете войти.»

### 3.3 Вход
1. Открыть `http://localhost:3001/login.html`
2. Ввести email и пароль
3. Нажать «Войти»
4. **Ожидаемый результат:** редирект на `http://localhost:3001/lessons.html`

### 3.4 Ошибка: не подтверждён email
1. Зарегистрировать нового пользователя (без подтверждения)
2. Попытаться войти
3. **Ожидаемый результат:** ошибка «Email не подтверждён» + кнопка «Отправить письмо повторно»

---

## 4. Контент подписчика

| # | Страница | Ссылка | Требуется |
|---|----------|--------|-----------|
| 4.1 | Занятия | `http://localhost:3001/lessons.html` | Авторизация |
| 4.2 | Плеер (урок по расписанию) | `http://localhost:3001/player.html` | Авторизация |
| 4.3 | Плеер (конкретный урок) | `http://localhost:3001/player.html?id=1` | Авторизация |
| 4.4 | Календарь | `http://localhost:3001/calendar.html` | Авторизация |

**Что проверять:**
- Без авторизации: на страницах 4.1-4.4 показывается «Войдите, чтобы начать занятия»
- После входа: уроки загружаются, видео воспроизводится
- Плеер: play/pause, прогресс-бар, полноэкранный режим, клавиатура (Space, ←/→, F)
- После просмотра: прогресс сохраняется

---

## 5. API подписчика (с JWT)

### 5.1 Получить токен
```bash
curl -X POST http://localhost:3001/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"yourpassword"}'
```
Ответ: `{"token":"eyJhbG...","user":{...}}`

### 5.2 Профиль
```bash
curl http://localhost:3001/api/user/me \
  -H "Authorization: Bearer TOKEN"
```

### 5.3 Проверка доступа к видео
```bash
curl http://localhost:3001/api/user/can-watch/1 \
  -H "Authorization: Bearer TOKEN"
```
Ответ: `{"allowed":true,"reason":"free_lesson"}` или `{"allowed":true,"reason":"trial","freeUsed":0,"freeLimit":7}`

### 5.4 Сохранение прогресса
```bash
curl -X POST http://localhost:3001/api/user/watch-progress \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"lesson_id":1,"position_seconds":120,"completed":false}'
```

### 5.5 Календарь
```bash
curl http://localhost:3001/api/user/calendar \
  -H "Authorization: Bearer TOKEN"
```

### 5.6 Бесплатный лимит
```bash
# Просмотр 7 уроков → 8-й должен быть заблокирован
for i in {1..7}; do
  curl -X POST http://localhost:3001/api/user/watch-progress \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer TOKEN" \
    -d "{\"lesson_id\":$i,\"position_seconds\":1800,\"completed\":true}"
done

# 8-й урок
curl http://localhost:3001/api/user/can-watch/8 \
  -H "Authorization: Bearer TOKEN"
# Ожидаемый результат: {"allowed":false,"reason":"limit_reached","freeUsed":7,"freeLimit":7}
```

---

## 6. Админ-панель

### 6.1 Вход
1. Открыть `http://localhost:3001/admin/`
2. Редирект на `http://localhost:3001/admin/login.html`
3. Ввести: `admin@qigong.com` / `admin123`
4. **Ожидаемый результат:** редирект на дашборд

### 6.2 Дашборд
Ссылка: `http://localhost:3001/admin/`
- Показывает статистику: подписчики, активные, доход, уроки, упражнения, комплексы, расписание, промо-коды, конверсия

### 6.3 CRUD операции

| # | Раздел | Ссылка | Создание | Редактирование | Удаление |
|---|--------|--------|----------|----------------|----------|
| 6.3.1 | Уроки | `/admin/lessons.html` | «+ Новый урок» | «Редактировать» | «Удалить» |
| 6.3.2 | Комплексы | `/admin/complexes.html` | «+ Новый» | «Редактировать» | «Удалить» |
| 6.3.3 | Упражнения | `/admin/exercises.html` | «+ Новое» | «Редактировать» | «Удалить» |
| 6.3.4 | Расписание | `/admin/schedule.html` | «+ Новое» | «Редактировать» | «Удалить» |
| 6.3.5 | FAQ | `/admin/faq.html` | «+ Новый» | «Редактировать» | «Удалить» |
| 6.3.6 | Промокоды | `/admin/promo.html` | «+ Новый» | «Редактировать» | «Удалить» |
| 6.3.7 | Отзывы | `/admin/reviews.html` | — | Одобрение/Удаление | — |
| 6.3.8 | Подписчики | `/admin/subscriptions.html` | — | Просмотр | — |
| 6.3.9 | Пользователи | `/admin/users.html` | — | Просмотр | — |
| 6.3.10 | Уведомления | `/admin/notifications.html` | «+ Новое» | — | — |
| 6.3.11 | Финансы | `/admin/finance.html` | — | Просмотр | — |
| 6.3.12 | Настройки | `/admin/settings.html` | — | Сохранение | — |

**Что проверять на каждой CRUD-странице:**
1. Таблица загружается с данными из seed
2. Кнопка «+ Новое/Добавить» → открывается модалка
3. Заполнить форму → «Сохранить» → запись появляется в таблице
4. «Редактировать» → модалка с заполненными данными → изменить → «Сохранить»
5. «Удалить» → подтверждение → запись исчезает
6. Нет ошибок в консоли

---

## 7. Видео доступ (безопасность)

### 7.1 Без токена
```bash
curl -I http://localhost:3001/videos/test.mp4
# Ожидаемый результат: 401 Unauthorized
```

### 7.2 С невалидным токеном
```bash
curl -I http://localhost:3001/videos/test.mp4 \
  -H "Authorization: Bearer invalid_token"
# Ожидаемый результат: 401 Invalid token
```

### 7.3 С валидным токеном (подписчик)
```bash
curl -I http://localhost:3001/videos/some-video.mp4 \
  -H "Authorization: Bearer VALID_TOKEN"
# Ожидаемый результат: 200 OK (если видео привязано к уроку) или 403 (если нет)
```

### 7.4 Path traversal
```bash
curl -I "http://localhost:3001/videos/../../etc/passwd" \
  -H "Authorization: Bearer VALID_TOKEN"
# Ожидаемый результат: 403 или 404
```

---

## 8. Cloudflare Stream (требует настройки)

### 8.1 Проверка конфигурации
```bash
curl http://localhost:3001/api/user/stream-token/1 \
  -H "Authorization: Bearer TOKEN"
```
- Если CF не настроен: `{"error":"Streaming not configured"}` (ожидаемо)
- Если CF настроен: `{"streamUrl":"https://customer-xxx.cloudflarestream.com/..."}`

### 8.2 Настройка
Добавить в `.env`:
```
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_STREAM_API_TOKEN=...
CLOUDFLARE_STREAM_SIGNING_KEY_ID=...
CLOUDFLARE_STREAM_SIGNING_KEY=...
CLOUDFLARE_STREAM_CUSTOMER_CODE=...
```

---

## 9. Тесты

```bash
# Все тесты (должно быть 658/658)
npx jest --forceExit

# Только backend тесты
npx jest tests/backend.test.js --forceExit

# Только landing тесты
npx jest tests/landing.test.js --forceExit

# Только integrity тесты
npx jest tests/integrity.test.js --forceExit
```

---

## 10. Тестовые аккаунты

| Аккаунт | Email | Пароль | План | Статус |
|---------|-------|--------|------|--------|
| Админ | `admin@qigong.com` | `admin123` | admin | active |
| Тест (annual) | `maria@example.com` | `password123` | annual | active |
| Тест (trial) | `anna@example.com` | `password123` | trial | trial |

**Важно:** Тестовые аккаунты создаются только при первом запуске (INSERT OR IGNORE). При перезапуске сервера пароли НЕ сбрасываются.

---

## Чек-лист перед деплоем

- [ ] `NODE_ENV=production` установлен
- [ ] `JWT_SECRET` установлен (не генерируется случайно)
- [ ] Пароль админа `admin123` заменён
- [ ] `RESEND_API_KEY` или `GMAIL_*` настроены для отправки email
- [ ] `APP_BASE_URL` установлен (для ссылок в письмах)
- [ ] `VIDEOS_DIR` указан (или используется Cloudflare Stream)
- [ ] `CLOUDFLARE_*` переменные настроены (если используется Stream)
- [ ] Домен добавлен в CORS allowlist
- [ ] `data/qigong.db` не попадает в git (в .gitignore)

---

*Последнее обновление: 2026-07-22 | Сервер: Express 5.2.1 | База: sql.js 1.14.1 | Тесты: 658/658*
