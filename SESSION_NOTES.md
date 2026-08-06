# СЕССИОННЫЕ ЗАМЕТКИ — qigong-landing.com

Последнее обновление: 2026-08-06

## Сессия 2026-08-06 — Round 16 (признаки занятий: зоны тела + самочувствие)

## Objective
Выполнить фиче-запрос клиента: справочник признаков «Зона тела» / «Самочувствие» для занятий, привязка к урокам, авто-определение при импорте каталога, и удалить негодную строку 1031. Версия: **5.24.0**.

## Important Details
- Каталог `C:\Users\admin\Downloads\Батч_997_1035.xlsx` импортирован: 35 записей (997–1035), затем удалён №1031 (урок id 31) — сейчас 34 записи, orphan-записей нет.
- К №997/998/999 привязаны локальные видео через `POST /api/admin/lessons/:id/video/local-upload` (файлы из `references/lazyfit-decompiled/...` скопированы в `videos/`): `lesson_997.mp4` 0.61MB, `lesson_998.mp4` 0.79MB, `lesson_999.mp4` 3.16MB; `video_provider='local'`. Отдача `/videos/*` требует stream-токен — уроки 1–3 помечены `is_free=1`.
- Признаки: в xlsx колонок зон/настроений нет (№, название-тема, цель, эффект); клиент выбрал справочник признаков + привязку к занятиям (авто + ручная правка).
- Найдена корневая причина пустоты админки: `loadLessons()` в `src/admin/lessons.html` тянул публичный `GET /api/lessons`, который фильтрует только `status='active'` (импорт создаёт `draft`). Теперь админ-список использует `GET /api/admin/lessons` (все статусы).
- «Самочувствие» в `user.js` фильтровалось только по `tags`; зоны — через `lesson_zones` (таблицы/API были, но не заполнены). Теперь `mood` ищется и в `lesson_moods`, и в `tags`.
- Новая таблица `lesson_moods` (миграция `019_lesson_moods.sql` + базовая схема `server/db.js`): lesson_id, mood, PK, FK `ON DELETE CASCADE`, индекс.
- `inferLessonFeatures()` — эвристика по теме/цели/эффекту: 8 зон, 4 настроения, фолбэк зоны `баланс_общее`.
- TDD: `tests/lesson-features.test.js` (`TEST_PORT=3013`): 11 тестов. Замечание: `--randomize` перемешивает порядок тестов внутри файла — picker-тесты сделаны самодостаточными (создают свой активный урок). CRUD `POST` возвращает `201`, не `200`.
- Итог: **1021/1021 тестов, 21 suite** (randomized); lint 0/0; build OK.

## Work State
### Completed
- Round 16: справочник зон/настроений + авто-классификация + `lesson_moods` + API (`GET /api/lesson-features`, `PUT /api/lessons/:id/moods`, `GET /api/admin/lessons`, фильтр mood/zone) + админка (список всех статусов, колонка «Самочувствие», чекбоксы) + picker подгрузка справочника.
- Урок №1031 удалён; orphan-записей нет. Импортированный каталог перезаписан признаками (34 записи).
- Документация: `CHANGELOG.md` [5.24.0], `PROGRESS.md`, `SESSION_NOTES.md`, `package.json` 5.23.0→5.24.0.

### Pending / Next
1. **Заполнение каталога (ручная работа клиента)** — загрузка файлов (имя файла ↔ №), занятия, комплексы, календарь, формы; проверить/поправить зоны и настроения после авто-классификации.
2. **Отладка на одном видеофайле** — плеер, гейты доступа (trial/free/paid), прогресс.
3. **Тестовая почта** — пока `console`-лог; позже Gmail App Password / Mailpit (нужна generic SMTP в mailer.js) / Resend.
4. **Mux** — клиент зарегистрируется; заполнить ключи (all-or-none + signing pair), перевести уроки на `provider='mux'`.
5. **Оплата** — отложена до полной готовности (Stripe Price IDs, webhook).
6. **Аудит (когда вернёмся)**: OBS-001 (payment в `audit_log`), admin `{error}` legacy, ARC-001 NOT WIRED, CSP `unsafe-inline`, `hero-poster.jpg` 2.55 MiB.

---

## Сессия 2026-08-06 — Round 15 (локальная загрузка видео, каталог без Mux/Stripe/email)

