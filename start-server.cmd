@echo off
cd /d "C:\Users\admin\Documents\Default Project"
set JWT_SECRET=dev-secret-key-not-for-production-32chars
set ALLOWED_ORIGIN=http://localhost:3001
set BOOTSTRAP_ADMIN_EMAIL=admin@qigong.com
set BOOTSTRAP_ADMIN_PASSWORD=admin123admin123
set STRIPE_SECRET_KEY=sk_test_placeholder
set STRIPE_WEBHOOK_SECRET=whsec_placeholder
set NODE_ENV=development
node server/index.js
