@echo off
chcp 65001 >nul
title Odd Rotation Launcher
echo ====================================
echo   Wrong Rotation - Odd Rotation
echo ====================================
echo.

:: Kill any stale process holding our port
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8364 ^| findstr LISTENING') do (
  echo Cleaning up stale process (PID %%a)...
  taskkill /PID %%a /F >nul 2>&1
)

echo Starting game server on port 8364...
start "Odd Rotation Server" cmd /c "npm run dev -- --port 8364 --strictPort & pause"

:: Wait for the server to be ready (up to 15s)
set /a tries=0
:waitloop
timeout /t 1 /nobreak >nul
set /a tries+=1
powershell -Command "try { $null = Invoke-WebRequest -Uri 'http://localhost:8364/' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 goto ready
if %tries% lss 15 goto waitloop
echo Server did not start in time. Check the "Odd Rotation Server" window for errors.
pause
exit /b 1

:ready
start http://localhost:8364
echo.
echo Game is running at http://localhost:8364
echo Close the "Odd Rotation Server" window to stop.
echo.