## Objective
По запросу клиента: отложить заполнение email/Mux/платёжных реквизитов и сделать работу с каталогом без внешних сервисов — чтобы можно было загружать видеофайлы, составлять занятия и календарь, заполнять формы. Клиент: «мы сначала начнём с каталога… далее уже будем отлаживать на одном файле видео… платёжные реквизиты пока отложим». Тестовая почта — пока `console`-лог. Версия: **5.23.0**.

## Important Details
- **Что уже работало без настройки**: каталог (CRUD занятий/комплексов, обложки через `POST /api/upload`), локальное видео (`provider='local'` + `video_url='/videos/…'`, защита stream-токеном), календарь (`lessons.date`), почта (дефолт `MAIL_PROVIDER=console` — письма в лог сервера).
- **Пробел под задачу «загружать файл»**: видео нельзя было загрузить файлом из админки — только Mux (нужны ключи) или вручную (файл в `videos/` + URL вручную). Добавлен эндпоинт локальной загрузки.
- **DA-59 / фича**: `POST /api/admin/lessons/:id/video/local-upload` (multipart `file` + `language`): multer disk-storage → `videos/` (переопределяемо через `VIDEOS_DIR` для тестов), строка `video_uploads` (`provider='local'`, `status='ready'`, `original_filename`, `file_size`), `lessons.video_url`/`video_provider='local'`/`video_id=NULL`, `lesson_media` upsert, аудит, чистка файла/строки при ошибках (отсутствующий урок не оставляет orphan-файл). `videosDir` вынесен наверх `server/index.js` и переиспользуется роутом отдачи `/videos/{*splat}`.
- **Admin UI**: блок «Локальный файл (без Mux)» в `src/admin/js/stream-upload.js` — выбор файла, прогресс-бар, URL подставляется в «URL видео», сообщение «нажмите Сохранить». Mux-секция не тронута. `lessons.html` уже вычисляет `video_provider` из заполненного URL (правки не потребовались).
- **TDD**: 8 новых тестов в `tests/admin-video-uploads.test.js` (auth 401, role 403, invalid id, unsupported ext, upload+link в БД и на диск, 404 lesson, no orphan file, replace previous fields). RED → реализация → GREEN.
- Итог: **1010/1010 тестов, 20 suites** (randomized); lint 0; build OK.

## Work State
### Completed
- Round 0 baseline: `npm run test:ci` 1010/1010 (после фичи; до фичи 1002/1002).
- Фича локальной загрузки видео + 8 тестов + админ-блок.
- Документация: `CHANGELOG.md` [5.23.0], `PROGRESS.md` (шапка + git log + NEXT ACTIONS + приоритет клиента), `SESSION_NOTES.md`, `package.json` 5.22.0→5.23.0.

### Pending / Next
1. **Заполнение каталога (ручная работа клиента)** — загрузка файлов (имя файла ↔ № в каталоге), занятия, комплексы, календарь, формы.
2. **Отладка на одном видеофайле** — плеер, гейты доступа (trial/free/paid), прогресс.
3. **Тестовая почта** — пока `console`-лог; позже Gmail App Password / Mailpit (нужна generic SMTP в mailer.js) / Resend.
4. **Mux** — клиент зарегистрируется; заполнить ключи (all-or-none + signing pair), перевести уроки на `provider='mux'`.
5. **Оплата** — отложена до полной готовности (Stripe Price IDs, webhook).
6. **Аудит (когда вернёмся)**: OBS-001 (payment в `audit_log`), admin `{error}` legacy, ARC-001 NOT WIRED, CSP `unsafe-inline`, `hero-poster.jpg` 2.55 MiB.

---

## Прошлые сессии — 2026-08-06 (Devil's Advocate Round 14)

## Objective
Продолжить цепочку аудита по `docs/IMPROVEMENT_TZ.md` (P0/P1 закрыты в Rounds 4–13). Начать с baseline `npm run test:ci` → оказалось **51 падение**. Докопаться до корневой причины, исправить по TDD, обновить документацию, закоммитить и запушить. Версия: **5.22.0**.

