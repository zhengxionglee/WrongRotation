@echo off
chcp 65001 >nul
echo ====================================
echo   Wrong Rotation - Odd Rotation
echo ====================================
echo.
echo Starting Vite dev server...
start "Odd Rotation" cmd /c "npm run dev & pause"
timeout /t 5 /nobreak >nul
start http://localhost:5173
echo.
echo If the browser doesn't open, try:
echo   http://localhost:5173
echo Close the 'Odd Rotation' window to stop the server.
echo.