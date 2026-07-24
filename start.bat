@echo off
echo ========================================
echo  Qigong Server - Start
echo ========================================
echo.

cd /d "%~dp0"

if exist "data\qigong.db" (
    echo [1/2] Deleting old database...
    del /f "data\qigong.db" >nul 2>&1
)

echo [2/2] Starting server on http://localhost:3001
echo.
echo --- Links ---
echo    Admin panel:  http://localhost:3001/admin/
echo    Lessons:      http://localhost:3001/admin/lessons.html
echo    Login:        admin@qigong.com / admin123
echo    API health:   http://localhost:3001/api/health
echo ----------------
echo.
echo Press Ctrl+C to stop server
echo.

node server/index.js
pause
