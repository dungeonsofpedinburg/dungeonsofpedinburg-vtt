@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem Зависимости ещё не установлены — ставим их (первый запуск на новой машине).
if not exist "node_modules" (
  echo Устанавливаю зависимости, это может занять пару минут...
  call npm install
)

echo.
echo   Мастер-панель : http://localhost:5173/master
echo   Экран для OBS : http://localhost:5173/screen
echo   Связь окон    : ws://localhost:5174 (sync-сервер)
echo.
echo   Остановить сервер — Ctrl+C в этом окне.
echo.

rem dev:all поднимает Vite и sync-сервер вместе — OBS-источник работает и без BroadcastChannel.
call npm run dev:all

rem Чтобы окно не закрывалось сразу, если сервер упал.
pause