## Important Details
- **Ложный red**: baseline упал 51 тестом (пустой каталог, 401 логин admin). Корневая причина — **стейл dev-сервер (PID 20648) из прошлой сессии на `:3001`**: `backend.test.js` ходил на `127.0.0.1:3001` (жёстко зашитый дефолтный порт), попадал на старый сервер (пустой каталог после миграции 015, admin с другим паролем). Убил процесс → `npm run test:ci` = **998/998**.
- **DA-56**: перенёс `backend.test.js` на выделенный порт **3012** (конвенция: payment 3004, i18n 3005, mux 3008, uploads 3010), `apiRequest` читает `TEST_PORT`; регресс-тест «Port isolation» (не 3001). Это единственный тест-файл, который использовал дефолтный порт.
- **DA-58 (DB-002/PAY-001)**: `handlePaymentFailed` писал `plan` подписчика в `payments.plan`, а CHECK там только `('monthly','annual')`. У подписчика с `plan='trial'` событие `invoice.payment_failed` падало с `CHECK constraint failed` внутри webhook-транзакции → откат → вечный retry Stripe. Фикс: маппинг `trial→monthly` (как в `adminGrantAccess`).
- **DA-57 (ARCH-001)**: `FEATURE_REGISTRY.md` ссылался на удалённый `server/services/schedule.service.js` (удалён в v5.10.0) и писал «Last updated: v4.1.0». Добавлен тест целостности ссылок (каждый `server/**/*.js`-референс должен существовать), удалена строка F126, шапка → v5.21.1.
- Итог: **1002/1002 тестов** (998 + 1 порт + 1 trial + 2 registry), lint 0.

## Work State
### Completed
- Round 0 baseline: `npm run test:ci` 998/998 (после остановки стейл-сервера).
- DA-56 (порт 3012 + тест изоляции), DA-58 (trial→monthly в `payment.service.js:283-299`), DA-57 (integrity-тест + чистка реестра).
- Документация: новый `AUDIT_REPORT_2026-08-06.md` (Round 14), `CHANGELOG.md` [5.22.0], `PROGRESS.md` (шапка + git log + NEXT ACTIONS), `SESSION_NOTES.md`, `package.json` 5.20.0→5.22.0.

### Pending / Next
1. **OBS-001**: payment-действия (checkout/оплата/подписка) не пишутся в `audit_log` — только app-лог; нужен transaction-aware insert внутри webhook-транзакции (не вызывать `saveDb()` в открытой транзакции).
2. **API-001 остаточный**: admin/CRUD эндпоинты `server/index.js` на legacy string `{error}`.
3. **ARC-001**: `auth/progress/feedback.service.js` + `repositories/` существуют, но `NOT WIRED`.
4. **Долги**: CSP `unsafe-inline`; `hero-poster.jpg` 2.55 MiB; NFR-001 метрики (p95/RTO/build budget).
5. **Продакшн**: Stripe Price IDs + Mux keys; залить каталог заново (после 015 пуст).
6. **Осторожно**: не оставлять dev-сервер на `:3001` при тестах.

---

## Прошлые сессии — 2026-08-05 (Mux-only)

## Objective
Полностью вычеркнуть Cloudflare Stream из кода, БД, админки и документации. `cf_video_uid` → `video_id` во всех таблицах. Mux — единственный стриминг-провайдер. Каталог занятий очищен (миграция 015) для перезапуска.

## Important Details
- `video_provider`: `mux` (стриминг, playback id в `video_id`) | `local` (self-hosted `video_url`). Дефолт в коде/миграциях — `mux`, у seed-уроков — `local`. Значений `cloudflare` больше нет нигде в коде.
- Миграции 014/015 **применены** к `data/qigong.db` (бэкапы: `data/backups/pre-migration-2026-08-05T16-49-57-423Z.db` и `16-50-26-745Z.db` — состояние до rename). Каталог пуст (0 уроков), комплексы/подписчики не тронуты.
- `runMigrations` укреплён: вырезает `--` комментарии перед сплитом по `;` (в 014 был `;` в комментарии — парсер падал); `ALTER TABLE ... RENAME COLUMN` с «no such column» — no-op (иначе свежая БД с уже новой схемой в db.js падала).
- Миграции 006/007: дефолт `video_provider`/`provider` изменён `cloudflare` → `mux` (актуально для свежих БД; на проде 007 уже применён — дефолт в схеме старый, но код всегда пишет провайдер явно).
- ВАЖНО: параллельный `npm test` флейкает (общая `data/qigong.test.db` между воркерами) — полный прогон только `npm run test:ci` (`--runInBand --randomize --forceExit`): сегодня **998/998**, lint 0, build OK.
- Продовый админ-пароль: `admin@qigong.com` / `admin123admin123` (из `.env` BOOTSTRAP_ADMIN_PASSWORD; дефолтный `admin123` автоудаляется). Подписчики: `maria@example.com`/`password123` и др.
- Порт/логи/кракозябры в консоли — как раньше (см. ниже). Сервер на `:3001` перезапущен (единственный свежий процесс).

