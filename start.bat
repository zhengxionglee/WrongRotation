@echo off
echo ====================================
echo   Wrong Rotation - Odd Rotation
echo ====================================
echo.
echo Starting game server...
echo.
start /B npx http-server . -p 4173 -c-1 --cors --silent 2>nul
if %errorlevel% neq 0 (
  echo http-server not found. Use 'npm run dev' or 'npm run preview' instead.
  pause
  exit /b
)
timeout /t 2 /nobreak >nul
start http://localhost:4173/game.html
echo Game is running at http://localhost:4173/game.html
echo Press Ctrl+C to stop the server.
pause >nul