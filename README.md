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
npm run dev       # Vite (5173) + sync-сервер (5174) в одном окне
```

`npm run dev` поднимает всё, что нужно для работы: и интерфейс, и связь окон, и
сохранение файлов выпуска на диск. Исторический псевдоним `npm run dev:all`
делает то же самое, а `start_windows.bat` / `start_mac.command` просто вызывают
`npm run dev` — отдельных команд для загрузки картинок, музыки и видео не нужно.

* Мастер-панель — http://localhost:5173/master
* Экран для OBS — http://localhost:5173/screen (источник «Браузер»)
* Связь окон — локальный WebSocket-сервер на порту 5174 (`server/index.mjs`)

OBS Browser Source живёт в отдельном процессе CEF, поэтому `BroadcastChannel`
между окном мастера и источником не работает. Состояние выпуска идёт через
WebSocket: сервер держит последний снапшот в памяти и отдаёт его тому, кто
подключился позже — например, только что перезагруженному источнику в OBS.

Отдельные команды, если нужен только один процесс:

```bash
npm run dev          # Vite + sync-сервер (то же, что dev:all)
npm run dev:all      # псевдоним предыдущей команды
npm run sync         # только sync-сервер
npm run preview      # собранная сборка + sync-сервер
```

### Адреса и флаги

* `http://localhost:5174/health` — состояние сервера: есть ли снапшот, кто подключён;
* `?sync=ws://192.168.1.5:5174` — адрес сервера вручную (если OBS на другой машине);
* `VITE_SYNC_URL=ws://10.0.0.7:5174` — адрес для собранной сборки;
* `?badge=always` / `?badge=off` — индикатор связи на /screen: показывать всегда или выключить
  (по умолчанию виден, пока связи нет, и гаснет через несколько секунд после подключения);
* `SYNC_PORT`, `SYNC_HOST`, `WEB_PORT` — переопределение портов и адреса прослушивания.

## Папка assets: выпуски и кэш вне Git

Корневая папка `assets/` разделена на две строгие зоны:

* **`assets/episodes/`** — постоянное хранилище выпусков. Сюда вручную складывают
  готовые папки (`assets/episodes/ep-01/`), внутри каждой — свой `episode.json`
  и подпапки `scenes/`, `characters/`, `music/`. Директорию удалять нельзя:
  в неё пишет только человек, приложение к ней не притрагивается.
* **`assets/cache/`** — временный кэш приложения. Сюда автоматически ложатся
  любые файлы, загруженные «на лету» из интерфейса (`POST /__pedinburg/assets`,
  выгрузка Base64, видео-фоны): `assets/cache/scenes/`, `assets/cache/characters/`,
  `assets/cache/music/`, `assets/cache/soundpad/`, `assets/cache/videos/`.
  Папку можно полностью стереть в любой момент — подкаталоги создадутся заново
  при первой выгрузке.

В репозиторий не попадает ни то, ни другое: в `.gitignore` стоят
`assets/episodes/*` и `assets/cache/*` (пустые каталоги переживают клонирование
благодаря `.gitkeep`, гигабайты видео — нет). Системные ассеты проекта
(плейсхолдеры и раздача кубиков) лежат в `public/` и не затрагиваются.

Пути из файлов выпуска, собранных до разделения зон (`/assets/scenes/...`),
продолжают работать: сервер ищет такой файл внутри `assets/cache/`.

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
Вторая фаза (`scripts/smoke-assets.mjs`) поднимает настоящий HTTP-сервер Vite и
проверяет раздачу `assets/`: кириллица, пробелы и «№» в пути, имена в форме NFD
(macOS), Range-запросы, выгрузку файла в `assets/cache/` и отсечение выхода за
папку кэша.

## Выпуск: JSON + папка assets

Файл выпуска (`episode.json`) весит десятки-сотни килобайт: в нём только текст —
разметка заметок, координаты токенов 15×6 и относительные пути к ассетам
(`/assets/episodes/ep-01/scenes/forest.jpg` или `/assets/cache/scenes/forest.jpg`).
Base64 (`data:...`) в JSON не пишется никогда: картинки и музыка лежат отдельными
файлами в корне `assets/`.

* **Экспорт** («Экспортировать выпуск») выгружает выбранные в панели картинки и
  треки через локальный сервер (`vite.config.ts`, плагин
  `pedinburg:serve-episode-assets`, POST `/__pedinburg/assets`) в папку кэша
  `assets/cache/` и только потом собирает JSON. Имя файла — `id` + слаг названия
  (`/assets/cache/scenes/bg-harbor-порт-в-тумане.jpg`), поэтому повторный экспорт
  перезаписывает те же файлы, а не копит копии.