## Work State
### Completed
- Миграции: `014_video_id.sql` (rename `cf_video_uid`→`video_id` на `lessons`/`lesson_media`/`video_uploads`/`lesson_versions` + индекс `idx_video_uploads_video_id`), `015_clear_catalog.sql` (очистка каталога + сброс `sqlite_sequence`).
- Сессия 2026-08-06: `016_provider_default_mux.sql` — пересоздание `lessons`/`lesson_media`/`video_uploads` с DEFAULT `'mux'` (был `'cloudflare'`, т.к. 006/007 применились до решения). ВАЖНО: первая редакция 016 потеряла колонку `theme` в `lessons` (свежие БД и прод падали с «no such column: theme») — исправлено `017_restore_lessons_theme.sql` (+ добавлен `theme` в саму 016). Применены к проду, прод-схема проверена.
- `server/services/stream.js` — только Mux (без CF-модуля, `processReadyVideo`, ES256). `server/index.js` / `server/routes/user.js` / `content-version.service.js` — `video_id`, `test-mux` вместо `test-stream`, ключи настроек без `cf_stream_*`.
- Админка: `settings.html` (только блок Mux), `lessons.html` (`f-video-id`, селект «Хостинг» удалён), `stream-upload.js` (Mux-only).
- Тесты обновлены: `backend.test.js` (503-кейс stream-token для mux-урока), `stream-mux.test.js` (503 без конфига + подписанный URL + local → null), `admin-video-uploads.test.js`, `i18n.test.js`. **998/998** (`npm run test:ci`), lint 0, build OK.
- Smoke: `GET /api/lessons` → `total:0`, без `cf_video_uid`; `stream-token/1` (mux, без конфига) → 503 `STREAMING_NOT_CONFIGURED`; `POST /api/settings/test-mux` → 200 `{configured:false,...}`. Тестовый урок с Mux `video_id` вставлен и удалён.
- Документация: `CHANGELOG.md` (5.21.0), `VERIFICATION.md`, `TESTING_GUIDE.md`, `README.md`, `PROGRESS.md`, `EXTERNAL_SERVICES_PLAN.md`, `DB_RUNBOOK.md`, `docs/API.md`, `docs/openapi.yaml`, `docs/ARCHITECTURE.md`. Остатки Cloudflare остались только как история в CHANGELOG/AUDIT.

### Pending / Next
1. При настройке Mux: вписать `MUX_*` в `.env` (или settings-админку) и проверить `POST /api/settings/test-mux` → `configured:true`, затем залить реальное видео (Direct Upload) и проверить подписанный HLS в плеере.
2. Залить каталог заново (админка / `import.html` / скрипт `server/scripts/import-catalog.js`).
3. УРОК ИЗ 016: при пересоздании таблиц миграциями проверять ПОЛНУЮ паритетность колонок (не только дефолты/индексы) — потеря `theme` всплыла только в тестах.
4. Из прошлых сессий: картинки упражнений (комплекс на стуле) — ждёт решения пользователя.

---

## Прошлые сессии — 2026-08-03 (mindful redesign)

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
- 2026-08-06: поле `lessons.audience` («Кому подойдёт занятие»): миграция `018_lesson_audience.sql` (применена к проду), `audience` в базовой схеме `db.js`, в `/api/lessons` и CRUD-полях (`server/index.js`). Админка `src/admin/lessons.html` — поле «Кому подойдёт». `src/pages/player.html` — на странице занятия (до запуска видео) блоки «Цель» + «Кому подойдёт» рядом с эффектом. `src/pages/lessons.html` — колонка «Кому подойдёт» в карточке каталога + строка «👥 …» в карточке «Сегодня». **998/998**, lint/build OK. Структура описаний урока: наименование → `title`/`theme`, цель → `goals`, эффект → `effect_description`, кому → `audience`; «как проходит практика» отдельным полем НЕ заводили (дублирует эффект).
- Лендинг (src/index.html + main.css + fonts) — готов, одобрен.
- Последний коммит: `e61f8aec2 feat(ui): mindful warm redesign — landing approved, cabinet light theme`. Рабочее дерево чистое (мои новые файлы пока не коммитились).
- ВАЖНО (сегодня): `npm run test:ci` дал 44 failed (backend.test.js: Stripe not configured, 429 rate-limit). Проверено на чистом HEAD — падает и без изменений (102 failed) → флейк/среда, НЕ связано с витриной. Раньше было 999/999 — вероятно, изменился .env (STRIPE_SECRET_KEY=sk_test_placeholder) или состояние rate-limit.
- Кабинет: зелёная тёмная гамма → тёплая тёмная → **светлая тёплая** (сегодня). Всё собрано: `npm run build` OK, `npm run lint` чисто, `npm run test:ci` 999/999 passed, сервер перезапущен, страницы отдают светлую тему.
- Светлые подстраницы (faq, terms и др.) — плейсхолдеры/noscript в светлой гамме.
- SVG-иллюстрации ex-*.svg (8 шт.) и body-map-*.svg (2 шт.) созданы в src/images/, в dist — но НЕ подключены к страницам и отклонены пользователем (см. выше).
- `lessons.image_url` / `complexes.image_url` есть в БД, но `/api/user/lessons-filter` (server/routes/user.js:725) его НЕ возвращает — если будем подключать картинки, добавить поле в SELECT.

