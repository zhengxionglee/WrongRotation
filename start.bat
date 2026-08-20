@echo off
echo ====================================
echo   Wrong Rotation - Odd Rotation
echo ====================================
echo.
echo Starting game server...
echo Open http://localhost:4173 in your browser
echo.
start /B npx http-server . -p 4173 -c-1 --cors
timeout /t 2 /nobreak >nul
start http://localhost:4173/game.html
echo Press Ctrl+C to stop the server.
pause