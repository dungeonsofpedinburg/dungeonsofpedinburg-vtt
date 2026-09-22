#!/bin/bash
# Запуск мастер-панели Pedinburg на macOS.
# Первый запуск: chmod +x start_mac.command
# Если macOS ругается на «неизвестного разработчика» — ПКМ по файлу → «Открыть».
cd "$(dirname "$0")"

# Зависимости ещё не установлены — ставим их (первый запуск на новой машине).
if [ ! -d "node_modules" ]; then
  echo "Устанавливаю зависимости, это может занять пару минут..."
  npm install
fi

echo ""
echo "  Мастер-панель : http://localhost:5173/master"
echo "  Экран для OBS : http://localhost:5173/screen"
echo "  Связь окон    : ws://localhost:5174 (sync-сервер)"
echo ""
echo "  Загрузка картинок, музыки и видео в assets/ работает из коробки."
echo "  Остановить сервер — Ctrl+C."
echo ""

# npm run dev поднимает Vite и sync-сервер вместе: OBS-источник работает,
# а middleware выгрузки файлов живёт внутри плагина Vite.
npm run dev