### Pending / Next
1. **Дизайн картинок к упражнениям** — ждёт решения пользователя (после появления комплекса на стуле, либо сам подберёт фото, либо скажет, где взять).
2. Если подключать картинки: добавить `image_url` в SELECT `/api/user/lessons-filter`, вывести миниатюры в `picker.html` и `lessons.html`, заполнить `image_url` в БД.
3. Решить судьбу `src/images/ex-*.svg` и `body-map-*.svg` (удалить или перерисовать под стоячие позы / карту тела — карта тела актуальна независимо от стула).
4. По желанию: переоформить админку под ту же палитру.

## Витрина референсов — ВНЕ проекта: `C:\Users\admin\Documents\Competitors\`
- **Полностью отделена** от qigong-landing (решение пользователя). Каждый конкурент — в своей папке со **своим сервером на своём порту** (чистый Node, без зависимостей):
  - `yogago\` → порт **3002** (живой SPA, статика + SPA-fallback + встроенный прокси на реальный API listokcrm);
  - `mwh\` → порт **3003** (статика: 256 экранов из XML + 8 скриншотов);
  - `lazyfit\` → порт **3004** (статика: 634 экрана из XML).
- **Запуск**: `start-all.bat` (все три) или `start-yogago.bat` / `start-mwh.bat` / `start-lazyfit.bat` (внутри папки). Каждый скрипт убивает старый слушатель порта перед стартом и открывает браузер. Автозапуск при входе в Windows — НЕ ставим (решение пользователя).
- **Телефон по Wi-Fi**: `http://192.168.0.12:3002/` (YOGAGO), `:3003/` (MWH), `:3004/` (LazyFit). Фаервол-правила 3002/3003/3004 — `Competitors\setup-firewall.bat` (от администратора, один раз; в проекте удалён).
- В проекте удалено: `ref-viewer/`, `server/routes/refViewer.js`, `start-refs.*`, `setup-firewall.bat`, `tools/ref-viewer/`. Из `server/index.js` убраны `require('./routes/refViewer')`, `app.use('/ref'...)`, `app.use('/ref-yogago-proxy'...)`. Порт 3001 и `/api/health` — в порядке (проверено после перезапуска).
- Пересборка MWH/LazyFit: `Competitors\tools\build.js` (ждёт исходники в `Competitors\references\` — при необходимости скопировать из проекта). Хаб не генерится — навигация по README.md.

## YOGAGO.MD — живое приложение (порт 3002)
- Копия оригинального WebView-бандла (Quasar/Vue SPA «ListokMobile») из APK, baseURL пропатчен `https://an7216.listokcrm.ru/api/mobile/v1` → `/ref-yogago-proxy/api/mobile/v1`, прокси в `yogago\server.js` гоняет запросы на реальный API listokcrm (нужен интернет). Работает без логина (`demandLoginInLK=false`). Вход/кабинет: только по SMS-коду (демо-кодов нет), расписание/новости смотреть можно и без него.
- **Причина пустых страниц (была исправлена)**: повреждение кодировки (UTF-8/CP1251 → кириллица-мусор, acorn fail). Чистый источник — APK (`references/yogago.apk`, `assets/www`), заменено целиком. Пропатчены 2 файла: `index-r-smMR7e.js` (`jm` default + интерцептор `Ee` с `Qe().domain`) и `index.da57d7bf.js` (`Lm` default + интерцептор `Ce` с `ze().domain`).
- **Диалог «gap_init:3» (был исправлен)**: настоящий `cordova.js` звал `prompt('','gap_init:...')` (Android-мост) → пропатчен: `androidExec.init` без `bridgeSecret` (сразу `onNativeReady.fire()`), убран throw-гард, `var msgs = nativeApiProvider.get().exec(...)` → `null`. Мост не дёргается, плагины грузятся, `deviceready` срабатывает, `window.cordova` определён.
- **Роутер**: `createWebHistory("")` → статику отдавать ТОЛЬКО из корня. `server.js` отдаёт SPA на `/` (SPA-fallback без `app.get('*')`), прокси на `/ref-yogago-proxy`.
- **Проверено после переноса**: 3002/3003/3004 — 200, `assets/index-r-smMR7e.js` и `index.da57d7bf.js` — 200, прокси `/ref-yogago-proxy/api/mobile/v1/common/settings` — 200.
- **Внешние ссылки бокового меню (исправлено сегодня)**: «Тренировки в подарок»/«Курс YOGA START»/«Цены»/«Правила студии» не открывались, т.к. `openUniversalUrl-BeVz2e5G.js` (и `openUniversalUrl.d861132d.js`) звали `cordova.InAppBrowser.open(...)` — плагина нет без моста → `undefined` → исключение в addEventListener. Пропатчены обе копии: убрана ветка InAppBrowser, используется `window.open(s, "_blank")` с `String(s).trim()` (у URL в настройках пробелы на конце: `/rules `, `/price `, `/yogastart `, `/promotion`). `node --check` OK.
- **MWH**: `http://localhost:3003/` — 256 экранов (реконструкция из XML) + 8 скриншотов (`/screenshots.html`). Скриншоты — главный источник правды; XML-рендер даёт скелеты (контент в RecyclerView динамический).
- **LazyFit**: `http://localhost:3004/` — 634 экрана из XML. Переходы извлечь нельзя: навигация динамическая (Class.forName + AB-тесты).
- Рендерер layout→HTML: LinearLayout/flex, Frame/Constraint/Relative приближённо, TextView/Button/Image/EditText, цвета/строки/размеры из resources, включения `<include>`.
- **Рендерер обновлён (сегодня)**: `0dp` по width → `100%`, по height → `100%` (контейнеры) / `auto` (иначе) — пустые экраны MWH/LazyFit (были «только рамка телефона») теперь показывают контент. Картинки рендерятся как `<img src="../img/<файл>">` через `findRaster(ctx, name)` (ищет файл в `drawable*` по имени ресурса, без имени_layout-префикса): MWH — 8 экранов с картинками (5 файлов в `img/`), LazyFit — 25 экранов (28 файлов).
- **Переходы MWH извлечены** (`tools/lib/nav.js`, `extractNavTransitions`): парсит navigation-графы в `references\mwh-res\resources\res\navigation\` (23 XML: `home_graph`, `explore_graph`, `nutrition_graph`, `lifestyle_graph`, `profile_graph`, `auth_graph`…), `action/@app:destination` + табы BottomNavigation. Переходы с читаемыми label (`Subscription Options Screen`, `Explore Screen`…) у 6 экранов: `fragment_explore`, `fragment_home`, `fragment_life_style_detail`, `fragment_nutrition`, `fragment_personal_info`, `fragment_send_password_link`. `fragment_home` → subscription/explore/nutrition/lifestyle. LazyFit — переходов нет (динамическая навигация, `extractTransitions` = 0).
- `activity_main` (MWH) остаётся каркасом `NavHostFragment`+`BottomNavigationView` — это осознанно, контент во фрагментах.
- **ГЛАВНЫЙ БАГ РЕНДЕРЕРА (исправлен сегодня)**: `lib/xml.js` обрабатывал самозакрывающиеся теги (`<View/>`, `<include/>`) как контейнеры — `if (selfClosing) return` стоял ПОСЛЕ цикла парсинга детей, и весь контент после первого самозакрывающегося элемента проглатывался как его «дети». Т.к. `<include/>` всегда самозакрывающийся — почти все экраны MWH/LazyFit рендерились пустыми. Фикс: ранний return сразу после `/>`. После фикса `fragment_explore` (был 0 символов) рендерит шиммеры/заголовки, картинки в 11 MWH и 40 LazyFit экранах (MWH 7 файлов img, LazyFit 57 файлов).
- Пустые экраны теперь показывают пояснение «контент грузится рантаймом» вместо пустой рамки: MWH 45/256, LazyFit 503/634 (последнее честно — ComposeView/FragmentContainerView/ViewStub). LazyFit — в основном «кодовое» приложение.
- Index-страницы: акцентный заголовок (MWH #8a6f52, LazyFit #005f45), описание, галерея настоящих скриншотов, раздел «Экраны с изображениями из ресурсов», `hub.html` (JS подставляет IP телефона, ссылки на оба приложения).
- **LazyFit = «LazyFit: Chair Yoga & Pilates»** (Next Vision Limited): стульная йога, пилатес (bed/mat/wall), тайцзи, ходьба — целевая аудитория пожилые/новички, ПРЯМО релевантно qigong-landing. Скачаны 6 настоящих скриншотов с APKPure в `references/lazyfit-screenshots/` (валидные JPEG, пакет подтверждён base64 в URL CDN). MWH-скриншоты на APKPure — те же 8, что уже были.
- Источник скриншотов: APKPure (Play Store из этой сети недоступен — блокирует; websearch 403; Bing за капчей; Aptoide/uptodown/appbrain не имеют этих приложений). CDN APKPure: `image-eo.winudf.com` (через curl с UA+Referer apkpure.com).
- Пересборка: `node tools/build.js` из `Competitors\` — MWH 256 + 8 скриншотов, LazyFit 634 + 6 скриншотов. Скрипты старта: `start-all.bat` / `start-mwh.bat` / `start-lazyfit.bat`.

## Reference-материалы (в репозитории, для изучения решений конкурентов)
- `references/yogago-decompiled` + `yogago-decompiled-real` — **YOGAGO.MD** (listok.yogago), нативное приложение (jadx, sources+resources; real — повторная декомпиляция, sources обфусцированы a00…). + `references/yogago.apk`. Важно: это WebView/Cordova-приложение — весь UI лежит в `assets/www` (тот же бандл, что в `ref/yogago`).
- `references/lazyfit-decompiled` — **LazyFit** (com.mejordailytracker.app, движок Glority, код в com/glority), jadx sources+resources. + `references/lazyfit.apk`. (Это НЕ Chair Yoga for Seniors.)
- `references/mwh-decompiled` (sources, обфусц.), `references/mwh-res` (resources, layouts здесь), `references/mwh-xapk` (base+config splits), `references/mwh-screenshots` (8 шт) — **MWH / Melissa Wood Health** (com.melissawoodhealth).
- `ref/melissa` — APK Мелиссы (манифест бинарный, без декомпилятора не читается) + `ref/yogago` — Cordova-сборка.
- `references/logpress-public` — **LogPress** (React Native 0.80, TS, «публичная» версия fitness-трекера с AI-счётчиком) — хороший образец RN-структуры/offline.
- `references/jadx` — сам декомпилятор jadx (бинарник).
- Вывод: в репо НЕТ кода именно «Chair Yoga for Seniors» (net.workoutinc.*) — похоже, пользователь имел в виду один из вышеперечисленных (вероятнее YOGAGO.MD или LazyFit). Уточнить при следующем разговоре про картинки.
- `references/lazyfit-decompiled` — **LazyFit** (com.mejordailytracker.app), jadx sources+resources. + `references/lazyfit.apk`. (Это НЕ Chair Yoga for Seniors.)
- `references/mwh-decompiled` (sources), `references/mwh-res` (resources), `references/mwh-xapk` (base+config splits), `references/mwh-screenshots` — **MWH / Melissa Wood Health** (com.melissawoodhealth).
- `ref/melissa` — APK Мелиссы (манифест бинарный, без декомпилятора не читается) + `ref/yogago` — Cordova-сборка.
- `references/logpress-public` — **LogPress** (React Native 0.80, TS, «публичная» версия fitness-трекера с AI-счётчиком) — хороший образец RN-структуры/offline.
- `references/jadx` — сам декомпилятор jadx (бинарник).
- Вывод: в репо НЕТ кода именно «Chair Yoga for Seniors» (net.workoutinc.*) — похоже, пользователь имел в виду один из вышеперечисленных (вероятнее YOGAGO.MD или LazyFit). Уточнить при следующем разговоре про картинки.

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
