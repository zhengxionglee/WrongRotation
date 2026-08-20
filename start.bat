@echo off
chcp 65001 >nul
echo ====================================
echo   Wrong Rotation - Odd Rotation
echo ====================================
echo.
echo Building (this may take a moment)...
call npm run build >nul 2>&1
echo Starting game server...
start /B cmd /c "npm run preview 2>nul"
timeout /t 3 /nobreak >nul
start http://localhost:4173
echo.
echo Game is running at http://localhost:4173
echo Close this window to stop the server.
echo.