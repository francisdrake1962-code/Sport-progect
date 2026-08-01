# Деплой — Qigong Platform

## Предпосылки

- Node.js >= 18.x
- npm >= 9.x
- ОС: Linux, macOS, Windows

## Быстрый старт (development)

```bash
git clone https://github.com/francisdrake1962-code/Sport-progect.git
cd Sport-progect
npm install
npm run dev
```

Сервер стартует на `http://localhost:3001`.

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3001` | Порт сервера |
| `NODE_ENV` | `development` | Режим (`development`/`test`/`production`) |
| `JWT_SECRET` | *(обязательно)* | Секрет для подписи JWT токенов |
| `ALLOWED_ORIGIN` | `http://localhost:3001` | CORS origins через запятую |
| `APP_BASE_URL` | `http://localhost:3001` | Базовый URL приложения |
| `MAIL_PROVIDER` | `console` | Провайдер email (`console`/`gmail`/`resend`) |
| `GMAIL_USER` | — | Gmail SMTP user |
| `GMAIL_PASS` | — | Gmail SMTP password |
| `RESEND_API_KEY` | — | Resend API key |
| `STRIPE_SECRET_KEY` | — | Stripe secret API key |
| `STRIPE_WEBHOOK_SECRET` | — | Stripe webhook signing secret |
| `STRIPE_MONTHLY_PRICE_ID` | — | Stripe Price ID for monthly plan |
| `STRIPE_ANNUAL_PRICE_ID` | — | Stripe Price ID for annual plan |

### Production env файл

```bash
# .env (НЕ коммитить!)
NODE_ENV=production
PORT=3001
JWT_SECRET=<сгенерировать-64-символа>
ALLOWED_ORIGIN=https://qigong-landing.com
APP_BASE_URL=https://qigong-landing.com
MAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
STRIPE_MONTHLY_PRICE_ID=price_xxxxxxxxxxxx
STRIPE_ANNUAL_PRICE_ID=price_xxxxxxxxxxxx
```

## Production деплой

### 1. Сборка

```bash
npm ci --production
npm run build
```

### 2. Запуск

```bash
node server/index.js
```

Сервер:
- Создаёт `data/qigong.db` при первом запуске
- Seeds данные (20 уроков, 5 комплексов, 5 подписчиков, admin)
- Включает WAL mode для SQLite

### 3. systemd (Linux)

```ini
# /etc/systemd/system/qigong.service
[Unit]
Description=Qigong API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/qigong
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3001
EnvironmentFile=/opt/qigong/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable qigong
sudo systemctl start qigong
```

### 4. Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name qigong-landing.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name qigong-landing.com;

    ssl_certificate /etc/letsencrypt/live/qigong-landing.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/qigong-landing.com/privkey.pem;

    client_max_body_size 50m;

    # Static files
    location / {
        root /opt/qigong/dist/public;
        try_files $uri $uri/ /index.html;
    }

    location /admin/ {
        root /opt/qigong/dist;
        try_files $uri $uri/ /admin/index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Video files
    location /videos/ {
        proxy_pass http://127.0.0.1:3001;
    }

    # Uploads
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
    }
}
```

## Тестирование

```bash
# Все тесты
npm test

# Только E2E
npx jest tests/e2e.test.js

# Только security
npx jest tests/security.test.js

# Только regression Round 1
npx jest tests/regression.test.js

# Lint
npx eslint server/

# Build
npm run build
```

## CI/CD (GitHub Actions)

`.github/workflows/ci.yml` включает:

1. Install dependencies
2. Lint (0 errors required)
3. Security tests
4. Backend tests
5. Admin tests
6. Pages tests
7. Components tests
8. E2E tests
9. Regression tests
10. Build check

## Мониторинг

### Health endpoints

```bash
# Простой health check
curl http://localhost:3001/api/health

# Readiness probe (Kubernetes)
curl http://localhost:3001/api/ready

# Детальный health (требует admin)
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/health/detailed
```

### Логи

Сервер использует структурированные логи через `server/helpers/logger.js`:

```json
{
  "timestamp": "...",
  "level": "info",
  "component": "http",
  "message": "GET /api/lessons 200",
  "meta": { "method": "GET", "url": "/api/lessons", "status": 200, "duration": "45ms" }
}
```

Уровни: `debug`, `info`, `warn`, `error`

## Бэкапы

SQLite файл: `data/qigong.db`

```bash
# Рекомендуется: копировать при остановленном сервере
cp data/qigong.db data/qigong.db.bak.$(date +%Y%m%d)
```

При запущенном сервере `saveDb()` имеет 300ms debounce. Для безопасного бэкапа:

```bash
# Graceful shutdown
kill -SIGTERM $(pgrep -f "node server/index.js")
# Wait 2 seconds
cp data/qigong.db /backup/qigong.db
# Restart
systemctl start qigong
```

При миграциях сервер автоматически создаёт снапшот `data/backups/pre-migration-<ts>.db` до изменения схемы. Полный runbook восстановления и каталог миграций: `docs/DB_RUNBOOK.md`.

## Сброс данных (development)

```bash
rm data/qigong.db
# При следующем запуске данные пересоздадутся автоматически
```
