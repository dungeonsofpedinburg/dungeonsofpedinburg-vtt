# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Локальный запуск

```bash
npm install
npm run dev:all   # Vite (5173) + sync-сервер (5174) в одном окне
```

* Мастер-панель — http://localhost:5173/master
* Экран для OBS — http://localhost:5173/screen (источник «Браузер»)
* Связь окон — локальный WebSocket-сервер на порту 5174 (`server/index.mjs`)

OBS Browser Source живёт в отдельном процессе CEF, поэтому `BroadcastChannel`
между окном мастера и источником не работает. Состояние выпуска идёт через
WebSocket: сервер держит последний снапшот в памяти и отдаёт его тому, кто
подключился позже — например, только что перезагруженному источнику в OBS.

Отдельные команды, если нужен только один процесс:

```bash
npm run dev          # только Vite (без синхронизации)
npm run sync         # только sync-сервер
npm run preview:all  # собранная сборка + sync-сервер
```

### Адреса и флаги

* `http://localhost:5174/health` — состояние сервера: есть ли снапшот, кто подключён;
* `?sync=ws://192.168.1.5:5174` — адрес сервера вручную (если OBS на другой машине);
* `VITE_SYNC_URL=ws://10.0.0.7:5174` — адрес для собранной сборки;
* `?badge=always` / `?badge=off` — индикатор связи на /screen: показывать всегда или выключить
  (по умолчанию виден, пока связи нет, и гаснет через несколько секунд после подключения);
* `SYNC_PORT`, `SYNC_HOST`, `WEB_PORT` — переопределение портов и адреса прослушивания.

## Проверки проекта

```bash
npm run lint    # oxlint
npm run build   # tsc -b && vite build
npm run smoke   # смоук-тесты стора и хелперов (src/store/syncSmoke.ts) в Node
```

`npm run smoke` поднимает Vite в SSR-режиме и sync-сервер на свободном порту,
затем прогоняет проверки из `src/store/syncSmoke.ts`: стор выпуска, связка
мастера и `/screen` через сокеты (кэш состояния, presence, переподключение),
экспорт/импорт, разделители сцен, саундтрек, геометрия сетки и размер кубиков.