* **Передача**: JSON вместе с папкой выпуска кладут в `assets/episodes/<папка>/`
  на второй машине (Windows → macOS и обратно). Пути относительные, поэтому
  картинки подхватываются тем же сервером — делать ничего не нужно.
* **Импорт** приводит чужие пути к виду `/assets/...` (буквы диска, `file://`,
  обратные слеши и домашние папки `/Users/...` уходят), а имена из macOS
  переводит из NFD в NFC. Если локального сервера нет (сборка раздаётся
  статикой), встроенный Base64 из старого файла в JSON не вернётся — поле
  останется пустым, а причина попадёт в отчёт экспорта.

## Видео-сцены и плеер Мастера

Сценой может быть не только картинка, но и видео (`.mp4`, `.webm`): файл
выбирается там же, где картинка («+» в разделителе или двойной клик по сцене —
`accept="image/*,video/mp4,video/webm"`).

* Видео сразу выгружается в `assets/cache/videos` (`src/lib/video-file.ts` и эндпоинт
  `POST /__pedinburg/assets`), поэтому в снапшот для `/screen` уезжает короткий
  путь, а не десятки мегабайт Base64. Предел одного файла — **1 ГБ на тело
  запроса** (в JSON ассет едет в base64, это ещё +33 % к размеру), поэтому
  тяжёлые видео-фоны в 70–500 МБ загружаются без ограничений; что больше —
  сервер честно отвечает `413` с причиной.
* Тип сцены определяется по расширению (`isVideoSrc`), поэтому `SceneStage`
  рисует `<video autoPlay playsInline muted object-cover>` вместо `<img>` —
  одинаково в панели Мастера и на `/screen`. `muted` обязателен: фон не должен
  перебивать саундтрек.
* Внизу Viewport Мастера выезжает плеер: он спрятан, пока курсор вне сцены, и
  появляется при наведении (`group-hover`/`focus-within`). Внутри — пауза,
  скруббер с таймкодом `00:14 / 01:30` и кнопка повтора (`Repeat`, включённый
  цикл подсвечен `text-amber-400`). Перемотка работает благодаря Range-запросам
  (`206 Partial Content`) в раздаче `assets/`.
* **Управление общее на два окна:** пауза, повтор и перемотка лежат в сторе
  (`videoPlayback`) и уезжают на `/screen` снапшотом синхронизации, поэтому
  проектор останавливается вместе с превью. Оба окна применяют команды одним и
  тем же кодом в `SceneStage`; перемотка отправляется один раз — на отпускании
  ползунка (`seekId` — метка события).
* Флаг зацикливания хранится и в живом состоянии (для `/screen`), и в самой сцене
  (`Background.isLoop`, по умолчанию `true`), поэтому выбор Мастера переживает
  возврат на сцену и уезжает в файл выпуска.

## Множественное удаление

Для персонажей, сцен, треков и звуков саундпада работает режим выделения:
ПКМ по элементу → **«Выделить несколько»**. В секции появляются чекбоксы и
плашка «Выбрано: N» с кнопками «Удалить выбранные» и «Отмена», клик по элементу
переключает его отметку, а `Delete`/`Backspace` удаляют выбранное (в полях ввода
и в редакторе заметок клавиши работают как обычно — см. `isTextEntryTarget`).
Выход из режима — `Escape`, «Отмена» или удаление.

Логика удаления живёт в сторе (`deleteBatchCharacters`, `deleteBatchBackgrounds`,
`deleteBatchTracks`, `deleteBatchSoundpadSlots`): персонажи уходят со сцены и с
карт вместе со своими токенами, сцены — с раскладкой и заметками, а выпуск не
может остаться без сцен.


Во вкладке «Саундтрек» над плейлистом лежит саундпад — ряд квадратных плиток с
одноразовыми звуковыми эффектами (клик играет, ПКМ → «Редактировать»/«Удалить»).
Иконка и название выбираются в диалоге из набора `SOUNDPAD_ICON_NAMES`
(`src/lib/soundpad.ts`), звуковой файл — из проводника или путём в `assets/`.

* Эффекты играет модуль `src/lib/sfx-player.ts`: у каждого звука свой
  `new Audio(src)`, он не трогает деки плеера и не глохнет вместе с музыкой.
* Плеер живёт вне React-дерева, поэтому звук не обрывается при переключении
  вкладок («Карты», «Кубики») — вкладка размонтируется, звук продолжает играть.
* Слоты входят в файл выпуска (`soundpad[].src`): при экспорте файлы ложатся в
  `assets/cache/soundpad/`, а в JSON уезжает только путь — как у сцен и треков.
* `/screen` саундпад не транслирует: звук эффектов, как и музыка, остаётся в
  панели Мастера.

