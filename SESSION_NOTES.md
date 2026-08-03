# СЕССИОННЫЕ ЗАМЕТКИ — qigong-landing.com

Последнее обновление: 2026-08-03

## Objective
Стилизовать qigong-landing.com в «mindful»-эстетике по образцу melissawoodhealth.com: тёплая землистая палитра, премиальная типографика serif/sans. Главная (лендинг) переоформлена и **одобрена**. Кабинет переведён из тёмной зелёной гаммы в **светлую тёплую** (решение принято сегодня: тёмная тема отклонена пользователем — «очень мрачно», зелёная тоже была мрачновата).

## Important Details
- Аудитория: поколение 50+, спокойные тёплые тона, без кричащих цветов.
- Лендинг одобрен. Палитра лендинга (src/styles/main.css): `--color-bg:#faf7f2`, `--color-bg-light:#f1ece2`, `--color-primary:#8a6f52`, `--color-accent:#c9b79c`, `--color-dark:#2b2721`, `--color-on-dark:#f5efe4`, `--color-danger:#a4533f`, `--color-success:#75815c`.
- Шрифты self-hosted: Noto Serif Display Variable + Noto Sans Variable (12 woff2 в src/fonts/, latin+cyrillic).
- **Кабинет (СВЕТЛАЯ тёплая тема)**: 11 страниц + i18n.js переведены скриптом (тёмные фоны → крем/белый, текст → `#2b2721`/`#8f8578`, акценты `#8a6f52`). Плеер: оверлеи над видео остались тёмными с кремовым текстом `#f5efe4`.
- Известный баг прошлого ремапа: `#5a5→#9aa87f` испортил `#5a5145`→`#9aa87f145` — вычищено во всех файлах (calendar/dashboard/onboarding/player).
- **Картинки упражнений: НЕ РЕШЕНО.** Пользователь сравнивал с приложением Chair Yoga for Seniors (EasyFit, AppMagic net.workoutinc.senior_chair_yoga_workout_app): там селектор «что болит» (силуэт тела) и карточки с фото упражнений НА СТУЛЕ. У нас упражнения пока СТОЯ; тренер готовит комплекс на стуле (ещё нет). Мой комплект SVG-иллюстраций (позы на стуле, `src/images/ex-*.svg`, `body-map-*.svg`) **отклонён** как несоответствующий контенту. Пользователь думает над оформлением картинок.
- Живой сервер: `http://localhost:3001/` (PID меняется, перезапускать после тестов). Порт `process.env.PORT || 3001`.
- Логи: `%TEMP%\opencode\qigong-server.log` / `-err.log`.
- Creds админки: `admin@qigong.com` / `admin123admin123`.
- В консоли Windows русский текст — кракозябры, не ориентироваться.
- `src/js/main.js` (admin-баннер) — не трогать.
- `src/js/i18n.js` — баннер смены языка, уже в светлой гамме.
- Админка (`src/admin/`) — не переоформлялась, вне кабинета.

## Work State
### Completed
- Лендинг (src/index.html + main.css + fonts) — готов, одобрен.
- Кабинет: зелёная тёмная гамма → тёплая тёмная → **светлая тёплая** (сегодня). Всё собрано: `npm run build` OK, `npm run lint` чисто, `npm run test:ci` 999/999 passed, сервер перезапущен, страницы отдают светлую тему.
- Светлые подстраницы (faq, terms и др.) — плейсхолдеры/noscript в светлой гамме.
- SVG-иллюстрации ex-*.svg (8 шт.) и body-map-*.svg (2 шт.) созданы в src/images/, в dist — но НЕ подключены к страницам и отклонены пользователем (см. выше).
- `lessons.image_url` / `complexes.image_url` есть в БД, но `/api/user/lessons-filter` (server/routes/user.js:725) его НЕ возвращает — если будем подключать картинки, добавить поле в SELECT.

### Pending / Next
1. **Дизайн картинок к упражнениям** — ждёт решения пользователя (после появления комплекса на стуле, либо сам подберёт фото, либо скажет, где взять).
2. Если подключать картинки: добавить `image_url` в SELECT `/api/user/lessons-filter`, вывести миниатюры в `picker.html` и `lessons.html`, заполнить `image_url` в БД.
3. Решить судьбу `src/images/ex-*.svg` и `body-map-*.svg` (удалить или перерисовать под стоячие позы / карту тела — карта тела актуальна независимо от стула).
4. По желанию: переоформить админку под ту же палитру.

## Relevant Files
- `src/styles/main.css` — дизайн-система лендинга (принята).
- `src/index.html` — главная.
- `src/pages/*.html` — 11 страниц кабинета (светлая тёплая тема): calendar, dashboard, lessons, login, onboarding, payment-status, picker, plans, player, profile, reset-password.
- `src/pages/faq.html` и др. — светлые подстраницы.
- `src/js/i18n.js` — баннер языка.
- `src/images/ex-*.svg`, `body-map-*.svg` — отклонённые иллюстрации.
- `server/index.js` — express.static; `PORT = process.env.PORT || 3001`.
- `server/routes/user.js:725` — lessons-filter (добавить image_url при подключении картинок).
- `webpack.config.js` — сборка styles/[name].[contenthash].css, копирует images в dist.
- Скрипты ремапов (история): `%TEMP%\opencode\remap-colors.ps1`, `%TEMP%\opencode\lighten-cabinet.ps1`.
