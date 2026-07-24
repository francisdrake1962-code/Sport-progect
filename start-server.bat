@echo off
cd /d "%~dp0"
echo Starting Qigong server on http://localhost:3001 ...
echo Admin: http://localhost:3001/admin/  (admin@qigong.com / admin123)
echo.
node server/index.js
pause
