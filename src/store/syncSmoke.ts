import {
  GRID_CELL_HEIGHT_RATIO,
  GRID_CELL_RATIO,
  GRID_COLUMNS,
  GRID_ROWS,
  TOKEN_CELL_RATIO,
  campaign,
  gridCellPercent,
  gridGeometry,
  gridOffsetPercent,
  tokenCategories,
} from "@/data/content"
import { resolveCellFromPoint } from "@/hooks/useGridDrop"
import {
  DEFAULT_BACKGROUND_STATE_ID,
  DEFAULT_BACKGROUND_STATE_NAME,
  backgroundStateSrc,
  backgroundStates,
  getBackgroundActiveState,
  hasCustomBackgroundStates,
  isBackgroundBattlemap,
} from "@/lib/background"
import { CROSSFADE_MS } from "@/components/master-panel/CrossfadeImage"
import {
  MAX_STAGE_CHARACTERS,
  STAGE_HEIGHT_PX,
  STAGE_SLIDE_MS,
  STAGE_WIDTH_PX,
  characterStagePosition,
  characterStagePositions,
  stageScale,
} from "@/lib/stage"
import {
  cellCenterFraction,
  cellDistance,
  clusterTargetCells,
  isPointInsideRect,
  normalizeRect,
} from "@/lib/token-cluster"
import {
  TOKEN_JUMP_DURATION,
  TOKEN_JUMP_KEYFRAMES,
  TOKEN_JUMP_TIMES,
  TOKEN_MOVE_DURATION,
} from "@/lib/token-motion"
/*
 * Исходники для проверок, которые нельзя выразить через стор (стили `/screen`,
 * разметка жестов и слоёв анимации). `?raw` отдаёт содержимое файла строкой —
 * смоук грузится через Vite SSR, поэтому отдельный доступ к файловой системе не
 * нужен, а проверки читают ровно то, что собирается в бандл.
 */
import indexCssSource from "@/index.css?raw"
import obsScreenSource from "@/pages/ObsScreen.tsx?raw"
import sceneStageSource from "@/components/master-panel/SceneStage.tsx?raw"
import battleMapGridSource from "@/components/master-panel/BattleMapGrid.tsx?raw"
import battleMapTabSource from "@/components/master-panel/tabs/BattleMapTab.tsx?raw"
import appSource from "@/App.tsx?raw"
import backgroundLibrarySource from "@/components/master-panel/BackgroundLibrary.tsx?raw"
import episodeStoreSource from "@/store/useEpisodeStore.ts?raw"
import sceneViewportSource from "@/components/master-panel/SceneViewport.tsx?raw"
import diceOverlaySource from "@/components/dice/DiceOverlay.tsx?raw"
import crossfadeImageSource from "@/components/master-panel/CrossfadeImage.tsx?raw"
import globalAudioSidebarSource from "@/components/master-panel/GlobalAudioSidebar.tsx?raw"
import masterPanelSource from "@/pages/MasterPanel.tsx?raw"
import episodeSyncSource from "@/store/episodeSync.ts?raw"
import {
  resolveGroupTrackAction,
  shouldResumeGroupTrack,
} from "@/lib/group-track"
import { SMOKE_EPISODE } from "@/store/smokeFixtures"
import { actGroups } from "@/data/seed"
import {
  categoryBorders,
  compactTokenBorders,
  TOKEN_COLUMN_ATTRIBUTE,
  tokenCategoryAtPoint,
} from "@/components/master-panel/tokenAppearance"
import { soundpadIcons } from "@/components/master-panel/soundpadIcons"
import {
  crossfadeLevels,
  isCrossfadeFinished,
  isCrossfadeInStarted,
} from "@/lib/audio-crossfade"
import { fileNameWithoutExtension } from "@/lib/utils"
import { readMp3Tags } from "@/lib/audio-file"
import {
  DEFAULT_CHARACTER_STATE_ID,
  DEFAULT_CHARACTER_STATE_NAME,
  characterAvatarSrc,
  characterFullBodySrc,
  characterStates,
  getCharacterActiveState,
} from "@/lib/character"
import type { EpisodeFile, SyncedEpisode } from "@/data/types"
import {
  DICE_DEFAULT_RAW_MASS,
  DICE_DEFAULT_RAW_THROWFORCE,
  DICE_PHYSICS,
  DICE_REFERENCE_GEOMETRY,
  DICE_ROLL_WATCHDOG_MS,
  DICE_WIDTH_PERCENT,
  ROLL_PLAQUE_MS,
  ROLL_RESULT_TEXT,
  ROLL_WAIT_MS,
  ROLL_WAIT_WITH_SCREEN_MS,
  SCALE_PER_PERCENT,
  SCREEN_ROLL_TEXT_REM,
  SCREEN_ROOT_FONT_MAX_PX,
  SCREEN_ROOT_FONT_MIN_PX,
  SCREEN_ROOT_FONT_REFERENCE_PX,
  SCREEN_ROOT_FONT_VW,
  buildDiceNotation,
  diceScaleForCount,
  diceSum,
  diceWidthPx,
  diceThrowSpeedFactor,
  estimateDiceRoll,
  formatRollBreakdown,
  internalDiceMass,
  isDiceResultValid,
  notationToSides,
  rollTextEmWidth,
  rollWaitMsFor,
  screenRollTextRem,
  screenRootFontPx,
  summarizeDiceResults,
} from "@/lib/dice"
import {
  buildEpisodeFile,
  episodeFileName,
  parseEpisodeFile,
} from "@/lib/episode-io"
import {
  ASSET_FOLDERS,
  EPISODE_JSON_LIMIT_BYTES,
  assertNoInlineAssets,
  characterAssetFolder,
  episodeAssetFields,
  episodeJsonBytes,
  findInlineAssetLeak,
  formatAssetSize,
  sanitizeEpisodeForExport,
} from "@/lib/export-episode"
import {
  ASSET_MEDIA_FOLDERS,
  FALLBACK_EPISODE_SLUG,
  assetFileName,
  buildEpisodeAssetUrl,
  episodeAssetFolder,
  extensionFromDataUrl,
  generateEpisodeSlug,
  isAssetLibraryPath,
  isInlineAsset,
  isSystemPath,
  slugifyAssetName,
  toAssetUrl,
} from "@/lib/asset-url"
import {
  DEFAULT_SOUNDPAD_ICON,
  SOUNDPAD_ICON_NAMES,
  isSoundpadIconName,
} from "@/lib/soundpad"
import { activeSfxCount, playSfx } from "@/lib/sfx-player"
import {
  formatMediaTime,
  isLoopEnabled,
  isVideoFile,
  isVideoSrc,
  nextSeekId,
  shouldSeekVideo,
} from "@/lib/media"
import { isTextEntryTarget } from "@/hooks/useBatchSelection"
import { useEpisodeStore, MAX_DICE_PER_TYPE } from "@/store/useEpisodeStore"
import {
  getSyncInfo,
  getSyncStatus,
  initEpisodeSync,
  postRollResult,
  resolveSyncUrl,
  subscribeSyncInfo,
  teardownEpisodeSync,
  type SyncMessage,
  type SyncRole,
  type SyncStatus,
} from "@/store/episodeSync"

const failures: string[] = []

function check(label: string, condition: boolean, detail = "") {
  if (!condition) failures.push(label)
  console.log(
    `${condition ? "PASS" : "FAIL"} · ${label}${detail ? ` — ${detail}` : ""}`
  )
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const store = () => useEpisodeStore.getState()
const backgroundOrder = () =>
  store()
    .backgrounds.map((item) => item.id)
    .join(",")

/** Клетка в виде строки — для проверок уникальности позиций. */
const cellKey = (cell: { cellX: number; cellY: number }) =>
  `${cell.cellX},${cell.cellY}`

// --- Чистый старт: приложение обязано начинаться с пустого выпуска ---
// Демо-данных в стартовом наборе нет: ни сцен, ни персонажей, ни треков.
check(
  "чистый старт: выпуск пуст (сцены, персонажи, треки, звуки, токены)",
  store().backgrounds.length === 0 &&
    store().characters.length === 0 &&
    store().tracks.length === 0 &&
    store().soundpad.length === 0 &&
    store().mapTokens.length === 0 &&
    Object.keys(store().groupNotes).length === 0 &&
    store().activeBackgroundId === null &&
    store().activeCharacterIds.length === 0 &&
    store().activeMapId === null,
  `сцен: ${store().backgrounds.length}, персонажей: ${store().characters.length}, треков: ${store().tracks.length}`
)
check(
  "чистый старт: есть один разделитель сцен, чтобы добавлять было куда",
  store().sceneGroups.length === 1 && store().sceneGroups[0] === actGroups[0],
  store().sceneGroups.join(", ")
)

/**
 * Возврат к рабочему набору: стор сбрасывается в пустой выпуск (как «Создать
 * новый выпуск»), а затем накатываются данные смоука. Дальше идут проверки,
 * которым нужны сцены, персонажи, карты и плейлист.
 */
function resetSmokeEpisode() {
  useEpisodeStore.getState().resetEpisode()
  useEpisodeStore.getState().importEpisode(SMOKE_EPISODE)
}
resetSmokeEpisode()

const seedBackgrounds = store().backgrounds.length
const seedTracks = store().tracks.length

/** Служебные сообщения sync-сервера: принимаются только с allowDebug (см. scripts/smoke.mjs). */
type SyncDebugMessage = { type: "debug-clear-state" } | { type: "debug-drop-clients" }

/** Живой пир в сокете: «второе окно» для проверки протокола синхронизации. */
type SyncPeer = {
  socket: WebSocket
  inbox: SyncMessage[]
  send: (message: SyncMessage | SyncDebugMessage) => void
  close: () => void
}

async function openPeer(role: SyncRole): Promise<SyncPeer> {
  const socket = new WebSocket(resolveSyncUrl())
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error("sync-сервер недоступен"))
  })

  const inbox: SyncMessage[] = []
  socket.onmessage = (event) => {
    inbox.push(JSON.parse(String(event.data)) as SyncMessage)
  }
  const send = (message: SyncMessage | SyncDebugMessage) => socket.send(JSON.stringify(message))
  send({ type: "hello", role })
  return { socket, inbox, send, close: () => socket.close() }
}

/** Сеть асинхронна: ждём условие опросом, а не фиксированной паузой. */
async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 3000,
  stepMs = 25
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await condition()) return true
    await wait(stepMs)
  }
  return await condition()
}

type SyncHealth = {
  ok: boolean
  hasState: boolean
  clients: { masters: number; screens: number }
  stats: { statesReceived: number; noStateSent: number; requests: number }
}

const syncUrl = resolveSyncUrl()
const healthUrl = `${syncUrl.replace(/^ws/, "http")}/health`

async function syncHealth(): Promise<SyncHealth> {
  const response = await fetch(healthUrl)
  return (await response.json()) as SyncHealth
}

// --- Холодный старт: сервер только поднялся, мастера ещё нет ---
check(
  "адрес sync-сервера вычислен (в смоуке — PEDINBURG_SYNC_URL)",
  /^ws:\/\/[\w.-]+:\d+$/.test(syncUrl),
  syncUrl
)
const coldHealth = await syncHealth()
check(
  "sync-сервер отвечает на /health и стартует с пустым кэшем",
  coldHealth.ok === true && coldHealth.hasState === false && coldHealth.clients.masters === 0,
  JSON.stringify(coldHealth.clients)
)

const coldScreen = await openPeer("screen")
coldScreen.send({ type: "request-state" })
check(
  "экран на пустом сервере без мастера получает no-state",
  await waitFor(() => coldScreen.inbox.some((message) => message.type === "no-state"))
)
coldScreen.close()

/** «Второе окно» (роль screen) подключено до мастера: оно увидит его первый снапшот. */
const raw = await openPeer("screen")
const inbox = raw.inbox

const stopMaster = initEpisodeSync("master")
check(
  "мастер подключается к sync-серверу (статус live)",
  await waitFor(() => getSyncStatus() === "live")
)
check(
  "первый снапшот мастера доходит до второго окна",
  await waitFor(() => inbox.some((message) => message.type === "state"))
)

// --- Перестановка фонов (п.4.1) ---
const harborIndex = store().backgrounds.findIndex(
  (item) => item.id === "bg-harbor"
)
store().moveBackground("bg-harbor", "bg-tavern")
check(
  "moveBackground меняет порядок внутри акта",
  store().backgrounds[harborIndex].id === "bg-tavern",
  store().backgrounds[harborIndex].id
)
store().moveBackground("bg-tavern", "bg-harbor")

const beforeCross = backgroundOrder()
store().moveBackground("bg-harbor", "bg-north-gate")
check(
  "бросок сцены на сцену другого акта переносит её в тот акт",
  store().backgrounds.find((item) => item.id === "bg-harbor")?.actGroup ===
    "1 акт" && backgroundOrder() !== beforeCross,
  store().backgrounds.find((item) => item.id === "bg-harbor")?.actGroup ?? "—"
)
// Возвращаем стартовый порядок: дальше проверки опираются на seed.
store().moveBackground("bg-harbor", "bg-tavern")
check(
  "возврат сцены в свой акт восстанавливает порядок",
  backgroundOrder() === "bg-harbor,bg-tavern,bg-artisan-street,bg-north-gate,bg-catacombs,bg-town-hall,bg-forge-rows,bg-butcher-bridge,bg-observatory,bg-misty-shore,bg-ossuary,bg-black-pines",
  backgroundOrder()
)

// --- Добавление фона (п.4.2) ---
store().addBackground("3 акт")
const addedBackground = store().backgrounds[store().backgrounds.length - 1]
check(
  "addBackground добавляет фон в конец пустого акта",
  addedBackground.actGroup === "3 акт" &&
    store().backgrounds.length === seedBackgrounds + 1,
  addedBackground.title
)
store().addBackground("Завязка")
const firstActIndex = store().backgrounds.findIndex(
  (item) => item.actGroup === "1 акт"
)
check(
  "новый фон из «Завязки» остаётся внутри своего блока",
  store()
    .backgrounds.slice(0, firstActIndex)
    .every((item) => item.actGroup === "Завязка")
)

// --- Перестановка плейлиста (п.9) ---
const trackOrderBefore = store()
  .tracks.map((item) => item.id)
  .join(",")
store().moveTrack(store().tracks[0].id, store().tracks[2].id)
check(
  "moveTrack меняет порядок плейлиста",
  store()
    .tracks.map((item) => item.id)
    .join(",") !== trackOrderBefore && store().tracks.length === seedTracks
)

// --- Кубики (п.8) ---
for (let index = 0; index < MAX_DICE_PER_TYPE + 1; index += 1) store().addDie(6)
check(
  "addDie ограничивает 5 кубиков одного типа",
  store().dicePool.length === MAX_DICE_PER_TYPE,
  `в пуле: ${store().dicePool.length}`
)
store().removeDie(6)
check(
  "removeDie убирает один кубик",
  store().dicePool.length === MAX_DICE_PER_TYPE - 1
)
store().addDie(20)
const poolSize = store().dicePool.length
const notation = buildDiceNotation(store().dicePool)
store().triggerDiceRoll(notation)
check("triggerDiceRoll очищает Staging area", store().dicePool.length === 0)
check(
  "нотация броска собирается из пула",
  notation.join(",") === "4d6,1d20",
  notation.join(",")
)
check(
  "бросок ставит событие для /screen и снимает прошлый итог",
  store().lastRoll === null &&
    store().lastRollEvent?.dice.join(",") === notation.join(","),
  `event: ${store().lastRollEvent?.id}`
)
// Фактические значения даёт физика /screen — в смоуке её роль играет тест.
store().completeDiceRoll(
  [
    { sides: 6, value: 3 },
    { sides: 6, value: 5 },
    { sides: 6, value: 2 },
    { sides: 6, value: 6 },
    { sides: 20, value: 18 },
  ],
  34
)
const roll = store().lastRoll
check(
  "итог броска содержит все кубики пула",
  roll?.dice.length === poolSize,
  `кубиков: ${roll?.dice.length}`
)
check(
  "значения лежат в диапазоне кубика",
  roll?.dice.every((die) => die.value >= 1 && die.value <= die.sides) === true
)
check(
  "сумма равна сумме всех кубиков",
  roll !== null &&
    roll.sum === roll.dice.reduce((total, die) => total + die.value, 0),
  `сумма: ${roll?.sum}`
)

// --- Сцена: до четырёх персонажей сразу (раскладка, лимит, снятие) ---
store().toggleCharacterOnStage("char-ingrid")
check(
  "первый клик выводит персонажа на сцену",
  store().activeCharacterIds.join(",") === "char-ingrid",
  store().activeCharacterIds.join(", ")
)
store().toggleCharacterOnStage("char-marcus")
store().toggleCharacterOnStage("char-selena")
check(
  "двое и трое на сцене: порядок выхода сохраняется",
  store().activeCharacterIds.join(",") === "char-ingrid,char-marcus,char-selena",
  store().activeCharacterIds.join(", ")
)
store().toggleCharacterOnStage("char-anselm")
store().toggleCharacterOnStage("char-hobb")
check(
  "пятый персонаж не пускается: на сцене максимум четыре",
  store().activeCharacterIds.length === MAX_STAGE_CHARACTERS &&
    !store().activeCharacterIds.includes("char-hobb"),
  `на сцене: ${store().activeCharacterIds.length}`
)
store().toggleCharacterOnStage("char-marcus")
check(
  "повторный клик убирает персонажа со сцены, остальные остаются",
  !store().activeCharacterIds.includes("char-marcus") &&
    store().activeCharacterIds.length === 3,
  store().activeCharacterIds.join(", ")
)
store().clearStage()
check(
  "клик по превью очищает сцену целиком",
  store().activeCharacterIds.length === 0
)

// Раскладка фигур: позиции в процентах ширины сцены — по ТЗ.
check(
  "раскладка 1–4 персонажей: центр и равные отступы (50 / 35-65 / 25-50-75 / 18-38-62-82)",
  characterStagePositions(1).join(",") === "50" &&
    characterStagePositions(2).join(",") === "35,65" &&
    characterStagePositions(3).join(",") === "25,50,75" &&
    characterStagePositions(4).join(",") === "18,38,62,82",
  characterStagePositions(4).join(", ")
)
check(
  "позиция фигуры берётся по её индексу в списке сцены",
  characterStagePosition(0, 1) === 50 &&
    characterStagePosition(1, 4) === 38 &&
    characterStagePosition(3, 4) === 82
)
check(
  "выезд фигуры длится 350 мс (совпадает с анимацией SceneStage)",
  STAGE_SLIDE_MS === 350 && MAX_STAGE_CHARACTERS === 4
)

// --- Снапшот для /screen ---
// Плашка держится 4.5 с — обновляем её прямо перед проверкой снапшота.
if (roll) store().completeDiceRoll(roll.dice, roll.sum)
await waitFor(() => inbox.some((message) => message.type === "state" && message.payload.lastRoll?.sum === roll?.sum))
const stateMessages = inbox.filter((message) => message.type === "state")
const lastMessage = stateMessages[stateMessages.length - 1]
const payload = lastMessage?.type === "state" ? lastMessage.payload : null
check(
  "master рассылает снапшоты",
  stateMessages.length > 0,
  `сообщений: ${stateMessages.length}`
)
check(
  "снапшот содержит список персонажей на сцене",
  Array.isArray(payload?.activeCharacterIds),
  String(payload?.activeCharacterIds)
)
check(
  "снапшот содержит флаг ожидания броска для подложки /screen",
  typeof payload?.isRollPending === "boolean",
  String(payload?.isRollPending)
)
check(
  "снапшот содержит результат броска",
  payload?.lastRoll?.sum === roll?.sum,
  String(payload?.lastRoll?.sum)
)
check(
  "снапшот сериализуем (без функций)",
  typeof payload?.backgrounds[0]?.title === "string"
)

inbox.length = 0
raw.send({ type: "request-state" })
check(
  "сервер отвечает на request-state снапшотом из кэша",
  await waitFor(() => inbox.some((message) => message.type === "state")),
  `сообщений: ${inbox.length}`
)

stopMaster()

// --- Экран /screen: приём состояния из сокета ---
const screenStatuses: SyncStatus[] = []
const stopWatchingStatus = subscribeSyncInfo(() => {
  screenStatuses.push(getSyncStatus())
})
const stopScreen = initEpisodeSync("screen")
inbox.length = 0

// Состояние приходит не напрямую от мастера, а через сервер: кладём снапшот вторым окном.
const remoteState: SyncedEpisode = {
  backgrounds: store().backgrounds,
  characters: store().characters,
  activeBackgroundId: "bg-town-hall",
  previousBackgroundId: "bg-harbor",
  activeCharacterIds: ["char-selena", "char-ingrid"],
  mapTokens: [
    {
      id: "token-selena",
      characterId: "char-selena",
      mapId: "bg-ossuary",
      cellX: 14,
      cellY: 0,
    },
  ],
  activeMapId: null,
  lastRoll: null,
  lastRollEvent: { id: 7, dice: ["1d20"] },
  isRollPending: true,
  // Команды плеера Мастера: экран обязан их применить (пауза, повтор, перемотка).
  videoPlayback: { isPlaying: false, isLoop: false, seekTime: 42, seekId: 1234 },
}
raw.send({ type: "state", payload: remoteState })

check(
  "экран получает состояние из сокета и переходит в live",
  await waitFor(() => getSyncStatus() === "live"),
  screenStatuses.join(" → ")
)
check(
  "экран применяет присланное состояние",
  await waitFor(() => {
    const follower = store()
    return (
      follower.activeBackgroundId === "bg-town-hall" &&
      follower.previousBackgroundId === "bg-harbor" &&
      follower.activeCharacterIds.join(",") === "char-selena,char-ingrid" &&
      follower.lastRoll === null &&
      follower.lastRollEvent?.id === 7 &&
      follower.isRollPending === true &&
      // Пауза, повтор и перемотка видео доехали до экрана.
      follower.videoPlayback.isPlaying === false &&
      follower.videoPlayback.isLoop === false &&
      follower.videoPlayback.seekTime === 42 &&
      follower.videoPlayback.seekId === 1234
    )
  }),
  `${store().activeBackgroundId} / ${store().activeCharacterIds.join(", ")}`
)
check(
  "экран проходит фазы connecting → waiting → live",
  screenStatuses.includes("connecting") &&
    screenStatuses.includes("waiting") &&
    screenStatuses[screenStatuses.length - 1] === "live",
  screenStatuses.join(" → ")
)
check(
  "экран не рассылает состояние",
  inbox.filter((message) => message.type === "state").length === 0,
  `исходящих: ${inbox.length}`
)

stopWatchingStatus()
stopScreen()

// --- Новая сессия ---
resetSmokeEpisode()
check(
  "resetEpisode возвращает seed-состояние",
  store().backgrounds.length === seedBackgrounds &&
    store().tracks.length === seedTracks &&
    store().dicePool.length === 0 &&
    store().activeCharacterIds.length === 0,
  `фонов: ${store().backgrounds.length}, треков: ${store().tracks.length}`
)

// --- Правки данных (фазы 5) ---
store().renameBackground("bg-harbor", "Порт в тумане (правка)")
check(
  "renameBackground меняет название сцены",
  store().backgrounds.find((item) => item.id === "bg-harbor")?.title ===
    "Порт в тумане (правка)"
)

const createdId = store().addCharacter({
  name: "Тест Персонаж",
  role: "Воин",
  category: "hero",
  avatarSrc: "",
  fullBodyPngSrc: "",
})
const created = store().characters.find((item) => item.id === createdId)
check(
  "addCharacter создаёт персонажа с инициалами",
  created?.initials === "ТП" && created.category === "hero",
  String(created?.initials)
)

store().renameCharacter(createdId, "Ингрид Тест")
check(
  "renameCharacter обновляет имя и инициалы",
  store().characters.find((item) => item.id === createdId)?.initials === "ИТ"
)

store().updateCharacterImage(createdId, { avatarSrc: "data:image/webp;base64,AAA" })
check(
  "updateCharacterImage меняет аватар",
  store().characters.find((item) => item.id === createdId)?.avatarSrc ===
    "data:image/webp;base64,AAA"
)

store().setCharacterCategory(createdId, "enemy")
check(
  "setCharacterCategory меняет категорию токена",
  store().characters.find((item) => item.id === createdId)?.category === "enemy"
)

const liveBackgroundBefore = store().activeBackgroundId
store().toggleBattlemapMode("bg-town-hall")
store().setActiveMap("bg-ossuary")
check(
  "setActiveMap меняет только редактируемую карту",
  store().activeMapId === "bg-ossuary" &&
    store().activeBackgroundId === liveBackgroundBefore,
  `${store().activeMapId} / ${store().activeBackgroundId}`
)
store().setActiveMap("bg-harbor")
check(
  "setActiveMap игнорирует фон без статуса карты",
  store().activeMapId === "bg-ossuary",
  String(store().activeMapId)
)

store().toggleCharacterOnStage(createdId)
store().addToken(createdId, 2, 2)
store().removeCharacter(createdId)
check(
  "removeCharacter чистит персонажа, токен и сцену",
  !store().characters.some((item) => item.id === createdId) &&
    !store().mapTokens.some((token) => token.characterId === createdId) &&
    !store().activeCharacterIds.includes(createdId)
)

check(
  "у всех персонажей корректная категория",
  store().characters.every((character) =>
    ["hero", "npc", "enemy", "item"].includes(character.category)
  )
)

// --- Экспорт/импорт выпуска ---
resetSmokeEpisode()
const exportedEpisode = JSON.stringify(buildEpisodeFile())
store().renameBackground("bg-harbor", "Экспорт-тест")
store().importEpisode(parseEpisodeFile(exportedEpisode))
check(
  "экспорт → импорт восстанавливает данные",
  store().backgrounds.find((item) => item.id === "bg-harbor")?.title ===
    "Порт в тумане",
  String(store().backgrounds.find((item) => item.id === "bg-harbor")?.title)
)

let rejectedBrokenFile = false
try {
  parseEpisodeFile("{ это не json")
} catch {
  rejectedBrokenFile = true
}
check("некорректный JSON отклоняется с ошибкой", rejectedBrokenFile)

let rejectedWrongShape = false
try {
  parseEpisodeFile(JSON.stringify({ characters: [] }))
} catch {
  rejectedWrongShape = true
}
check("файл без массива фонов отклоняется", rejectedWrongShape)

// Второе окно больше не нужно: закрываем сокет, сервер сразу обновляет присутствие.
raw.close()

// --- Фаза 6: раскладки по картам, картинка сцены, fade-переход ---
resetSmokeEpisode()
check(
  "стартовые токены привязаны к картам",
  store().mapTokens.every((token) => token.mapId.length > 0) &&
    store().mapTokens.some((token) => token.mapId === "bg-catacombs") &&
    store().mapTokens.some((token) => token.mapId === "bg-ossuary"),
  `токенов: ${store().mapTokens.length}`
)

const ossuaryIngridBefore = store().mapTokens.find(
  (token) => token.id === "token-ossuary-ingrid"
)
store().addToken("char-ingrid", 0, 5, "bg-catacombs")
const catacombsIngrid = store().mapTokens.find(
  (token) => token.characterId === "char-ingrid" && token.mapId === "bg-catacombs"
)
const ossuaryIngridAfter = store().mapTokens.find(
  (token) => token.id === "token-ossuary-ingrid"
)
check(
  "токен двигается только на своей карте",
  catacombsIngrid?.cellX === 0 &&
    catacombsIngrid?.cellY === 5 &&
    ossuaryIngridAfter?.cellX === ossuaryIngridBefore?.cellX,
  `catacombs: ${catacombsIngrid?.cellX},${catacombsIngrid?.cellY}`
)

store().setActiveMap("bg-ossuary")
store().addToken("char-marcus", 2, 2)
check(
  "addToken ставит токен на активную карту",
  store().mapTokens.some(
    (token) => token.characterId === "char-marcus" && token.mapId === "bg-ossuary"
  )
)

store().setActiveBackground("bg-harbor")
store().setActiveBackground("bg-tavern")
check(
  "смена сцены запоминает предыдущую (для fade)",
  store().previousBackgroundId === "bg-harbor" &&
    store().activeBackgroundId === "bg-tavern",
  `${store().previousBackgroundId} → ${store().activeBackgroundId}`
)

store().updateBackgroundImage("bg-harbor", "data:image/webp;base64,SCENE")
check(
  "updateBackgroundImage подставляет картинку сцены",
  backgroundStateSrc(
    store().backgrounds.find((item) => item.id === "bg-harbor")!
  ) === "data:image/webp;base64,SCENE"
)

const legacyFile = JSON.stringify({
  backgrounds: [
    { id: "bg-legacy", title: "Легаси", src: "", actGroup: "Завязка", isBattlemap: false },
    { id: "bg-legacy-map", title: "Легаси-карта", src: "", actGroup: "1 акт", isBattlemap: true },
  ],
  characters: [{ id: "legacy-hero", name: "Легаси Герой", kind: "player" }],
  mapTokens: [{ id: "legacy-token", characterId: "legacy-hero", cellX: 3, cellY: 3 }],
  tracks: [],
  sceneNotes: {},
})
store().importEpisode(parseEpisodeFile(legacyFile))
check(
  "старый файл: токен без mapId попадает на первую карту",
  store().mapTokens[0]?.mapId === "bg-legacy-map",
  String(store().mapTokens[0]?.mapId)
)
check(
  "старый файл: персонаж получает категорию hero",
  store().characters[0]?.category === "hero" &&
    store().characters[0]?.initials === "ЛГ",
  String(store().characters[0]?.category)
)
check(
  "импорт сбрасывает fade-переход",
  store().previousBackgroundId === null
)

// --- Фаза 7: название выпуска и акт «Финал» ---
resetSmokeEpisode()
check(
  "название выпуска по умолчанию — из кампании",
  store().episodeTitle.length > 0,
  store().episodeTitle
)
store().renameEpisode("Финал сезона: Три Ключа")
check(
  "renameEpisode меняет название выпуска",
  store().episodeTitle === "Финал сезона: Три Ключа",
  store().episodeTitle
)

store().addBackground("Финал")
const finaleScene = store().backgrounds[store().backgrounds.length - 1]
check(
  "addBackground умеет акт «Финал» (в конец списка)",
  finaleScene.actGroup === "Финал",
  finaleScene.actGroup
)

const episodeWithFinale = JSON.stringify(buildEpisodeFile())
store().renameEpisode("Другое название")
store().importEpisode(parseEpisodeFile(episodeWithFinale))
check(
  "экспорт/импорт сохраняет название выпуска",
  store().episodeTitle === "Финал сезона: Три Ключа",
  store().episodeTitle
)
check(
  "акт «Финал» выживает импорт (не схлопывается в «Завязку»)",
  store().backgrounds.some((item) => item.actGroup === "Финал")
)

resetSmokeEpisode()
check(
  "новый выпуск возвращает название кампании",
  store().episodeTitle !== "Финал сезона: Три Ключа",
  store().episodeTitle
)

// --- Фаза 10: треки (добавление/правка/удаление) и удаление сессии ---
resetSmokeEpisode()
const trackCount = store().tracks.length
const createdTrackId = store().addTrack({
  title: "Тест трека",
  artist: "QA",
  duration: "",
  tag: "",
  audioSrc: "data:audio/mpeg;base64,AAAA",
  coverSrc: "",
})
const createdTrack = store().tracks.find((track) => track.id === createdTrackId)
check(
  "addTrack добавляет трек с плейсхолдерами",
  store().tracks.length === trackCount + 1 &&
    createdTrack?.duration === "0:00" &&
    createdTrack?.tag === "Прочее",
  String(createdTrack?.duration)
)

store().updateTrack(createdTrackId, {
  title: "Трек правленый",
  artist: "QA Team",
})
check(
  "updateTrack правит поля трека",
  store().tracks.find((track) => track.id === createdTrackId)?.title ===
    "Трек правленый"
)

store().importEpisode(parseEpisodeFile(JSON.stringify(buildEpisodeFile())))
check(
  "встроенное аудио не едет в файл выпуска",
  store().tracks.some(
    (track) => track.id === createdTrackId && track.audioSrc === ""
  ),
  store().tracks.find((track) => track.id === createdTrackId)?.audioSrc
)

store().removeTrack(createdTrackId)
check(
  "removeTrack удаляет трек",
  !store().tracks.some((track) => track.id === createdTrackId)
)

const exportedEpisodeObject = JSON.parse(
  JSON.stringify(buildEpisodeFile())
) as Record<string, unknown>
check("в экспорте нет номера сессии", !("session" in exportedEpisodeObject))
check(
  "у seed-треков нет аудиофайла",
  store().tracks.every((track) => track.audioSrc === "")
)
check(
  "в снапшоте для /screen нет треков (аудио не транслируется)",
  Boolean(payload) && !("tracks" in (payload as Record<string, unknown>))
)

// --- Фаза 11: метаданные MP3, выбор токена, цвета категорий ---

/** Синтетический MP3 с ID3v2.3: заголовок тега плюс кадры TIT2 и TPE1. */
function buildId3v2Mp3(tags: { title: string; artist: string }) {
  const encoder = new TextEncoder()
  const frame = (id: string, value: string) => {
    // Первый байт кадра — кодировка текста (0x03 = UTF-8).
    const payload = new Uint8Array([0x03, ...encoder.encode(value)])
    const size = payload.byteLength
    return [
      ...encoder.encode(id),
      (size >>> 24) & 0xff,
      (size >>> 16) & 0xff,
      (size >>> 8) & 0xff,
      size & 0xff,
      0x00,
      0x00,
      ...payload,
    ]
  }

  const frames = [...frame("TIT2", tags.title), ...frame("TPE1", tags.artist)]
  const size = frames.length
  return new Uint8Array([
    0x49, // I
    0x44, // D
    0x33, // 3
    0x03, // версия 2.3
    0x00,
    0x00,
    (size >>> 21) & 0x7f,
    (size >>> 14) & 0x7f,
    (size >>> 7) & 0x7f,
    size & 0x7f,
    ...frames,
  ])
}

/** Синтетический MP3 с ID3v1-тегом в последних 128 байтах файла. */
function buildId3v1Mp3(tags: { title: string; artist: string }) {
  const audio = new Uint8Array(256)
  const block = new Uint8Array(128)
  block.set([0x54, 0x41, 0x47], 0) // «TAG»
  const encoder = new TextEncoder()
  block.set(encoder.encode(tags.title).subarray(0, 30), 3)
  block.set(encoder.encode(tags.artist).subarray(0, 30), 33)
  return new Uint8Array([...audio, ...block])
}

const id3v2Tags = await readMp3Tags(
  new File(
    [buildId3v2Mp3({ title: "Порт в тумане", artist: "Lowlands Ensemble" })],
    "port.mp3",
    { type: "audio/mpeg" }
  )
)
check(
  "ID3v2: название и исполнитель читаются из метаданных MP3",
  id3v2Tags.title === "Порт в тумане" &&
    id3v2Tags.artist === "Lowlands Ensemble",
  `${id3v2Tags.title} / ${id3v2Tags.artist}`
)

const id3v1Tags = await readMp3Tags(
  new File(
    [buildId3v1Mp3({ title: "Bridge of Butchers", artist: "Grimworks" })],
    "bridge.mp3",
    { type: "audio/mpeg" }
  )
)
check(
  "ID3v1 работает, если тега версии 2 нет",
  id3v1Tags.title === "Bridge of Butchers" &&
    id3v1Tags.artist === "Grimworks",
  `${id3v1Tags.title} / ${id3v1Tags.artist}`
)

const plainTags = await readMp3Tags(
  new File([new Uint8Array(400)], "no-tags.mp3", { type: "audio/mpeg" })
)
check(
  "MP3 без тегов: метаданные пустые (в UI возьмётся имя файла)",
  !plainTags.title && !plainTags.artist
)
check(
  "имя файла без расширения — запасное название трека",
  fileNameWithoutExtension("Мост Мясников.mp3") === "Мост Мясников"
)

check(
  "цвета категорий: обычная рамка → выбранная",
  categoryBorders.hero.base === "border-zinc-500" &&
    categoryBorders.hero.selected === "border-zinc-100" &&
    categoryBorders.npc.base === "border-zinc-700" &&
    categoryBorders.npc.selected === "border-zinc-400" &&
    categoryBorders.enemy.base === "border-red-900" &&
    categoryBorders.enemy.selected === "border-red-500" &&
    categoryBorders.item.base === "border-amber-700" &&
    categoryBorders.item.selected === "border-amber-400"
)

check(
  "компактный токен: рамка = цвет категории из макета",
  compactTokenBorders.hero === "border-zinc-100" &&
    compactTokenBorders.npc === "border-zinc-500" &&
    compactTokenBorders.enemy === "border-red-500" &&
    compactTokenBorders.item === "border-amber-400" &&
    tokenCategories.every((category) => Boolean(compactTokenBorders[category]))
)
check(
  "колонка категорий находится по атрибуту, вне браузера — null",
  TOKEN_COLUMN_ATTRIBUTE === "data-token-category" &&
    // В Node DOM нет: жест не должен падать, а просто ничего не менять.
    tokenCategoryAtPoint(10, 10) === null
)

resetSmokeEpisode()
const firstCharacterId = store().characters[0].id
const newTokenId = store().addToken(firstCharacterId, 2, 3)
check(
  "addToken возвращает id — новый токен становится выбранным",
  Boolean(newTokenId) &&
    store().mapTokens.some((token) => token.id === newTokenId)
)
const placedToken = store().mapTokens.find((token) => token.id === newTokenId)
const sameTokenId = store().addToken(firstCharacterId, 5, 5, placedToken?.mapId)
const movedToken = store().mapTokens.find((token) => token.id === newTokenId)
check(
  "повторный addToken двигает тот же токен и возвращает его id",
  sameTokenId === newTokenId &&
    movedToken?.cellX === 5 &&
    movedToken?.cellY === 5 &&
    store().mapTokens.filter(
      (token) =>
        token.characterId === firstCharacterId &&
        token.mapId === movedToken?.mapId
    ).length === 1
)

// --- Фаза 12: 3D-кубики Fantastic Dice (нотация, физика, плашка) ---
check(
  "нотация собирается из пула кубиков",
  buildDiceNotation([20, 6, 6]).join(",") === "2d6,1d20",
  buildDiceNotation([20, 6, 6]).join(",")
)
check(
  "нотация разбирается обратно в пул",
  notationToSides(["1d20", "2d6"]).join(",") === "20,6,6",
  notationToSides(["1d20", "2d6"]).join(",")
)

const summarized = summarizeDiceResults([
  { sides: 20, rolls: [{ sides: 20, value: "18" }] },
  { sides: 6, rolls: [{ sides: 6, value: 5 }, { sides: 6, value: 3 }] },
])
check(
  "физика: значения приводятся к числам и суммируются",
  summarized.sum === 26 &&
    summarized.dice.length === 3 &&
    summarized.dice.every((die) => typeof die.value === "number"),
  `${summarized.sum} (${summarized.dice.map((die) => die.value).join("+")})`
)
check(
  "плашка показывает разбор и итог: 18 + 5 + 3 = 26",
  formatRollBreakdown(summarized.dice, summarized.sum) === "18 + 5 + 3 = 26",
  formatRollBreakdown(summarized.dice, summarized.sum)
)
check(
  "один кубик показывается числом, без повтора «7 = 7»",
  formatRollBreakdown([{ sides: 20, value: 7 }], 7) === "7",
  formatRollBreakdown([{ sides: 20, value: 7 }], 7)
)
check(
  "локальная оценка помечается знаком «≈»",
  formatRollBreakdown([{ sides: 20, value: 7 }], 7, true) === "≈ 7" &&
    formatRollBreakdown(
      [
        { sides: 20, value: 7 },
        { sides: 6, value: 8 },
      ],
      15,
      true
    ) === "≈ 7 + 8 = 15",
  formatRollBreakdown([{ sides: 20, value: 7 }], 7, true)
)

// Защита от чужого результата: dice-box сбрасывает счётчики rollId в каждом roll(),
// поэтому опоздавший кубик прошлого броска может записать своё значение в новый.
// Такой итог не публикуем: Мастер дождётся таймаута и покажет честную «≈»-оценку.
check(
  "результат физики сверяется с запрошенным пулом",
  isDiceResultValid(
    [
      { sides: 6, value: 5 },
      { sides: 6, value: 3 },
      { sides: 20, value: 18 },
    ],
    [6, 6, 20]
  )
)
check(
  "значение вне граней кубика считается недостоверным",
  !isDiceResultValid([{ sides: 6, value: 7 }], [6])
)
check(
  "несовпадение количества кубиков считается недостоверным",
  !isDiceResultValid([{ sides: 20, value: 7 }], [20, 6]) &&
    !isDiceResultValid([{ sides: 6, value: 5 }], [6, 6])
)
check(
  "нулевое и дробное значение считается недостоверным",
  !isDiceResultValid([{ sides: 20, value: 0 }], [20]) &&
    !isDiceResultValid([{ sides: 20, value: 7.5 }], [20])
)
check(
  "кубик не из запрошенного пула считается недостоверным",
  !isDiceResultValid([{ sides: 12, value: 7 }], [20])
)

// Обратный канал: физику посчитал /screen и вернул фактические значения.
// Прежние клиенты в смоуке уже закрыты, поэтому поднимаем свежую пару.
const rollPeer = await openPeer("screen")
const rollInbox = rollPeer.inbox
const stopMasterForRoll = initEpisodeSync("master")
check(
  "мастер для приёма физики подключён к серверу",
  await waitFor(() => getSyncStatus() === "live")
)
check(
  "мастер отмечает подключённый экран OBS",
  await waitFor(() => store().syncScreens >= 1),
  `экранов: ${store().syncScreens}`
)

resetSmokeEpisode()
store().addDie(20)
store().addDie(6)
store().triggerDiceRoll(buildDiceNotation(store().dicePool))
const eventId = store().lastRollEvent?.id ?? 0
rollPeer.send({
  type: "roll-result",
  payload: {
    eventId,
    dice: [
      { sides: 20, value: 18 },
      { sides: 6, value: 5 },
    ],
    sum: 23,
  },
})
check(
  "мастер принимает результат физики с /screen",
  await waitFor(() => store().lastRoll?.sum === 23),
  String(store().lastRoll?.sum)
)
check(
  "мастер подтверждает приём: итог из двух кубиков",
  store().lastRoll?.dice.length === 2,
  String(store().lastRoll?.dice.length)
)
check(
  "плашка уезжает в снапшот для /screen",
  await waitFor(
    () =>
      rollInbox.some(
        (message) => message.type === "state" && message.payload.lastRoll?.sum === 23
      ),
    2000,
    50
  ),
  `сообщений: ${rollInbox.length}`
)

rollPeer.send({
  type: "roll-result",
  payload: { eventId: eventId + 99, dice: [{ sides: 20, value: 1 }], sum: 999 },
})
await wait(150)
check(
  "устаревший результат (чужой eventId) игнорируется",
  store().lastRoll?.sum === 23,
  String(store().lastRoll?.sum)
)

await wait(ROLL_PLAQUE_MS + 300)
check("плашка с итогом гаснет сама через 4.5 с", store().lastRoll === null)

stopMasterForRoll()
rollPeer.close()
// Присутствие обновляет сервер: без экрана Мастер снова ждёт короткий таймаут.
check(
  "уход экрана возвращает короткое ожидание",
  await waitFor(() => store().syncScreens === 0),
  `экранов: ${store().syncScreens}`
)

// Без подключённого экрана OBS итог считает сам Мастер (без 3D).
store().addDie(20)
store().triggerDiceRoll(buildDiceNotation(store().dicePool))
check("до ответа экрана итог ещё не показан", store().lastRoll === null)
await wait(ROLL_WAIT_MS + 400)
const fallbackRoll = store().lastRoll
check(
  "без /screen бросок считает фолбэк Мастера",
  fallbackRoll !== null &&
    fallbackRoll.dice.length === 1 &&
    fallbackRoll.dice[0].value >= 1 &&
    fallbackRoll.dice[0].value <= 20,
  `d20 = ${fallbackRoll?.dice[0]?.value}`
)
check(
  "фолбэк помечен как оценка, а не бросок физики",
  fallbackRoll?.estimated === true
)
store().clearRoll()
check(
  "clearRoll снимает и плашку, и ожидание броска",
  store().lastRoll === null && store().lastRollEvent === null
)

// Ключевой регресс «числа не совпадают с кубиками»: пока экран OBS на связи,
// Мастер обязан ждать физику, а не показывать случайное число через 5 секунд.
const waitPeer = await openPeer("screen")
const stopMasterForWait = initEpisodeSync("master")
check(
  "мастер видит экран перед проверкой ожидания",
  await waitFor(() => store().syncScreens >= 1)
)
store().addDie(20)
store().triggerDiceRoll(buildDiceNotation(store().dicePool))
await wait(ROLL_WAIT_MS + 400)
check(
  "с экраном на связи итог через 5 с ещё не показан",
  store().lastRoll === null && store().isRollPending === true,
  `итог: ${store().lastRoll?.sum ?? "нет"}`
)
store().clearRoll()
stopMasterForWait()
waitPeer.close()
check(
  "после остановки мастера присутствие обнуляется",
  await waitFor(() => store().syncScreens === 0)
)

// Обратный канал целиком: физику посчитал /screen (наш клиент), сервер доставил
// результат мастеру. Сокет ещё закрыт — кадр ждёт в буфере и уходит в onopen.
const postPeer = await openPeer("master")
postPeer.send({ type: "debug-clear-state" })
await wait(50)
postRollResult(31, [{ sides: 20, value: 13 }], 13)
const stopScreenForPost = initEpisodeSync("screen")
check(
  "результат, посчитанный до подключения, доезжает после onopen",
  await waitFor(
    () =>
      postPeer.inbox.some(
        (message) => message.type === "roll-result" && message.payload.sum === 13
      ),
    3000,
    50
  ),
  `сообщений: ${postPeer.inbox.length}`
)
postRollResult(32, [{ sides: 6, value: 4 }], 4)
check(
  "открытый сокет отправляет результат сразу",
  await waitFor(
    () =>
      postPeer.inbox.some(
        (message) => message.type === "roll-result" && message.payload.sum === 4
      ),
    2000,
    50
  )
)
stopScreenForPost()
postPeer.close()
check(
  "после остановки экрана присутствие обнуляется",
  await waitFor(() => store().syncScreens === 0)
)

// --- Фаза 13: саундтрек (кроссфейд 3 с + 3 с и обложка из метаданных) ---
check(
  "кроссфейд: уходящий стартует на полной громкости, новый ещё молчит",
  crossfadeLevels(0).out === 1 && crossfadeLevels(0).in === 0
)
check(
  "кроссфейд: на 2-й секунде новый только начинает проявляться",
  Math.abs(crossfadeLevels(2000).out - 1 / 3) < 0.02 &&
    crossfadeLevels(2000).in === 0
)
check(
  "кроссфейд: на 3-й секунде старый замолчал, новый звучит на треть",
  crossfadeLevels(3000).out === 0 &&
    Math.abs(crossfadeLevels(3000).in - 1 / 3) < 0.02
)
check(
  "кроссфейд: к 5-й секунде новый выходит на полную громкость",
  crossfadeLevels(5000).out === 0 && crossfadeLevels(5000).in === 1
)
check(
  "кроссфейд: границы перехода — 2 с и 5 с",
  !isCrossfadeInStarted(1999) &&
    isCrossfadeInStarted(2000) &&
    !isCrossfadeFinished(4999) &&
    isCrossfadeFinished(5000)
)

/** Синтетический MP3 с обложкой в кадре APIC (v2.3, PNG, описание пустое). */
function buildMp3WithCover() {
  const encoder = new TextEncoder()
  const frame = (id: string, payload: number[]) => [
    ...encoder.encode(id),
    (payload.length >>> 24) & 0xff,
    (payload.length >>> 16) & 0xff,
    (payload.length >>> 8) & 0xff,
    payload.length & 0xff,
    0x00,
    0x00,
    ...payload,
  ]
  const image = Array.from({ length: 300 }, () => 7)
  const apic = [0x00, ...encoder.encode("image/png"), 0x00, 0x03, 0x00, ...image]
  const frames = [
    ...frame("TIT2", [0x03, ...encoder.encode("Порт в тумане")]),
    ...frame("TPE1", [0x03, ...encoder.encode("Lowlands Ensemble")]),
    ...frame("APIC", apic),
  ]
  const size = frames.length
  return new Uint8Array([
    0x49,
    0x44,
    0x33,
    0x03,
    0x00,
    0x00,
    (size >>> 21) & 0x7f,
    (size >>> 14) & 0x7f,
    (size >>> 7) & 0x7f,
    size & 0x7f,
    ...frames,
  ])
}

const coverTags = await readMp3Tags(
  new File([buildMp3WithCover()], "cover.mp3", { type: "audio/mpeg" })
)
check(
  "обложка читается из кадра APIC как data-URL",
  coverTags.cover?.startsWith("data:image/png;base64,") === true &&
    (coverTags.cover?.length ?? 0) > 100,
  String(coverTags.cover?.slice(0, 30))
)
check(
  "текст рядом с обложкой не теряется",
  coverTags.title === "Порт в тумане" && coverTags.artist === "Lowlands Ensemble"
)

resetSmokeEpisode()
const coverTrackId = store().addTrack({
  title: "С обложкой",
  artist: "QA",
  duration: "1:00",
  tag: "Тест",
  audioSrc: "data:audio/mpeg;base64,BBBB",
  coverSrc: "data:image/png;base64,CCCC",
})
store().importEpisode(parseEpisodeFile(JSON.stringify(buildEpisodeFile())))
check(
  "обложка-инлайн не едет в файл выпуска",
  store().tracks.some(
    (track) => track.id === coverTrackId && track.coverSrc === ""
  ),
  store().tracks.find((track) => track.id === coverTrackId)?.coverSrc
)

// --- Фаза 14: состояние кнопки броска, размер и физика кубиков ---
check(
  "размер кубика падает с ростом пула и упирается в минимум",
  diceScaleForCount(1) > diceScaleForCount(2) &&
    diceScaleForCount(2) > diceScaleForCount(3) &&
    diceScaleForCount(3) > diceScaleForCount(4) &&
    diceScaleForCount(4) > diceScaleForCount(5) &&
    diceScaleForCount(5) > diceScaleForCount(6) &&
    diceScaleForCount(6) === diceScaleForCount(9),
  [1, 2, 3, 4, 5, 6, 9].map((count) => diceScaleForCount(count)).join("/")
)
check(
  "доля ширины подложки пересчитывается в scale движка",
  diceScaleForCount(1) === 13.42 &&
    diceScaleForCount(3) === 10.86 &&
    diceScaleForCount(6) === 7.93 &&
    DICE_WIDTH_PERCENT[0] === 22 &&
    DICE_WIDTH_PERCENT[DICE_WIDTH_PERCENT.length - 1] === 13,
  [1, 2, 3, 4, 5, 6]
    .map((count) => diceScaleForCount(count))
    .join("/")
)
// Калибровка в пикселях должна совпадать со старой «процент × 0.61» на эталоне
// /screen — иначе размер кубиков на стриме незаметно уехал бы.
check(
  "на эталонной геометрии калибровка равна «процент × SCALE_PER_PERCENT»",
  DICE_WIDTH_PERCENT.every(
    (percent, index) =>
      diceScaleForCount(index + 1, DICE_REFERENCE_GEOMETRY) ===
      Math.round(percent * SCALE_PER_PERCENT * 100) / 100
  )
)
check(
  "размер считается по геометрии подложки, а не по одному числу",
  diceScaleForCount(1) === diceScaleForCount(1, DICE_REFERENCE_GEOMETRY) &&
    diceScaleForCount(1, { plateWidthPx: 1248, plateHeightPx: 1776 }) === 6.71,
  String(diceScaleForCount(1, { plateWidthPx: 1248, plateHeightPx: 1776 }))
)
check(
  "один d20 заметно крупнее шести кубиков",
  diceScaleForCount(1) / diceScaleForCount(6) > 1.6,
  String(diceScaleForCount(1) / diceScaleForCount(6))
)
check(
  "нулевой и отрицательный пул считаются как один кубик",
  diceScaleForCount(0) === diceScaleForCount(1) &&
    diceScaleForCount(-3) === diceScaleForCount(1)
)

// Вес кубиков: воркер нормализует массу как 1 + raw/3, поэтому raw 9 — это
// внутренняя масса 4, ровно втрое больше дефолтной (1.333).
check(
  "масса кубиков втрое больше дефолтной",
  internalDiceMass(DICE_PHYSICS.mass) === 4 &&
    internalDiceMass(DICE_PHYSICS.mass) >= 3 * internalDiceMass(DICE_DEFAULT_RAW_MASS) - 1e-9,
  `${internalDiceMass(DICE_DEFAULT_RAW_MASS).toFixed(3)} → ${internalDiceMass(DICE_PHYSICS.mass)}`
)
// Кубик стал тяжелее, но бросок не «просел»: скорость броска воркер делит на массу,
// поэтому raw throwForce подобран под новую массу и совпадает с дефолтом библиотеки.
check(
  "разгон кубика остался дефолтным: вырос вес, а не скорость броска",
  Math.abs(
    diceThrowSpeedFactor() -
      diceThrowSpeedFactor(DICE_DEFAULT_RAW_THROWFORCE, DICE_DEFAULT_RAW_MASS)
  ) < 1e-9 && Math.abs(diceThrowSpeedFactor() - 1.875) < 1e-9,
  `${diceThrowSpeedFactor(DICE_DEFAULT_RAW_THROWFORCE, DICE_DEFAULT_RAW_MASS).toFixed(3)} → ${diceThrowSpeedFactor().toFixed(3)}`
)
// Ключи физики обязаны ехать в каждом `updateConfig`: воркер физики пересчитывает
// их от того, что пришло в кадре, и без сырых значений «донормировывает» уже
// нормированное (см. тест ниже).
check(
  "сырые ключи физики лежат в конфиге целиком",
  ["mass", "gravity", "throwForce", "spinForce"].every((key) => {
    const value = DICE_PHYSICS[key as keyof typeof DICE_PHYSICS]
    return Number.isFinite(value)
  }) &&
    DICE_PHYSICS.gravity === 1 &&
    DICE_PHYSICS.throwForce === 15 &&
    DICE_PHYSICS.spinForce === 6,
  JSON.stringify(DICE_PHYSICS)
)

// Слепок нормировки воркера физики dice-box 1.1.3 (инлайновый physics.worker,
// действие "updateConfig"). Формулы скопированы из бандла библиотеки: тест ловит
// возврат бага «невесомых кубиков», когда конфиг пересылали без сырых ключей.
type WorkerPhysics = {
  mass: number
  gravity: number
  throwForce: number
  spinForce: number
  scale: number
}

const DEFAULT_WORKER_PHYSICS: WorkerPhysics = {
  mass: 1,
  gravity: 1,
  throwForce: 5,
  spinForce: 6,
  scale: 5,
}

function workerUpdateConfig(
  state: WorkerPhysics,
  options: Partial<WorkerPhysics>
): WorkerPhysics {
  const next = { ...state, ...options }
  if (options.mass) next.mass = 1 + next.mass / 3
  if (options.mass || options.gravity) {
    next.gravity = next.gravity === 0 ? 0 : next.gravity + next.mass / 3
  }
  if (options.spinForce) next.spinForce = next.spinForce / 40
  if (options.throwForce || options.mass || options.scale) {
    next.throwForce = (next.throwForce / 2 / next.mass) * (1 + next.scale / 6)
  }
  return next
}

const scaleOnce = diceScaleForCount(1)
let stablePhysics = { ...DEFAULT_WORKER_PHYSICS }
let driftingPhysics = { ...DEFAULT_WORKER_PHYSICS }
for (let step = 0; step < 4; step += 1) {
  stablePhysics = workerUpdateConfig(stablePhysics, { ...DICE_PHYSICS, scale: scaleOnce })
  driftingPhysics = workerUpdateConfig(driftingPhysics, { scale: scaleOnce })
}
check(
  "сырые ключи гасят повторную нормировку: масса и разгон стабильны",
  stablePhysics.mass === internalDiceMass(DICE_PHYSICS.mass) &&
    Math.abs(stablePhysics.gravity - (1 + internalDiceMass(DICE_PHYSICS.mass) / 3)) < 1e-9 &&
    stablePhysics.throwForce === diceThrowSpeedFactor() * (1 + scaleOnce / 6),
  `mass ${stablePhysics.mass}, throwForce ${stablePhysics.throwForce.toFixed(3)}`
)
check(
  "без сырых ключей разгон кубика распухал — старый баг «невесомости»",
  driftingPhysics.throwForce > stablePhysics.throwForce * 1.5,
  `${stablePhysics.throwForce.toFixed(3)} → ${driftingPhysics.throwForce.toFixed(3)}`
)
// Ожидание итога: экран на связи — ждём физику (иначе показывали случайное число
// раньше, чем кубики останавливались), без экрана — короткий локальный фолбэк.
check(
  "таймаут ожидания зависит от подключённых экранов",
  rollWaitMsFor(0) === ROLL_WAIT_MS &&
    rollWaitMsFor(1) === ROLL_WAIT_WITH_SCREEN_MS &&
    rollWaitMsFor(3) === ROLL_WAIT_WITH_SCREEN_MS &&
    ROLL_WAIT_WITH_SCREEN_MS > ROLL_WAIT_MS,
  `${rollWaitMsFor(0)} / ${rollWaitMsFor(2)}`
)

// Главный регресс: раньше после затухания плашки кнопка залипала в «Кубики летят…».
resetSmokeEpisode()
store().addDie(20)
store().triggerDiceRoll(buildDiceNotation(store().dicePool))
check("бросок поднимает флаг ожидания", store().isRollPending === true)
store().completeDiceRoll([{ sides: 20, value: 12 }], 12)
check(
  "результат с /screen снимает блокировку кнопки",
  store().isRollPending === false && store().lastRoll?.sum === 12
)

store().triggerDiceRoll(buildDiceNotation(store().dicePool))
store().addDie(6)
check(
  "набор новых кубиков отменяет ожидание и разблокирует кнопку",
  store().isRollPending === false
)

store().triggerDiceRoll(["1d6"])
check("перед фолбэком флаг снова поднят", store().isRollPending === true)
await wait(ROLL_WAIT_MS + 400)
check(
  "фолбэк по таймауту снимает блокировку",
  store().isRollPending === false && store().lastRoll !== null,
  `сумма: ${store().lastRoll?.sum}`
)
await wait(ROLL_PLAQUE_MS + 300)
check(
  "после затухания плашки кнопка остаётся активной",
  store().isRollPending === false && store().lastRoll === null
)
store().clearRoll()

// --- Фаза 15: геометрия сетки боя ---
check(
  "клетка — ровно 6.7% ширины экрана",
  Math.abs(gridCellPercent.width - 6.7) < 1e-9,
  String(gridCellPercent.width)
)
check(
  "ровных клеток 14 × 11 (кадр 4:3, 1440×1080)",
  GRID_COLUMNS === 14 && GRID_ROWS === 11,
  `${GRID_COLUMNS} × ${GRID_ROWS}`
)
check(
  "клетка квадратная: высота в процентах = 6.7 × 1440/1080",
  Math.abs(gridCellPercent.height - 8.9333333) < 0.001,
  gridCellPercent.height.toFixed(4)
)
check(
  "«сдача» поделена поровну по краям: 3.1% и 0.867%",
  Math.abs(gridOffsetPercent.x - 3.1) < 1e-9 &&
    Math.abs(gridOffsetPercent.y - 0.8666666) < 0.001,
  `${gridOffsetPercent.x}% / ${gridOffsetPercent.y.toFixed(4)}%`
)
check(
  "ровные клетки + сдача = вся ширина и высота карты",
  Math.abs(GRID_COLUMNS * GRID_CELL_RATIO + 2 * (gridOffsetPercent.x / 100) - 1) <
    1e-9 &&
    Math.abs(
      GRID_ROWS * GRID_CELL_HEIGHT_RATIO + 2 * (gridOffsetPercent.y / 100) - 1
    ) < 1e-9
)
check(
  "токен занимает 92% клетки по ширине и высоте",
  TOKEN_CELL_RATIO === 0.92
)

// Попадание точки в ровную клетку и отказ в краевых «неровных» полосах.
// Поле — кадр сцены: 1440×1080 (4:3), как во Viewport и в эфире.
const field = { left: 0, top: 0, width: 1440, height: 1080 }
const cellSize = GRID_CELL_RATIO * field.width
const offsetXPx = (gridOffsetPercent.x / 100) * field.width
const offsetYPx = (gridOffsetPercent.y / 100) * field.height
check(
  "точка в центре первой ровной клетки даёт (0,0)",
  resolveCellFromPoint(
    field,
    offsetXPx + cellSize / 2,
    offsetYPx + cellSize / 2,
    gridGeometry
  )?.inside === true &&
    resolveCellFromPoint(
      field,
      offsetXPx + cellSize / 2,
      offsetYPx + cellSize / 2,
      gridGeometry
    )?.cellX === 0,
  String(
    resolveCellFromPoint(
      field,
      offsetXPx + cellSize / 2,
      offsetYPx + cellSize / 2,
      gridGeometry
    )?.cellY
  )
)
check(
  "левая краевая полоса неиграбельна",
  resolveCellFromPoint(field, offsetXPx / 2, 540, gridGeometry)?.inside === false
)
check(
  "правая краевая полоса неиграбельна",
  resolveCellFromPoint(
    field,
    field.width - offsetXPx / 2,
    540,
    gridGeometry
  )?.inside === false
)
check(
  "нижняя краевая полоса неиграбельна",
  resolveCellFromPoint(field, 720, field.height - offsetYPx / 2, gridGeometry)
    ?.inside === false
)
check(
  "последняя ровная клетка (13,10) доступна",
  (() => {
    const hit = resolveCellFromPoint(
      field,
      field.width - offsetXPx - cellSize / 2,
      field.height - offsetYPx - cellSize / 2,
      gridGeometry
    )
    return hit?.inside === true && hit.cellX === 13 && hit.cellY === 10
  })()
)
check(
  "точка вне поля отклоняется",
  resolveCellFromPoint(field, -10, -10, gridGeometry)?.inside === false
)

// --- Фаза 16: сцены (дублирование и удаление) ---
resetSmokeEpisode()
const sceneCount = store().backgrounds.length
const duplicateSourceId = store().backgrounds[0].id
store().duplicateBackground(duplicateSourceId)
check(
  "дублирование сцены создаёт копию рядом с исходной",
  store().backgrounds.length === sceneCount + 1 &&
    store().backgrounds[1].id !== duplicateSourceId &&
    store().backgrounds[1].title.includes("копия") &&
    store().backgrounds[1].actGroup === store().backgrounds[0].actGroup,
  store().backgrounds[1].title
)

resetSmokeEpisode()
const mapToRemove =
  store().backgrounds.find((item) => item.isBattlemap)?.id ?? ""
const tokensOnMap = store().mapTokens.filter(
  (token) => token.mapId === mapToRemove
).length
store().setActiveBackground(mapToRemove)
store().removeBackground(mapToRemove)
check(
  "удаление сцены убирает её из списка и снимает с эфира",
  !store().backgrounds.some((item) => item.id === mapToRemove) &&
    store().activeBackgroundId !== mapToRemove,
  String(store().activeBackgroundId)
)
check(
  "токены удалённой карты исчезают вместе с ней",
  tokensOnMap > 0 &&
    store().mapTokens.every((token) => token.mapId !== mapToRemove),
  `было токенов: ${tokensOnMap}`
)

// Заметки принадлежат группе сцен (акту): удаление сцены их не трогает —
// заметка описывает весь акт, а не отдельную сцену.
const noteGroup = store().sceneGroups[0]
store().updateGroupNote(noteGroup, "Заметка всего акта")
store().removeBackground(store().backgrounds[0].id)
check(
  "заметка акта переживает удаление сцены",
  store().groupNotes[noteGroup] === "Заметка всего акта",
  store().groupNotes[noteGroup]
)

// Последнюю сцену выпуска удалить нельзя — на проекторе должно что-то остаться.
while (store().backgrounds.length > 1) {
  store().removeBackground(store().backgrounds[0].id)
}
const lastSceneId = store().backgrounds[0].id
store().removeBackground(lastSceneId)
check(
  "последняя сцена не удаляется",
  store().backgrounds.length === 1 && store().backgrounds[0].id === lastSceneId
)
resetSmokeEpisode()

// --- Фаза 17: разделители сцен, пакетный импорт и имя файла выпуска ---
resetSmokeEpisode()
const seedGroupOrder = "Завязка/1 акт/2 акт/3 акт/Финал"
check(
  "стартовые разделители совпадают с актами выпуска",
  store().sceneGroups.join("/") === seedGroupOrder,
  store().sceneGroups.join("/")
)

const addedGroup = store().addSceneGroup()
check(
  "новый разделитель добавляется в конец списка",
  store().sceneGroups.at(-1) === addedGroup &&
    store().sceneGroups.length === 6,
  addedGroup
)

store().renameSceneGroup(addedGroup, "Интермедия")
check(
  "разделитель переименовывается",
  store().sceneGroups.includes("Интермедия") &&
    !store().sceneGroups.includes(addedGroup),
  store().sceneGroups.join("/")
)

// addBackground с готовой картинкой и activate:false — так импорт сцен
// добавляет пачки, не переводя эфир на каждую сцену.
const activeBeforeImport = store().activeBackgroundId
const importedSceneId = store().addBackground("Интермедия", {
  title: "Импорт сцены",
  src: "data:image/webp;base64,AA",
  activate: false,
})
const importedScene = store().backgrounds.find(
  (item) => item.id === importedSceneId
)
check(
  "addBackground принимает название и картинку, не трогая эфир",
  importedScene?.title === "Импорт сцены" &&
    importedScene?.src === "data:image/webp;base64,AA" &&
    importedScene?.actGroup === "Интермедия" &&
    store().activeBackgroundId === activeBeforeImport,
  importedScene?.title
)

store().moveBackgroundToGroup("bg-harbor", "Интермедия")
const intermediaOrder = store()
  .backgrounds.filter((item) => item.actGroup === "Интермедия")
  .map((item) => item.id)
  .join(",")
check(
  "бросок сцены на заголовок переносит её в конец чужого разделителя",
  intermediaOrder === `${importedSceneId},bg-harbor`,
  intermediaOrder
)

store().renameSceneGroup("Интермедия", "Завязка")
check(
  "переименование в занятое имя сливает разделители без потерь",
  store().sceneGroups.length === 5 &&
    !store().sceneGroups.includes("Интермедия") &&
    store().backgrounds.find((item) => item.id === "bg-harbor")?.actGroup ===
      "Завязка",
  store().sceneGroups.join("/")
)

// Перестановка разделителя тащит за собой его сцены.
resetSmokeEpisode()
store().moveSceneGroup("Завязка", "2 акт")
check(
  "разделитель переставляется в списке",
  store().sceneGroups.join("/") === "1 акт/2 акт/Завязка/3 акт/Финал",
  store().sceneGroups.join("/")
)
check(
  "сцены едут вместе со своим разделителем",
  backgroundOrder() ===
    "bg-north-gate,bg-catacombs,bg-town-hall,bg-forge-rows,bg-butcher-bridge,bg-observatory,bg-misty-shore,bg-ossuary,bg-black-pines,bg-harbor,bg-tavern,bg-artisan-street",
  backgroundOrder()
)

// Удаление разделителя: сцены уходят в предыдущий, у первого — в следующий.
resetSmokeEpisode()
store().removeSceneGroup("1 акт")
check(
  "удаление разделителя отдаёт сцены предыдущему",
  !store().sceneGroups.includes("1 акт") &&
    store().backgrounds.filter((item) => item.actGroup === "Завязка").length ===
      8,
  store().sceneGroups.join("/")
)
check(
  "сцены удалённого разделителя встают в конец соседнего блока",
  backgroundOrder() ===
    "bg-harbor,bg-tavern,bg-artisan-street,bg-north-gate,bg-catacombs,bg-town-hall,bg-forge-rows,bg-butcher-bridge,bg-observatory,bg-misty-shore,bg-ossuary,bg-black-pines",
  backgroundOrder()
)

resetSmokeEpisode()
store().removeSceneGroup("Завязка")
check(
  "первый разделитель отдаёт сцены следующему",
  !store().sceneGroups.includes("Завязка") &&
    store().backgrounds.filter((item) => item.actGroup === "1 акт").length === 8,
  store().sceneGroups.join("/")
)

resetSmokeEpisode()
while (store().sceneGroups.length > 1) {
  store().removeSceneGroup(store().sceneGroups[0])
}
store().removeSceneGroup(store().sceneGroups[0])
check(
  "последний разделитель не удаляется",
  store().sceneGroups.length === 1 &&
    store().backgrounds.every((item) => item.actGroup === store().sceneGroups[0]),
  store().sceneGroups.join("/")
)

// Разделители переживают экспорт и импорт выпуска.
resetSmokeEpisode()
const savedCustomGroup = store().addSceneGroup()
store().renameSceneGroup(savedCustomGroup, "Эпилог")
store().moveBackgroundToGroup("bg-harbor", "Эпилог")
const expectedGroupOrder = `${seedGroupOrder}/Эпилог`
const exportedWithGroups = buildEpisodeFile()
check(
  "разделители уходят в файл выпуска",
  exportedWithGroups.sceneGroups?.join("/") === expectedGroupOrder,
  exportedWithGroups.sceneGroups?.join("/")
)

const parsedWithGroups = parseEpisodeFile(JSON.stringify(exportedWithGroups))
check(
  "разделители читаются из файла выпуска",
  parsedWithGroups.sceneGroups?.join("/") === expectedGroupOrder,
  parsedWithGroups.sceneGroups?.join("/")
)

store().importEpisode(parsedWithGroups)
check(
  "после импорта разделитель и его сцены на месте",
  store().sceneGroups.join("/") === expectedGroupOrder &&
    store().backgrounds.find((item) => item.id === "bg-harbor")?.actGroup ===
      "Эпилог" &&
    store().backgrounds.at(-1)?.id === "bg-harbor",
  store().sceneGroups.join("/")
)

// Файл старого формата: разделители выводим из самих сцен.
const legacyGroups = parseEpisodeFile(
  JSON.stringify({
    backgrounds: [
      { id: "bg-a", title: "A", src: "", actGroup: "Кастом", isBattlemap: false },
      { id: "bg-b", title: "B", src: "", actGroup: "Завязка", isBattlemap: false },
      { id: "bg-c", title: "C", src: "", actGroup: "Кастом", isBattlemap: false },
    ],
    characters: [],
    tracks: [],
    mapTokens: [],
    sceneNotes: {},
  })
)
check(
  "файл без sceneGroups получает разделители из сцен",
  legacyGroups.sceneGroups?.join("/") === "Кастом/Завязка",
  legacyGroups.sceneGroups?.join("/")
)

store().importEpisode(legacyGroups)
check(
  "импорт старого файла сохраняет своё имя разделителя и порядок сцен",
  store().sceneGroups.join("/") === "Кастом/Завязка" &&
    backgroundOrder() === "bg-a,bg-c,bg-b",
  backgroundOrder()
)

// Имя файла выпуска берётся из названия, а не из даты.
check(
  "имя файла выпуска — это slug папки ассетов",
  episodeFileName("port-v-tumane") === "port-v-tumane.json" &&
    episodeFileName(generateEpisodeSlug("Порт в тумане")) ===
      "port-v-tumane.json",
  episodeFileName("port-v-tumane")
)
check(
  "опасное название всё равно даёт безопасное имя файла",
  episodeFileName('Порт: "туман" / ночь?') === "port-tuman-noch.json" &&
    episodeFileName("Порт... ") === "port.json",
  episodeFileName('Порт: "туман" / ночь?')
)
check(
  "пустой slug заменяется запасным",
  episodeFileName("") === `${FALLBACK_EPISODE_SLUG}.json` &&
    episodeFileName("   ") === `${FALLBACK_EPISODE_SLUG}.json`,
  episodeFileName("")
)

// --- Фаза 18: связка через sync-сервер (WebSocket) ---
// Финальный блок про то, что видит стример: кэш сервера, присутствие,
// самовосстановление после обрыва и тишина при неизменном снапшоте.
teardownEpisodeSync()
check("teardown закрывает синхронизацию (статус idle)", getSyncStatus() === "idle")

const stopMasterFinal = initEpisodeSync("master")
check(
  "мастер снова на связи перед финальным блоком",
  await waitFor(() => getSyncStatus() === "live")
)

const screenPeer = await openPeer("screen")
check(
  "сервер видит мастера и экран в присутствии",
  await waitFor(async () => {
    const seen = (await syncHealth()).clients
    return seen.masters >= 1 && seen.screens >= 1
  }),
  JSON.stringify((await syncHealth()).clients)
)
check(
  "мастер видит подключённый экран OBS",
  await waitFor(() => getSyncInfo().presence.screens >= 1),
  `экранов: ${getSyncInfo().presence.screens}`
)
check(
  "экран получает presence с числом мастеров",
  await waitFor(() =>
    screenPeer.inbox.some(
      (message) => message.type === "presence" && message.payload.masters >= 1
    )
  )
)

// Кэш сервера: поздний экран получает состояние без участия мастера.
const latePeer = await openPeer("screen")
latePeer.send({ type: "request-state" })
check(
  "поздний экран получает состояние из кэша сервера",
  await waitFor(() =>
    latePeer.inbox.some(
      (message) =>
        message.type === "state" &&
        message.payload.activeBackgroundId === store().activeBackgroundId
    )
  )
)

// Дедупликация: правка, не попавшая в снапшот (пул кубиков), не гонит трафик.
store().addDie(20)
await wait(150)
const beforeNoop = (await syncHealth()).stats.statesReceived
store().addDie(20)
await wait(250)
const afterNoop = (await syncHealth()).stats.statesReceived
check(
  "неизменившийся снапшот не отправляется повторно",
  afterNoop === beforeNoop,
  `состояний от мастера: ${beforeNoop} → ${afterNoop}`
)

// Без кэша сервер пересылает запрос мастеру — тот флашит снапшот заново.
const cachePeer = await openPeer("master")
cachePeer.send({ type: "debug-clear-state" })
await wait(50)
check("служебная команда очищает кэш состояния", (await syncHealth()).hasState === false)
const refillPeer = await openPeer("screen")
refillPeer.send({ type: "request-state" })
check(
  "без кэша сервер пересылает запрос мастеру, мастер флашит снапшот",
  await waitFor(() => refillPeer.inbox.some((message) => message.type === "state")),
  `сообщений: ${refillPeer.inbox.length}`
)

// Снапшот не возвращается отправителю: эха, как и в BroadcastChannel, нет.
cachePeer.send({ type: "state", payload: remoteState })
await wait(200)
check(
  "сервер не возвращает снапшот отправителю",
  !cachePeer.inbox.some(
    (message) =>
      message.type === "state" &&
      message.payload.activeBackgroundId === remoteState.activeBackgroundId
  ),
  `сообщений: ${cachePeer.inbox.length}`
)

// Обрыв связи: экран уходит в reconnecting и возвращается в live сам.
const reconnectStatuses: SyncStatus[] = []
const stopWatchingReconnect = subscribeSyncInfo(() => {
  reconnectStatuses.push(getSyncStatus())
})
const stopFinalScreen = initEpisodeSync("screen")
check(
  "экран входит в live после подключения",
  await waitFor(() => getSyncStatus() === "live"),
  reconnectStatuses.join(" → ")
)
refillPeer.send({ type: "debug-drop-clients" })
check(
  "потеря связи переводит экран в reconnecting",
  await waitFor(() => reconnectStatuses.includes("reconnecting")),
  reconnectStatuses.join(" → ")
)
check(
  "экран сам восстанавливает связь и снова получает состояние",
  await waitFor(
    () =>
      getSyncStatus() === "live" &&
      reconnectStatuses.filter((item) => item === "live").length >= 2,
    5000
  ),
  reconnectStatuses.join(" → ")
)
stopWatchingReconnect()
stopFinalScreen()

// Полная остановка: сервер перестаёт видеть оба окна.
teardownEpisodeSync()
stopMasterFinal()
await wait(250)
const finalHealth = await syncHealth()
check(
  "после отключения сервер не видит ни мастеров, ни экранов",
  finalHealth.clients.masters === 0 && finalHealth.clients.screens === 0,
  JSON.stringify(finalHealth.clients)
)
for (const peer of [raw, screenPeer, latePeer, cachePeer, refillPeer]) peer.close()
resetSmokeEpisode()

// --- Фаза 19: итог броска на /screen (полоса градиента и кегль строки в rem) ---
// Прежний кегль 3.5vw на эталонном канвасе OBS 1920 — это 67.2 px, значит итог
// должен стать вчетверо крупнее: 16.8rem при корневом кегле 16 px (1920 / 120).
const LEGACY_ROLL_TEXT_PX = 0.035 * 1920
const SCREEN_ROLL_TEXT_PX = SCREEN_ROLL_TEXT_REM * SCREEN_ROOT_FONT_REFERENCE_PX
check(
  "кегль итога на /screen — 4× прежних 3.5vw, задан в rem и в стиле плашки",
  Math.abs(SCREEN_ROLL_TEXT_PX - 4 * LEGACY_ROLL_TEXT_PX) < 1e-9 &&
    Math.abs(SCREEN_ROLL_TEXT_PX - 268.8) < 1e-9 &&
    ROLL_RESULT_TEXT.includes("font-display") &&
    ROLL_RESULT_TEXT.includes("[text-shadow:"),
  `${SCREEN_ROLL_TEXT_REM}rem × ${SCREEN_ROOT_FONT_REFERENCE_PX}px = ${SCREEN_ROLL_TEXT_PX}px`
)
check(
  "короткий итог показываем ровно в 4 раза крупнее прежнего",
  screenRollTextRem("14") === SCREEN_ROLL_TEXT_REM &&
    screenRollTextRem("3 + 5 = 8") === SCREEN_ROLL_TEXT_REM &&
    screenRollTextRem("≈ 14") === SCREEN_ROLL_TEXT_REM,
  `"14" → ${screenRollTextRem("14")}rem, "3 + 5 = 8" → ${screenRollTextRem("3 + 5 = 8")}rem`
)
// Длинный итог ужимается — но по ширине обязан остаться внутри серой подложки.
const longestRollText = "6 + 3 + 6 + 6 + 6 = 27"
const longestRollRem = screenRollTextRem(longestRollText)
const longestRollWidthPx =
  longestRollRem * SCREEN_ROOT_FONT_REFERENCE_PX * rollTextEmWidth(longestRollText)
check(
  "длинный итог ужимается и не выходит за подложку",
  longestRollRem < SCREEN_ROLL_TEXT_REM &&
    longestRollRem > 6 &&
    longestRollWidthPx <= DICE_REFERENCE_GEOMETRY.plateWidthPx + 1e-9,
  `"${longestRollText}" → ${longestRollRem}rem, ширина ${longestRollWidthPx.toFixed(1)} px из ${DICE_REFERENCE_GEOMETRY.plateWidthPx}`
)
// Ширина строки считается по реальным метрикам Colus (unitsPerEm = 1000), а не «на глаз»:
// «14» — 0.389 + 0.556 кегля, пробел — 0.25, «+» — 0.476, «=» — 0.488.
check(
  "ширина строки считается по метрикам шрифта Colus",
  Math.abs(rollTextEmWidth("14") - (0.389 + 0.556) * 1.02) < 1e-9 &&
    Math.abs(rollTextEmWidth(" ") - 0.25 * 1.02) < 1e-9 &&
    rollTextEmWidth("") === 0,
  `"14" → ${rollTextEmWidth("14").toFixed(4)}em`
)
// Корневой кегль /screen: 1/120 ширины канваса с границами 10…24 px (как в index.css).
check(
  "корневой кегль /screen привязан к ширине канваса",
  screenRootFontPx(1920) === SCREEN_ROOT_FONT_REFERENCE_PX &&
    screenRootFontPx(1280) === 1280 / SCREEN_ROOT_FONT_VW &&
    screenRootFontPx(800) === SCREEN_ROOT_FONT_MIN_PX &&
    screenRootFontPx(3840) === SCREEN_ROOT_FONT_MAX_PX,
  `1920 → ${screenRootFontPx(1920)}px, 800 → ${screenRootFontPx(800)}px, 3840 → ${screenRootFontPx(3840)}px`
)
// Строка разбора не должна измениться при переезде константы стиля в @/lib/dice.
check(
  "строка разбора итога осталась прежней",
  formatRollBreakdown([{ sides: 20, value: 18 }, { sides: 6, value: 5 }], 23) === "18 + 5 = 23" &&
    formatRollBreakdown([{ sides: 20, value: 7 }], 7) === "7" &&
    formatRollBreakdown([{ sides: 20, value: 7 }], 7, true) === "≈ 7",
  formatRollBreakdown([{ sides: 20, value: 18 }, { sides: 6, value: 5 }], 23)
)

// --- Фаза 20: кроссплатформенные пути выпуска (Windows ↔ macOS) ---
// В JSON выпуска пути к ассетам всегда относительные от корня assets/
// (`/assets/scenes/harbor.png`), а пути чужой ОС, приехавшие в файле, приводятся
// к тому же виду при импорте — стор не хранит путей Windows и macOS.
/** Обратный слеш — верный признак пути Windows. */
const BACKSLASH = String.fromCharCode(92)
const SCENE_PATH_FROM_WINDOWS = "D:\\Выпуски\\2 акт\\assets\\scenes\\harbor.png"

check(
  "путь Windows становится URL от корня assets/",
  toAssetUrl("C:\\game\\assets\\scenes\\ep1\\forest.jpg") ===
    "/assets/scenes/ep1/forest.jpg",
  toAssetUrl("C:\\game\\assets\\scenes\\ep1\\forest.jpg")
)
check(
  "путь macOS и file:// становятся URL от корня assets/",
  toAssetUrl("/Users/me/proj/assets/music/theme.mp3") ===
    "/assets/music/theme.mp3" &&
    toAssetUrl("file:///D:/proj/assets/x.png") === "/assets/x.png",
  toAssetUrl("/Users/me/proj/assets/music/theme.mp3")
)
check(
  "кириллица и пробелы в пути не мешают",
  toAssetUrl("/Users/me/assets/characters/Выпуск №2. Яблоко Раздора/алхимик.png") ===
    "/assets/characters/Выпуск №2. Яблоко Раздора/алхимик.png"
)
check(
  "относительный, вложенный и лишние пробелы дают один URL",
  toAssetUrl("assets/scenes/a.jpg") === "/assets/scenes/a.jpg" &&
    toAssetUrl("./assets/x.png") === "/assets/x.png" &&
    toAssetUrl("C:\\proj\\assets\\assets\\x.png") === "/assets/x.png" &&
    toAssetUrl("  /assets/x.png  ") === "/assets/x.png"
)
check(
  "data-URL, ссылки и placeholders не переписываются",
  toAssetUrl("data:image/webp;base64,AA") === "data:image/webp;base64,AA" &&
    toAssetUrl("blob:http://localhost/abc") === "blob:http://localhost/abc" &&
    toAssetUrl("https://cdn.example.com/x.png") ===
      "https://cdn.example.com/x.png" &&
    toAssetUrl("/placeholders/background-1.svg") ===
      "/placeholders/background-1.svg" &&
    toAssetUrl("") === ""
)

// --- Фаза 21: две зоны корня assets/ (episodes/ — постоянное хранилище,
// cache/ — временный кэш приложения) и кириллица macOS в форме NFD ---
/** «й» в NFD: «и» + диакритика — так имя файла лежит на диске в macOS. */
const NFD_AND = "\u0438\u0306"
/** Тот же символ в NFC — в этой форме пути лежат в JSON и URL. */
const NFC_AND = "\u0439"

check(
  "обе зоны assets/ — валидные относительные пути",
  toAssetUrl("/assets/episodes/ep-01/scenes/forest.jpg") ===
    "/assets/episodes/ep-01/scenes/forest.jpg" &&
    toAssetUrl("/assets/cache/music/theme.mp3") ===
      "/assets/cache/music/theme.mp3" &&
    toAssetUrl("assets/episodes/ep-02/music/theme.mp3") ===
      "/assets/episodes/ep-02/music/theme.mp3" &&
    toAssetUrl("episodes/ep-03/scenes/forest.jpg") ===
      "/assets/episodes/ep-03/scenes/forest.jpg" &&
    toAssetUrl("./cache/scenes/forest.jpg") === "/assets/cache/scenes/forest.jpg",
  toAssetUrl("episodes/ep-03/scenes/forest.jpg")
)
check(
  "системный путь внутри episodes/ и cache/ становится /assets/...",
  toAssetUrl("D:\\Выпуски\\assets\\episodes\\ep-01\\scenes\\порт в тумане.jpg") ===
    "/assets/episodes/ep-01/scenes/порт в тумане.jpg" &&
    toAssetUrl("/Users/me/proj/assets/cache/music/тема.mp3") ===
      "/assets/cache/music/тема.mp3"
)
check(
  "имя файла из macOS (NFD) приводится к NFC",
  toAssetUrl(`/assets/episodes/ep-01/scenes/${NFD_AND}лка.jpg`) ===
    `/assets/episodes/ep-01/scenes/${NFC_AND}лка.jpg` &&
    toAssetUrl(`/assets/cache/scenes/${NFD_AND}лка.jpg`) ===
      `/assets/cache/scenes/${NFC_AND}лка.jpg` &&
    toAssetUrl(`D:\\Выпуски\\assets\\episodes\\${NFD_AND}лка.jpg`) ===
      `/assets/episodes/${NFC_AND}лка.jpg`,
  toAssetUrl(`/assets/episodes/ep-01/scenes/${NFD_AND}лка.jpg`)
)
check(
  "путь внутри assets/ отличается от чужих путей и CDN",
  isAssetLibraryPath("/assets/episodes/ep-01/scenes/forest.jpg") &&
    isAssetLibraryPath("/assets/cache/music/theme.mp3") &&
    !isAssetLibraryPath("/placeholders/background-1.svg") &&
    !isAssetLibraryPath("https://cdn.example.com/x.png") &&
    !isAssetLibraryPath("") &&
    !isAssetLibraryPath(null)
)

// --- Фаза 22: предметы (категория `item`) живут в своей папке `items/`:
// в постоянном выпуске — `/assets/episodes/<выпуск>/items/...`, в кэше —
// `/assets/cache/items/...`. Так их видно в структуре рядом с прочими медиа. ---
check(
  "папка предметов items/ есть в списке медиатеки",
  ASSET_MEDIA_FOLDERS.includes("items") &&
    ASSET_FOLDERS.items === "items"
)
check(
  "пути предметов в обеих зонах остаются как есть",
  toAssetUrl("/assets/episodes/ep-01/items/sword.png") ===
    "/assets/episodes/ep-01/items/sword.png" &&
    toAssetUrl("/assets/cache/items/sword.png") ===
      "/assets/cache/items/sword.png" &&
    toAssetUrl("D:\\Выпуски\\assets\\cache\\items\\меч-й.png") ===
      "/assets/cache/items/меч-й.png" &&
    toAssetUrl(`/assets/episodes/ep-01/items/меч-${NFD_AND}.png`) ===
      `/assets/episodes/ep-01/items/меч-${NFC_AND}.png`,
  toAssetUrl("/assets/episodes/ep-01/items/sword.png")
)
check(
  "путь предмета без корня попадает в кэш",
  toAssetUrl("items/sword.png") === "/assets/cache/items/sword.png" &&
    toAssetUrl("./items/меч.png") === "/assets/cache/items/меч.png" &&
    isAssetLibraryPath("/assets/cache/items/sword.png") &&
    isAssetLibraryPath("items/sword.png") &&
    !isAssetLibraryPath("item/sword.png")
)
check(
  "картинки персонажа раскладываются по категории",
  characterAssetFolder("item") === "items" &&
    characterAssetFolder("hero") === "characters" &&
    characterAssetFolder("npc") === "characters" &&
    characterAssetFolder("enemy") === "characters"
)

// Файл выпуска, собранный на другой машине: внутри пути Windows и macOS.
const foreignFile = parseEpisodeFile(
  JSON.stringify({
    campaign: "Порт в тумане",
    backgrounds: [
      {
        id: "bg-win",
        title: "Сцена из Windows",
        src: SCENE_PATH_FROM_WINDOWS,
        actGroup: "Завязка",
        isBattlemap: false,
      },
    ],
    characters: [
      {
        id: "char-mac",
        name: "Алхимик",
        role: "NPC",
        category: "npc",
        avatarSrc: "/Users/me/proj/assets/characters/алхимик_токен.png",
        fullBodyPngSrc: "C:\\proj\\assets\\characters\\алхимик.png",
      },
    ],
    tracks: [
      {
        id: "track-1",
        title: "Тема",
        artist: "Автор",
        duration: "1:00",
        tag: "Прочее",
        audioSrc: "C:\\proj\\assets\\music\\theme.mp3",
        coverSrc: "data:image/png;base64,AA",
      },
    ],
    mapTokens: [{ id: "token-1", characterId: "char-mac", cellX: 0, cellY: 0 }],
    sceneNotes: {},
  })
)
resetSmokeEpisode()
store().importEpisode(foreignFile)
check(
  "при импорте пути ОС становятся /assets/..., а data-URL не трогается",
  store().backgrounds[0].src === "/assets/scenes/harbor.png" &&
    store().characters[0].avatarSrc ===
      "/assets/characters/алхимик_токен.png" &&
    store().characters[0].fullBodyPngSrc === "/assets/characters/алхимик.png" &&
    store().tracks[0].audioSrc === "/assets/music/theme.mp3" &&
    store().tracks[0].coverSrc === "data:image/png;base64,AA",
  store().backgrounds[0].src
)
check(
  "в сторе не осталось обратных слешей",
  !JSON.stringify({
    backgrounds: store().backgrounds,
    characters: store().characters,
    tracks: store().tracks,
  }).includes(BACKSLASH)
)

const exportedCrossPlatform = buildEpisodeFile()
check(
  "экспорт пишет относительные пути без следов ОС",
  exportedCrossPlatform.backgrounds[0].src === "/assets/scenes/harbor.png" &&
    exportedCrossPlatform.characters[0].fullBodyPngSrc ===
      "/assets/characters/алхимик.png" &&
    exportedCrossPlatform.tracks[0].audioSrc === "/assets/music/theme.mp3" &&
    !JSON.stringify(exportedCrossPlatform).includes(BACKSLASH),
  exportedCrossPlatform.backgrounds[0].src
)
// Экспорт → импорт → экспорт: пути не портятся на втором круге.
store().importEpisode(parseEpisodeFile(JSON.stringify(exportedCrossPlatform)))
check(
  "повторный импорт не портит относительные пути",
  store().backgrounds[0].src === "/assets/scenes/harbor.png" &&
    store().characters[0].avatarSrc ===
      "/assets/characters/алхимик_токен.png" &&
    store().tracks[0].audioSrc === "/assets/music/theme.mp3" &&
    !JSON.stringify(buildEpisodeFile()).includes(BACKSLASH)
)

// Файл, сохранённый Блокнотом Windows, приходит с BOM — он не должен мешать.
let bomAccepted = false
try {
  bomAccepted =
    parseEpisodeFile(
      `\uFEFF${JSON.stringify({
        backgrounds: [
          {
            id: "bg-bom",
            title: "BOM",
            src: "",
            actGroup: "Завязка",
            isBattlemap: false,
          },
        ],
        characters: [],
        tracks: [],
        mapTokens: [],
        sceneNotes: {},
      })}`
    ).backgrounds[0].id === "bg-bom"
} catch {
  bomAccepted = false
}
check("JSON с BOM (сохранён Блокнотом Windows) читается", bomAccepted)

// --- Фаза 18: вес файла выпуска (запрет Base64) и сторожевой таймер кубиков ---
// Встроенные ассеты: именно они раньше превращали файл выпуска в 100 МБ Base64.
const INLINE_IMAGE = `data:image/webp;base64,${"A".repeat(64)}`
const INLINE_AUDIO = `data:audio/mpeg;base64,${"B".repeat(64)}`
resetSmokeEpisode()
const heavySceneId = store().addBackground("Интермедия", {
  title: "Сцена с картинкой",
  src: INLINE_IMAGE,
  activate: false,
})
store().updateCharacterImage(store().characters[0].id, {
  avatarSrc: INLINE_IMAGE,
  fullBodyPngSrc: INLINE_IMAGE,
})
const heavyTrackId = store().addTrack({
  title: "Трек с файлом",
  artist: "QA",
  duration: "1:00",
  tag: "Тест",
  audioSrc: INLINE_AUDIO,
  coverSrc: INLINE_IMAGE,
})
const heavySfxId = store().addSoundpadSlot({
  title: "Взрыв",
  icon: "Bomb",
  src: INLINE_AUDIO,
})

const heavyEpisode = buildEpisodeFile()
const heavyJson = JSON.stringify(heavyEpisode)
const heavyBytes = episodeJsonBytes(JSON.stringify(heavyEpisode, null, 2))
check(
  "в JSON выпуска нет подстрок data:image и data:audio",
  !heavyJson.includes("data:image") &&
    !heavyJson.includes("data:audio") &&
    !heavyJson.includes("data:")
)
const heavyTrack = heavyEpisode.tracks.find((item) => item.id === heavyTrackId)
const heavySfx = (heavyEpisode.soundpad ?? []).find(
  (slot) => slot.id === heavySfxId
)
check(
  "вместо встроенной картинки в JSON остаётся пустое поле",
  heavyEpisode.backgrounds.find((item) => item.id === heavySceneId)?.src === "" &&
    heavyTrack?.audioSrc === "" &&
    heavyTrack?.coverSrc === "" &&
    heavySfx?.src === "" &&
    heavyEpisode.characters[0].avatarSrc === ""
)
check(
  "JSON выпуска со сценами, персонажами и заметками весит меньше 500 КБ",
  heavyBytes < EPISODE_JSON_LIMIT_BYTES,
  formatAssetSize(heavyBytes)
)
check("страховка экспорта не находит грязных полей", findInlineAssetLeak(heavyEpisode) === null)
check(
  "перечислены все поля-ассеты выпуска",
  episodeAssetFields(heavyEpisode).length ===
    heavyEpisode.backgrounds.length +
      heavyEpisode.characters.length * 2 +
      heavyEpisode.tracks.length * 2 +
      (heavyEpisode.soundpad?.length ?? 0)
)

// Грязный файл: Base64, blob-ссылка и чужие системные пути в одном наборе.
const dirtyFile: EpisodeFile = {
  backgrounds: [
    {
      id: "bg-dirty",
      title: "Грязная сцена",
      src: INLINE_IMAGE,
      actGroup: "Завязка",
      isBattlemap: false,
    },
  ],
  characters: [
    {
      id: "char-dirty",
      name: "Алхимик",
      role: "NPC",
      initials: "А",
      category: "npc",
      avatarSrc: "C:\\proj\\assets\\characters\\алхимик_токен.png",
      fullBodyPngSrc: "/Users/me/proj/art/алхимик.png",
    },
  ],
  tracks: [
    {
      id: "track-dirty",
      title: "Тема",
      artist: "Автор",
      duration: "1:00",
      tag: "Прочее",
      audioSrc: "blob:http://localhost/dead",
      coverSrc: INLINE_IMAGE,
    },
  ],
  mapTokens: [],
  sceneNotes: {},
}
const dirtyResult = sanitizeEpisodeForExport(dirtyFile)
check(
  "sanitize вычищает Base64, blob и чужие пути, оставляя /assets/...",
  dirtyResult.file.backgrounds[0].src === "" &&
    dirtyResult.file.tracks[0].audioSrc === "" &&
    dirtyResult.file.tracks[0].coverSrc === "" &&
    dirtyResult.file.characters[0].fullBodyPngSrc === "" &&
    dirtyResult.file.characters[0].avatarSrc ===
      "/assets/characters/алхимик_токен.png",
  dirtyResult.file.characters[0].avatarSrc
)
check(
  "sanitize перечисляет причины по каждому выброшенному полю",
  dirtyResult.issues
    .map((issue) => `${issue.field}:${issue.reason}`)
    .join(", ") ===
    "backgrounds[0].src:inline, characters[0].fullBodyPngSrc:system-path, " +
      "tracks[0].audioSrc:session-url, tracks[0].coverSrc:inline",
  dirtyResult.issues.map((issue) => issue.reason).join(",")
)

// Постоянные выпуски (`episodes/`) и кэш (`cache/`) — обе зоны проходят
// санитизацию без изменений: файлы отдаёт тот же сервер, что раздаёт статику.
const zonedFile: EpisodeFile = {
  backgrounds: [
    {
      id: "bg-zone",
      title: "Из постоянного выпуска",
      src: "episodes/ep-01/scenes/порт в тумане.jpg",
      actGroup: "Завязка",
      isBattlemap: false,
    },
  ],
  characters: [
    {
      id: "item-zone",
      name: "Меч из выпуска",
      role: "Предмет",
      initials: "МВ",
      category: "item",
      avatarSrc: "episodes/ep-01/items/меч.png",
      fullBodyPngSrc: `/assets/cache/items/меч-${NFD_AND}.png`,
    },
  ],
  tracks: [
    {
      id: "track-zone",
      title: "Из кэша",
      artist: "Автор",
      duration: "1:00",
      tag: "Прочее",
      audioSrc: `/assets/cache/music/${NFD_AND}лка.mp3`,
      coverSrc: "",
    },
  ],
  mapTokens: [],
  sceneNotes: {},
}
const zonedResult = sanitizeEpisodeForExport(zonedFile)
check(
  "sanitize сохраняет пути episodes/ и cache/, приводя их к NFC",
  zonedResult.issues.length === 0 &&
    zonedResult.file.backgrounds[0].src ===
      "/assets/episodes/ep-01/scenes/порт в тумане.jpg" &&
    zonedResult.file.characters[0].avatarSrc ===
      "/assets/episodes/ep-01/items/меч.png" &&
    zonedResult.file.characters[0].fullBodyPngSrc ===
      `/assets/cache/items/меч-${NFC_AND}.png` &&
    zonedResult.file.tracks[0].audioSrc ===
      `/assets/cache/music/${NFC_AND}лка.mp3`,
  zonedResult.file.characters[0].fullBodyPngSrc
)

let dirtyRejected = false
try {
  assertNoInlineAssets(dirtyFile)
} catch {
  dirtyRejected = true
}
check("запись файла с Base64 прерывается ошибкой", dirtyRejected)

let cleanAccepted = false
try {
  assertNoInlineAssets(heavyEpisode)
  cleanAccepted = true
} catch {
  cleanAccepted = false
}
check("чистый файл проходит страховку экспорта", cleanAccepted)

check(
  "имя файла ассета безопасно для Windows, macOS и URL",
  assetFileName("bg-harbor", "Порт в тумане", "jpg") ===
    "bg-harbor-порт-в-тумане.jpg" &&
    assetFileName("char-1", "", "png") === "char-1.png" &&
    assetFileName("track-1", "Тема «Бой»", "mp3") === "track-1-тема-бой.mp3" &&
    !assetFileName("bg-1", "../Злой путь", "png").includes("/") &&
    assetFileName("", "", "png") === "asset.png" &&
    slugifyAssetName("Порт в тумане") === "порт-в-тумане" &&
    slugifyAssetName("   ..   ") === "",
  assetFileName("bg-harbor", "Порт в тумане", "jpg")
)
check(
  "расширение файла берётся из MIME data-URL",
  extensionFromDataUrl("data:image/webp;base64,AA") === "webp" &&
    extensionFromDataUrl("data:audio/mpeg;base64,AA") === "mp3" &&
    extensionFromDataUrl("data:application/octet-stream;base64,AA") === "bin" &&
    extensionFromDataUrl("не data-url") === "bin"
)
check(
  "системные пути и инлайн-ассеты распознаются",
  isInlineAsset("data:image/png;base64,AA") &&
    !isInlineAsset("/assets/scenes/x.png") &&
    isSystemPath("D:\\proj\\assets\\x.png") &&
    isSystemPath("file:///Users/me/x.png") &&
    isSystemPath("/Users/me/art/x.png") &&
    !isSystemPath("/assets/scenes/x.png") &&
    !isSystemPath("https://cdn.example.com/x.png")
)
check(
  "размер файла выпуска читается человеком",
  formatAssetSize(2048) === "2.0 КБ" &&
    formatAssetSize(300 * 1024) === "300 КБ" &&
    formatAssetSize(2 * 1024 * 1024) === "2.0 МБ",
  formatAssetSize(heavyBytes)
)

// Сторожевой таймер /screen обязан короче ожидания Мастера: иначе Мастер успел бы
// показать свою оценку раньше, чем экран пересоберёт зависший движок.
check(
  "сторожевой таймер кубиков короче ожидания Мастера с экраном",
  DICE_ROLL_WATCHDOG_MS > 0 && DICE_ROLL_WATCHDOG_MS < ROLL_WAIT_WITH_SCREEN_MS,
  `${DICE_ROLL_WATCHDOG_MS} мс`
)
check(
  "локальная оценка броска укладывается в грани кубиков",
  estimateDiceRoll([20, 6, 6]).length === 3 &&
    estimateDiceRoll([20, 6, 6]).every(
      (die) => die.value >= 1 && die.value <= die.sides
    ) &&
    diceSum([
      { sides: 20, value: 7 },
      { sides: 6, value: 3 },
    ]) === 10
)

// Флаг «≈» приезжает с /screen по сокету: физика не ответила, значения случайные.
resetSmokeEpisode()
store().triggerDiceRoll(["1d20"])
store().completeDiceRoll([{ sides: 20, value: 7 }], 7, true)
const forcedRoll = store().lastRoll
check(
  "флаг «≈» с /screen доезжает до плашки",
  forcedRoll !== null &&
    forcedRoll.estimated === true &&
    formatRollBreakdown(forcedRoll.dice, forcedRoll.sum, forcedRoll.estimated).startsWith(
      "≈"
    ),
  formatRollBreakdown(forcedRoll?.dice ?? [], forcedRoll?.sum ?? 0)
)
store().clearRoll()

// --- Саундпад: слоты, экспорт выпуска и глобальный плеер эффектов ---
resetSmokeEpisode()
check("саундпад стартует пустым (плиток нет)", store().soundpad.length === 0)

const sfxId = store().addSoundpadSlot({
  title: "   ",
  icon: "Bomb",
  src: " data:audio/mpeg;base64,AAAA ",
})
const sfxSlot = store().soundpad.find((slot) => slot.id === sfxId)
check(
  "addSoundpadSlot: имя по умолчанию, путь обрезан, иконка проверена",
  sfxSlot?.title === "Звук 1" &&
    sfxSlot.icon === "Bomb" &&
    sfxSlot.src === "data:audio/mpeg;base64,AAAA",
  String(sfxSlot?.title)
)

const foreignIconId = store().addSoundpadSlot({
  title: "Чужой",
  icon: "NotAnIcon",
  src: "/assets/soundpad/x.mp3",
})
check(
  "незнакомая иконка заменяется на объявленную по умолчанию",
  store().soundpad.find((slot) => slot.id === foreignIconId)?.icon ===
    DEFAULT_SOUNDPAD_ICON
)

store().updateSoundpadSlot(sfxId, { title: "Гром", icon: "Zap" })
const editedSfx = store().soundpad.find((slot) => slot.id === sfxId)
check(
  "updateSoundpadSlot меняет название и иконку",
  editedSfx?.title === "Гром" && editedSfx.icon === "Zap"
)

// Экспорт/импорт: встроенный звук в JSON не попадает, слот остаётся без файла.
store().importEpisode(parseEpisodeFile(JSON.stringify(buildEpisodeFile())))
const sfxAfterImport = store().soundpad.find((slot) => slot.id === sfxId)
check(
  "встроенный звук саундпада не едет в файл выпуска",
  sfxAfterImport?.title === "Гром" &&
    sfxAfterImport?.icon === "Zap" &&
    sfxAfterImport?.src === "",
  String(sfxAfterImport?.src)
)

// Файл с чужой машины: пути ОС становятся /assets/..., чужие иконки — по умолчанию.
store().importEpisode(
  parseEpisodeFile(
    JSON.stringify({
      campaign: "Саундпад",
      backgrounds: [
        {
          id: "bg-map",
          title: "Карта",
          src: "/placeholders/background-1.svg",
          actGroup: "Завязка",
          isBattlemap: true,
        },
      ],
      characters: [],
      tracks: [],
      soundpad: [
        {
          id: "sfx-1",
          title: "Шаги",
          icon: "Ghost",
          src: "C:\\proj\\assets\\soundpad\\steps.mp3",
        },
        {
          title: "Из macOS",
          icon: "Banana",
          src: "/Users/me/proj/assets/soundpad/scream.mp3",
        },
      ],
      mapTokens: [],
      sceneNotes: {},
    })
  )
)
check(
  "импорт саундпада: путь → /assets/..., чужая иконка → по умолчанию",
  store().soundpad.length === 2 &&
    store().soundpad[0].src === "/assets/soundpad/steps.mp3" &&
    store().soundpad[0].icon === "Ghost" &&
    store().soundpad[0].title === "Шаги" &&
    store().soundpad[1].src === "/assets/soundpad/scream.mp3" &&
    store().soundpad[1].icon === DEFAULT_SOUNDPAD_ICON,
  store().soundpad[0]?.src
)

check(
  "набор иконок саундпада: тематические и все есть в мапе lucide",
  SOUNDPAD_ICON_NAMES.length >= 10 &&
    new Set(SOUNDPAD_ICON_NAMES).size === SOUNDPAD_ICON_NAMES.length &&
    SOUNDPAD_ICON_NAMES.every((name) => Boolean(soundpadIcons[name])) &&
    isSoundpadIconName(SOUNDPAD_ICON_NAMES[0]) &&
    !isSoundpadIconName("Banana") &&
    (
      [
        "Swords",
        "Skull",
        "Flame",
        "Zap",
        "Sparkles",
        "ShieldAlert",
        "Volume2",
        "Footprints",
        "Bomb",
        "HeartPulse",
        "Ghost",
        "DoorOpen",
      ] as string[]
    ).every((name) => (SOUNDPAD_ICON_NAMES as readonly string[]).includes(name)),
  `${SOUNDPAD_ICON_NAMES.length} иконок`
)
check(
  "плеер эффектов вне браузера молчит и не падает",
  playSfx("") === false &&
    playSfx("/assets/soundpad/x.mp3") === false &&
    activeSfxCount() === 0
)

// --- Видео-сцены и множественное удаление ---
check(
  "видео определяется по расширению пути",
  isVideoSrc("/assets/videos/intro.mp4") &&
    isVideoSrc("/assets/scenes/clip.WEBM") &&
    !isVideoSrc("/assets/scenes/forest.jpg") &&
    !isVideoSrc("") &&
    !isVideoSrc("/placeholders/background-1.svg")
)
check(
  "видео-файл из проводника узнаётся по MIME и по имени",
  isVideoFile({ type: "video/mp4", name: "clip" }) &&
    isVideoFile({ type: "", name: "clip.webm" }) &&
    !isVideoFile({ type: "image/png", name: "forest.png" })
)
check(
  "зацикливание видео включено по умолчанию",
  isLoopEnabled({}) &&
    isLoopEnabled({ isLoop: true }) &&
    !isLoopEnabled({ isLoop: false })
)
check(
  "таймкод плеера: 00:14 / 01:30 / 1:01:30",
  formatMediaTime(14) === "00:14" &&
    formatMediaTime(90) === "01:30" &&
    formatMediaTime(3690) === "1:01:30" &&
    formatMediaTime(0) === "00:00" &&
    formatMediaTime(Number.NaN) === "00:00",
  formatMediaTime(90)
)

// Перемотка применяется только к заметно другой позиции: иначе текущий кадр
// дёргался бы на каждой команде паузы в обоих окнах.
/** Метка «из будущего»: проверяем рост счётчика рядом с тестом, детерминированно. */
const farSeekId = 9_000_000_000_000
check(
  "порог перемотки 0.3 с: мелкие расхождения игнорируются",
  shouldSeekVideo(0, 0) === false &&
    shouldSeekVideo(41.9, 42) === false &&
    shouldSeekVideo(41.5, 42) === true &&
    shouldSeekVideo(0, 42) === true
)
check(
  "метка события перемотки растёт даже внутри одной миллисекунды",
  // Метка из «далёкого будущего» увеличивается ровно на единицу: так две команды
  // в одну миллисекунду получают разные метки и обе доезжают до /screen.
  nextSeekId(0) > 0 &&
    nextSeekId(farSeekId) === farSeekId + 1 &&
    nextSeekId(farSeekId) !== farSeekId,
  String(nextSeekId(farSeekId))
)

// Защита клавиши Delete: в полях ввода и в заметках она удаляет текст, а не сцены.
/** Фейковый узел для проверки защиты клавиш: в Node DOM нет. */
const fakeTarget = (node: { tagName: string; isContentEditable?: boolean }) =>
  node as unknown as EventTarget
check(
  "Delete не трогает элементы, когда пишут текст",
  isTextEntryTarget(fakeTarget({ tagName: "INPUT" })) &&
    isTextEntryTarget(fakeTarget({ tagName: "TEXTAREA" })) &&
    isTextEntryTarget(fakeTarget({ tagName: "DIV", isContentEditable: true })) &&
    !isTextEntryTarget(fakeTarget({ tagName: "DIV" })) &&
    !isTextEntryTarget(null)
)

// Настройка зацикливания живёт в сторе и переживает экспорт/импорт выпуска.
resetSmokeEpisode()
const videoScene = store().addBackground("Завязка", {
  title: "Живой фон",
  src: "/assets/videos/bg-harbor-intro.mp4",
  activate: false,
})
check(
  "видео-сцена зацикливается по умолчанию",
  isLoopEnabled(
    store().backgrounds.find((item) => item.id === videoScene) ?? {
      isLoop: true,
    }
  )
)
store().setBackgroundLoop(videoScene, false)
check(
  "setBackgroundLoop выключает повтор у нужной сцены",
  store().backgrounds.find((item) => item.id === videoScene)?.isLoop === false
)
const exportedVideoScene = parseEpisodeFile(
  JSON.stringify(buildEpisodeFile())
).backgrounds.find((item) => item.id === videoScene)
check(
  "выключенный повтор уезжает в файл выпуска и возвращается",
  exportedVideoScene?.isLoop === false &&
    exportedVideoScene?.src === "/assets/videos/bg-harbor-intro.mp4",
  String(exportedVideoScene?.src)
)

// Пауза, повтор и перемотка — живые команды: их применяют оба окна, а не только
// плеер Мастера (на /screen они приезжают снапшотом).
resetSmokeEpisode()
check(
  "видео стартует играющим, зацикленным и с начала",
  store().videoPlayback.isPlaying === true &&
    store().videoPlayback.isLoop === true &&
    store().videoPlayback.seekTime === 0 &&
    store().videoPlayback.seekId > 0
)
store().toggleVideoPlaying()
check(
  "toggleVideoPlaying ставит видео на паузу",
  store().videoPlayback.isPlaying === false
)
store().setVideoPlaying(true)
check("setVideoPlaying возобновляет видео", store().videoPlayback.isPlaying === true)

const seekIdBefore = store().videoPlayback.seekId
store().seekVideo(42)
check(
  "seekVideo меняет время и выдаёт новую метку события",
  store().videoPlayback.seekTime === 42 &&
    store().videoPlayback.seekId !== seekIdBefore,
  `${seekIdBefore} → ${store().videoPlayback.seekId}`
)

// Повтор: живое состояние (его видит /screen) и настройка самой сцены (её
// экспортирует файл выпуска).
const liveSceneId = store().activeBackgroundId
store().setVideoLoop(false)
check(
  "setVideoLoop выключает повтор и в плеере, и в настройках сцены",
  store().videoPlayback.isLoop === false &&
    store().backgrounds.find((item) => item.id === liveSceneId)?.isLoop === false
)

// Смена сцены: новое видео стартует с 00:00 и играет — синхронно в обоих окнах.
store().setVideoPlaying(false)
store().seekVideo(30)
const otherScene = store().backgrounds.find((item) => item.id !== liveSceneId)
if (otherScene) {
  store().setBackgroundLoop(otherScene.id, false)
  store().setActiveBackground(otherScene.id)
  check(
    "смена сцены сбрасывает видео на 00:00 и Play",
    store().videoPlayback.isPlaying === true &&
      store().videoPlayback.seekTime === 0 &&
      store().activeBackgroundId === otherScene.id,
    `пауза → ${store().videoPlayback.isPlaying}, время → ${store().videoPlayback.seekTime}`
  )
  check(
    "повтор новой сцены берётся из её настроек",
    store().videoPlayback.isLoop === false
  )
}

// Пачечное удаление: персонажи уходят с карты и со сцены.
resetSmokeEpisode()
const doomedCharacters = store()
  .characters.slice(0, 2)
  .map((item) => item.id)
const survivorToken = store().addToken(
  store().characters[2].id,
  1,
  1,
  store().activeMapId ?? undefined
)
store().toggleCharacterOnStage(doomedCharacters[0])
const charactersBefore = store().characters.length
const tokensBefore = store().mapTokens.length
const doomedTokens = store().mapTokens.filter((token) =>
  doomedCharacters.includes(token.characterId)
).length
store().deleteBatchCharacters(doomedCharacters)
check(
  "deleteBatchCharacters: персонажи, токены и сцена очищены",
  doomedTokens > 0 &&
    store().characters.length === charactersBefore - 2 &&
    !store().characters.some((item) => doomedCharacters.includes(item.id)) &&
    !store().mapTokens.some((token) =>
      doomedCharacters.includes(token.characterId)
    ) &&
    store().mapTokens.some((token) => token.id === survivorToken) &&
    store().mapTokens.length === tokensBefore - doomedTokens &&
    store().activeCharacterIds.length === 0,
  `токенов: ${store().mapTokens.length}, удалено: ${doomedTokens}`
)

// Пачечное удаление сцен: эфир переезжает на соседнюю, заметки уходят.
resetSmokeEpisode()
const doomedScenes = store()
  .backgrounds.slice(0, 3)
  .map((item) => item.id)
const liveSceneBefore = store().activeBackgroundId
// Заметка акта, из которого удаляем сцены, должна уцелеть: она не про сцену.
const batchedNoteGroup = store().backgrounds[1].actGroup
store().updateGroupNote(batchedNoteGroup, "Заметка акта при пачечном удалении")
store().deleteBatchBackgrounds(doomedScenes)
check(
  "deleteBatchBackgrounds: сцены, заметки акта и эфир согласованы",
  !store().backgrounds.some((item) => doomedScenes.includes(item.id)) &&
    store().groupNotes[batchedNoteGroup] ===
      "Заметка акта при пачечном удалении" &&
    !doomedScenes.includes(store().activeBackgroundId ?? "") &&
    store().backgrounds.length > 0,
  store().activeBackgroundId === liveSceneBefore
    ? "эфир не трогали"
    : `эфир переехал: ${store().activeBackgroundId}`
)

// Последнюю сцену выпуска пачка не удаляет: на проекторе должно быть что показывать.
resetSmokeEpisode()
store().deleteBatchBackgrounds(store().backgrounds.map((item) => item.id))
check(
  "пачка не оставляет выпуск без сцен",
  store().backgrounds.length === 1
)

// Треки и саундпад удаляются пачкой целиком.
resetSmokeEpisode()
const doomedTracks = store().tracks.slice(0, 2).map((item) => item.id)
store().deleteBatchTracks(doomedTracks)
check(
  "deleteBatchTracks убирает выбранные треки",
  store().tracks.length === seedTracks - 2 &&
    !store().tracks.some((track) => doomedTracks.includes(track.id))
)
const doomedSfx = [
  store().addSoundpadSlot({ title: "Один", icon: "Bomb", src: "/a.mp3" }),
  store().addSoundpadSlot({ title: "Два", icon: "Zap", src: "/b.mp3" }),
  store().addSoundpadSlot({ title: "Три", icon: "Flame", src: "/c.mp3" }),
]
store().deleteBatchSoundpadSlots([doomedSfx[0], doomedSfx[2]])
check(
  "deleteBatchSoundpadSlots убирает только выбранные слоты",
  store().soundpad.length === 1 && store().soundpad[0].id === doomedSfx[1]
)

check(
  "расширения видео поддержаны при выгрузке ассетов",
  extensionFromDataUrl("data:video/mp4;base64,AA") === "mp4" &&
    extensionFromDataUrl("data:video/webm;base64,AA") === "webm"
)
check(
  "видео едет в файл выпуска ссылкой, а не Base64",
  !JSON.stringify(buildEpisodeFile()).includes("data:video")
)

// --- Фаза 25: slug выпуска — папка ассетов `assets/episodes/<slug>/` ---
check(
  "slug выпуска транслитерирует кириллицу",
  generateEpisodeSlug("Порт в тумане") === "port-v-tumane" &&
    generateEpisodeSlug("Выпуск №2: Яблоко Раздора") ===
      "vypusk-2-yabloko-razdora",
  generateEpisodeSlug("Выпуск №2: Яблоко Раздора")
)
check(
  "slug безопасен для Windows, macOS, ZIP и URL",
  generateEpisodeSlug('Выпуск: "Лето" / 2026? \\ test') ===
    "vypusk-leto-2026-test" &&
    /^[a-z0-9][a-z0-9-]*$/.test(generateEpisodeSlug("Порт в тумане")) &&
    generateEpisodeSlug("a".repeat(80)).length === 48 &&
    generateEpisodeSlug("port-v-tumane") === "port-v-tumane",
  generateEpisodeSlug('Выпуск: "Лето" / 2026? \\ test')
)
check(
  "пустое название даёт запасной slug",
  generateEpisodeSlug("") === FALLBACK_EPISODE_SLUG &&
    generateEpisodeSlug("   ") === FALLBACK_EPISODE_SLUG &&
    generateEpisodeSlug("!!!") === FALLBACK_EPISODE_SLUG
)
check(
  "путь ассета выпуска собирается из slug",
  episodeAssetFolder("Порт в тумане", ASSET_FOLDERS.scenes) ===
    "episodes/port-v-tumane/scenes" &&
    buildEpisodeAssetUrl("port-v-tumane", "music", "theme.mp3") ===
      "/assets/episodes/port-v-tumane/music/theme.mp3",
  buildEpisodeAssetUrl("port-v-tumane", "music", "theme.mp3")
)

// Стор держит slug рядом с названием: переименование пересчитывает папку,
// сброс выпуска возвращает папку по умолчанию, импорт берёт slug из файла.
resetSmokeEpisode()
check(
  "новый выпуск получает slug по названию кампании",
  store().episodeSlug === generateEpisodeSlug(campaign.title),
  store().episodeSlug
)
store().renameEpisode("Порт в тумане")
check(
  "переименование выпуска переносит папку ассетов",
  store().episodeTitle === "Порт в тумане" &&
    store().episodeSlug === "port-v-tumane",
  store().episodeSlug
)
check(
  "файл выпуска несёт slug, а не Base64",
  buildEpisodeFile().episodeSlug === "port-v-tumane" &&
    episodeFileName(buildEpisodeFile().episodeSlug ?? "") ===
      "port-v-tumane.json"
)
store().renameEpisode("Яблоко Раздора")
check(
  "slug пересчитывается на каждом шаге правки названия",
  store().episodeSlug === "yabloko-razdora",
  store().episodeSlug
)

// Импорт чужого выпуска: slug из файла — это уже готовая папка на машине
// Продюсера, поэтому пути `/assets/episodes/<slug>/...` сходятся без пересчёта.
store().importEpisode(
  parseEpisodeFile(
    JSON.stringify({
      episodeSlug: "ep-2-yabloko",
      campaign: "Яблоко Раздора",
      backgrounds: [
        {
          id: "bg-slug",
          title: "Сцена",
          src: "/assets/episodes/ep-2-yabloko/scenes/forest.jpg",
          actGroup: "Завязка",
          isBattlemap: false,
        },
      ],
      characters: [],
      tracks: [],
      mapTokens: [],
      sceneNotes: {},
    })
  )
)
check(
  "импорт берёт slug папки из файла выпуска",
  store().episodeSlug === "ep-2-yabloko" &&
    store().episodeTitle === "Яблоко Раздора" &&
    store().backgrounds[0].src ===
      "/assets/episodes/ep-2-yabloko/scenes/forest.jpg",
  store().episodeSlug
)
store().importEpisode(
  parseEpisodeFile(
    JSON.stringify({
      campaign: "Старый выпуск",
      backgrounds: [
        {
          id: "bg-old",
          title: "Сцена",
          src: "/assets/cache/scenes/forest.jpg",
          actGroup: "Завязка",
          isBattlemap: false,
        },
      ],
      characters: [],
      tracks: [],
      mapTokens: [],
      sceneNotes: {},
    })
  )
)
check(
  "старый файл без slug получает папку из названия, путь кэша не трогается",
  store().episodeSlug === "staryi-vypusk" &&
    store().backgrounds[0].src === "/assets/cache/scenes/forest.jpg",
  store().episodeSlug
)

// Чистый выпуск: сброс даёт пустое состояние, а экспорт/импорт пустого выпуска
// не падает — раньше файл без сцен считался ошибкой и импорт прерывался.
store().resetEpisode()
check(
  "resetEpisode даёт пустой выпуск без сцен, треков и эфира",
  store().backgrounds.length === 0 &&
    store().characters.length === 0 &&
    store().tracks.length === 0 &&
    store().soundpad.length === 0 &&
    store().mapTokens.length === 0 &&
    store().activeBackgroundId === null &&
    store().activeMapId === null &&
    store().sceneGroups.length === 1
)
store().importEpisode(parseEpisodeFile(JSON.stringify(buildEpisodeFile())))
check(
  "пустой выпуск переживает экспорт и импорт",
  store().backgrounds.length === 0 &&
    store().activeBackgroundId === null &&
    store().activeMapId === null
)

// --- Фаза 26: заметки и музыка живут на группах сцен (актах) ---
resetSmokeEpisode()
store().updateGroupNote("Завязка", "Акт открытия")
store().setGroupTrack("1 акт", {
  id: "grp-track-1",
  title: "Катакомбы",
  src: "/assets/episodes/smoke/1-akt/theme.mp3",
})
check(
  "заметка и трек ложатся на группы сцен",
  store().groupNotes["Завязка"] === "Акт открытия" &&
    store().groupTracks["1 акт"]?.title === "Катакомбы"
)
const groupFile = buildEpisodeFile()
check(
  "файл выпуска несёт заметки и треки групп, а заметок сцен в нём нет",
  groupFile.groupNotes?.["Завязка"] === "Акт открытия" &&
    groupFile.groupTracks?.["1 акт"]?.src ===
      "/assets/episodes/smoke/1-akt/theme.mp3" &&
    !("sceneNotes" in groupFile)
)
check(
  "трек группы попадает в список ассетов выпуска",
  episodeAssetFields(groupFile).some(
    (field) => field.field === 'groupTracks["1 акт"].src'
  )
)

// Импорт: системный путь трека акта приводится к относительному `/assets/...`.
store().importEpisode(
  parseEpisodeFile(
    JSON.stringify({
      campaign: "Треки актов",
      backgrounds: [
        {
          id: "bg-grp",
          title: "Сцена",
          src: "",
          actGroup: "1 акт",
          isBattlemap: false,
        },
      ],
      characters: [],
      tracks: [],
      mapTokens: [],
      groupTracks: {
        "1 акт": {
          id: "g",
          title: "Кроссфейд",
          src: "D:\\proj\\assets\\music\\theme.mp3",
        },
      },
    })
  )
)
check(
  "трек группы из файла нормализуется в /assets/...",
  store().groupTracks["1 акт"]?.src === "/assets/music/theme.mp3",
  store().groupTracks["1 акт"]?.src ?? "нет трека"
)

// Переименование акта переносит его материалы, удаление — забирает с собой.
resetSmokeEpisode()
store().updateGroupNote("Финал", "Финальная сцена")
store().setGroupTrack("Финал", {
  id: "grp-final",
  title: "Финал",
  src: "/assets/final.mp3",
})
store().renameSceneGroup("Финал", "Эпилог")
check(
  "переименование акта переносит заметку и трек",
  store().groupNotes["Эпилог"] === "Финальная сцена" &&
    store().groupTracks["Эпилог"]?.title === "Финал" &&
    store().groupNotes["Финал"] === undefined &&
    store().groupTracks["Финал"] === undefined,
  store().groupTracks["Эпилог"]?.title ?? "нет трека"
)
store().removeGroupTrack("Эпилог")
check(
  "removeGroupTrack убирает музыку акта",
  store().groupTracks["Эпилог"] === undefined
)

// Старый файл: заметки лежат по сценам — переносим их на акты сцен.
store().importEpisode(
  parseEpisodeFile(
    JSON.stringify({
      campaign: "Старый выпуск",
      backgrounds: [
        {
          id: "bg-old-1",
          title: "Сцена 1",
          src: "",
          actGroup: "Завязка",
          isBattlemap: false,
        },
        {
          id: "bg-old-2",
          title: "Сцена 2",
          src: "",
          actGroup: "2 акт",
          isBattlemap: false,
        },
      ],
      characters: [],
      tracks: [],
      mapTokens: [],
      sceneNotes: {
        "bg-old-1": "Заметка первой сцены",
        "bg-old-2": "Заметка второй сцены",
      },
    })
  )
)
check(
  "заметки старого файла (по сценам) переносятся на акты",
  store().groupNotes["Завязка"] === "Заметка первой сцены" &&
    store().groupNotes["2 акт"] === "Заметка второй сцены",
  JSON.stringify(store().groupNotes)
)

// --- Фаза 27: музыка актов — решения движка (чистые функции) ---
// Смена сцены внутри акта: трек тот же — музыку не трогаем и не перезапускаем.
check(
  "переключение сцен внутри акта не трогает музыку",
  resolveGroupTrackAction({
    requestedId: "act-a",
    currentId: "act-a",
    manualPlaying: false,
    suspended: false,
  }).type === "keep"
)
// Переход в другой акт с треком: включаем новый трек с начала (кроссфейдом).
const switchGroupAction = resolveGroupTrackAction({
  requestedId: "act-b",
  currentId: "act-a",
  manualPlaying: false,
  suspended: false,
})
check(
  "другой акт с треком включает его с начала",
  switchGroupAction.type === "start" && switchGroupAction.restart,
  JSON.stringify(switchGroupAction)
)
// Акт без трека: музыка предыдущего акта продолжает играть.
check(
  "акт без трека оставляет музыку играть",
  resolveGroupTrackAction({
    requestedId: null,
    currentId: "act-a",
    manualPlaying: false,
    suspended: false,
  }).type === "keep"
)
// Ручной трек из правой панели перекрывает музыку акта и откладывает её.
check(
  "ручной трек откладывает музыку акта",
  resolveGroupTrackAction({
    requestedId: "act-b",
    currentId: "act-a",
    manualPlaying: true,
    suspended: false,
  }).type === "defer"
)
// Пауза ручного трека: музыка акта возвращается с сохранённой позиции.
const resumeAction = resolveGroupTrackAction({
  requestedId: "act-a",
  currentId: "act-a",
  manualPlaying: false,
  suspended: true,
})
check(
  "пауза ручного трека возвращает музыку акта на сохранённую позицию",
  resumeAction.type === "start" &&
    !resumeAction.restart &&
    shouldResumeGroupTrack({ suspended: true, manualPlaying: false }) &&
    !shouldResumeGroupTrack({ suspended: true, manualPlaying: true }) &&
    !shouldResumeGroupTrack({ suspended: false, manualPlaying: false }),
  JSON.stringify(resumeAction)
)

// --- Фаза 28: состояния персонажей (варианты внешнего вида) ---
resetSmokeEpisode()
const stateHeroId = store().characters[0].id
const heroState = () =>
  store().characters.find((item) => item.id === stateHeroId)!
check(
  "персонаж без состояний считается «Обычным»",
  getCharacterActiveState(store().characters[0]).id ===
    DEFAULT_CHARACTER_STATE_ID &&
    getCharacterActiveState(store().characters[0]).name ===
      DEFAULT_CHARACTER_STATE_NAME &&
    characterStates(store().characters[0]).length === 1 &&
    characterAvatarSrc(store().characters[0]) ===
      store().characters[0].avatarSrc &&
    characterFullBodySrc(store().characters[0]) ===
      store().characters[0].fullBodyPngSrc
)
const woundedStateId = store().addCharacterState(stateHeroId, {
  name: "Раненый",
  avatarSrc: "data:image/png;base64,AA",
  fullBodyPngSrc: "data:image/png;base64,BB",
})
check(
  "новое состояние сразу активно, «Обычное» остаётся на месте",
  getCharacterActiveState(heroState()).id === woundedStateId &&
    characterStates(heroState())
      .map((state) => state.name)
      .join(",") === "Обычное,Раненый" &&
    characterAvatarSrc(heroState()) === "data:image/png;base64,AA" &&
    characterFullBodySrc(heroState()) === "data:image/png;base64,BB"
)
store().setActiveCharacterState(stateHeroId, DEFAULT_CHARACTER_STATE_ID)
check(
  "переключение на «Обычное» возвращает базовые картинки",
  getCharacterActiveState(heroState()).id === DEFAULT_CHARACTER_STATE_ID &&
    characterAvatarSrc(heroState()) === heroState().avatarSrc
)
store().setActiveCharacterState(stateHeroId, woundedStateId)
store().updateCharacterImage(stateHeroId, {
  avatarSrc: "data:image/png;base64,CC",
})
check(
  "замена картинки правит активное состояние, а не «Обычное»",
  characterAvatarSrc(heroState()) === "data:image/png;base64,CC" &&
    heroState().avatarSrc === "/placeholders/character-1.svg"
)
store().removeCharacterState(stateHeroId, DEFAULT_CHARACTER_STATE_ID)
check(
  "«Обычное» состояние удалить нельзя",
  characterStates(heroState()).some(
    (state) => state.id === DEFAULT_CHARACTER_STATE_ID
  )
)
store().removeCharacterState(stateHeroId, woundedStateId)
check(
  "удаление активного состояния возвращает персонажа к «Обычному»",
  getCharacterActiveState(heroState()).id === DEFAULT_CHARACTER_STATE_ID &&
    !characterStates(heroState()).some((state) => state.id === woundedStateId)
)

// Состояния уезжают в файл выпуска, а их картинки — в список ассетов.
resetSmokeEpisode()
const statesCharacterId = store().characters[0].id
const exportedStateId = store().addCharacterState(statesCharacterId, {
  name: "В ярости",
  avatarSrc: "data:image/png;base64,AA",
  fullBodyPngSrc: "data:image/png;base64,BB",
})
const statesFile = buildEpisodeFile()
const exportedStateCharacter = statesFile.characters[0]
check(
  "файл выпуска хранит состояния и активное состояние, но не Base64",
  exportedStateCharacter.states?.length === 2 &&
    exportedStateCharacter.states[1].name === "В ярости" &&
    exportedStateCharacter.states[1].avatarSrc === "" &&
    exportedStateCharacter.activeStateId === exportedStateId &&
    !JSON.stringify(statesFile).includes("data:image")
)
check(
  "картинки состояний попадают в список ассетов выпуска",
  episodeAssetFields(statesFile).some(
    (field) =>
      field.field === "characters[0].states[1].fullBodyPngSrc"
  )
)

// Импорт: состояния читаются, а их пути приводятся к виду `/assets/...`.
store().importEpisode(
  parseEpisodeFile(
    JSON.stringify({
      campaign: "Состояния",
      backgrounds: [
        {
          id: "bg-state",
          title: "Сцена",
          src: "",
          actGroup: "Завязка",
          isBattlemap: false,
        },
      ],
      characters: [
        {
          id: "char-state",
          name: "Алхимик",
          role: "NPC",
          initials: "А",
          category: "npc",
          avatarSrc: "/placeholders/character-1.svg",
          fullBodyPngSrc: "/placeholders/character-1.svg",
          states: [
            {
              id: "default",
              name: "Обычное",
              avatarSrc: "/placeholders/character-1.svg",
              fullBodyPngSrc: "/placeholders/character-1.svg",
            },
            {
              id: "wounded",
              name: "Раненый",
              avatarSrc: "D:\\proj\\assets\\characters\\wounded.png",
              fullBodyPngSrc: "/Users/me/proj/assets/characters/раненый.png",
            },
          ],
          activeStateId: "wounded",
        },
      ],
      tracks: [],
      mapTokens: [],
      sceneNotes: {},
    })
  )
)
const importedStateCharacter = store().characters.find(
  (item) => item.id === "char-state"
)!
check(
  "импорт читает состояния и нормализует их пути",
  importedStateCharacter.activeStateId === "wounded" &&
    importedStateCharacter.states?.[1].avatarSrc ===
      "/assets/characters/wounded.png" &&
    importedStateCharacter.states?.[1].fullBodyPngSrc ===
      "/assets/characters/раненый.png" &&
    characterFullBodySrc(importedStateCharacter) ===
      "/assets/characters/раненый.png",
  characterFullBodySrc(importedStateCharacter)
)

// --- Фаза 29: выделение группы, кластеризация и прыжок по дуге ---
const clusterTarget = { cellX: 7, cellY: 3 }
const occupiedNearTarget = { cellX: 8, cellY: 3 }
const cluster = clusterTargetCells({
  target: clusterTarget,
  count: 4,
  occupied: [occupiedNearTarget],
  columns: GRID_COLUMNS,
  rows: GRID_ROWS,
})
check(
  "кластеризация: первая клетка — цель, клетки разные, занятая пропущена",
  cluster.length === 4 &&
    cellKey(cluster[0]) === cellKey(clusterTarget) &&
    new Set(cluster.map(cellKey)).size === 4 &&
    !cluster.some((cell) => cellKey(cell) === cellKey(occupiedNearTarget)),
  cluster.map(cellKey).join(" · ")
)
const clusterDistances = cluster.map((cell) =>
  cellDistance(cell, clusterTarget)
)
check(
  "кластеризация: клетки идут по возрастанию расстояния от цели",
  clusterDistances.every(
    (distance, index) => index === 0 || distance >= clusterDistances[index - 1]
  ),
  clusterDistances.map((distance) => distance.toFixed(2)).join(" ≤ ")
)
const clusterAroundOccupied = clusterTargetCells({
  target: { cellX: 0, cellY: 0 },
  count: 3,
  occupied: [{ cellX: 0, cellY: 0 }],
  columns: GRID_COLUMNS,
  rows: GRID_ROWS,
})
check(
  "кластеризация: занятую цель пропускаем — группа встаёт вокруг",
  clusterAroundOccupied.length === 3 &&
    !clusterAroundOccupied.some((cell) => cell.cellX === 0 && cell.cellY === 0),
  clusterAroundOccupied.map(cellKey).join(" · ")
)
check(
  "кластеризация: свободных клеток меньше запроса — отдаём сколько есть",
  clusterTargetCells({
    target: clusterTarget,
    count: GRID_COLUMNS * GRID_ROWS + 10,
    occupied: [],
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
  }).length === GRID_COLUMNS * GRID_ROWS
)

// Рамка выделения: центры фишек считаются в долях поля, рамка нормализуется.
const firstCellCenter = cellCenterFraction({ cellX: 0, cellY: 0 }, gridGeometry)
check(
  "центр клетки попадает внутрь своей клетки в долях поля",
  firstCellCenter.x > gridGeometry.offsetX &&
    firstCellCenter.x < gridGeometry.offsetX + gridGeometry.cellWidth &&
    firstCellCenter.y > gridGeometry.offsetY &&
    firstCellCenter.y < gridGeometry.offsetY + gridGeometry.cellHeight,
  `${firstCellCenter.x.toFixed(3)} · ${firstCellCenter.y.toFixed(3)}`
)
const marqueeBox = normalizeRect({ x: 0.5, y: 0.6 }, { x: 0.2, y: 0.1 })
check(
  "рамка выделения нормализуется: левый и верхний края — минимум",
  marqueeBox.left === 0.2 &&
    marqueeBox.top === 0.1 &&
    marqueeBox.right === 0.5 &&
    marqueeBox.bottom === 0.6
)
const tinyBox = {
  left: firstCellCenter.x - 0.01,
  right: firstCellCenter.x + 0.01,
  top: firstCellCenter.y - 0.01,
  bottom: firstCellCenter.y + 0.01,
}
check(
  "рамка выделения: центр внутри — попадание, центр за границей — нет",
  isPointInsideRect(firstCellCenter, tinyBox) &&
    !isPointInsideRect(
      { x: firstCellCenter.x + 0.2, y: firstCellCenter.y },
      tinyBox
    )
)

// Групповое перемещение: одна запись состояния — один снапшот на /screen.
resetSmokeEpisode()
const groupMapId = store().backgrounds.find((item) => item.isBattlemap)?.id ?? ""
const [groupHeroA, groupHeroB, groupHeroC, groupHeroD] = store().characters
const groupMoveIds = [
  store().addToken(groupHeroA.id, 0, 0, groupMapId),
  store().addToken(groupHeroB.id, 1, 0, groupMapId),
  store().addToken(groupHeroC.id, 2, 0, groupMapId),
]
const bystanderId = store().addToken(groupHeroD.id, 8, 3, groupMapId)
const groupMoving = groupMoveIds.map(
  (id) => store().mapTokens.find((token) => token.id === id)!
)
const groupCells = clusterTargetCells({
  target: clusterTarget,
  count: groupMoving.length,
  occupied: [{ cellX: 8, cellY: 3 }],
  columns: GRID_COLUMNS,
  rows: GRID_ROWS,
})
let tokenWrites = 0
const unsubscribeTokenWrites = useEpisodeStore.subscribe((state, previous) => {
  if (state.mapTokens !== previous.mapTokens) tokenWrites += 1
})
store().moveMultipleTokens(
  groupMoving.map((token, index) => ({
    tokenId: token.id,
    cellX: groupCells[index].cellX,
    cellY: groupCells[index].cellY,
  }))
)
unsubscribeTokenWrites()
const movedGroup = groupMoveIds.map(
  (id) => store().mapTokens.find((token) => token.id === id)!
)
check(
  "групповое перемещение: все фишки уехали одним обновлением состояния",
  tokenWrites === 1 &&
    movedGroup.every((token, index) => cellKey(token) === cellKey(groupCells[index])) &&
    movedGroup.some((token) => cellKey(token) === cellKey(clusterTarget)),
  `записей состояния: ${tokenWrites}, клетки: ${movedGroup.map(cellKey).join(" · ")}`
)
const mapTokenCells = store()
  .mapTokens.filter((token) => token.mapId === groupMapId)
  .map(cellKey)
check(
  "групповое перемещение: в одну клетку никто не встал",
  new Set(mapTokenCells).size === mapTokenCells.length,
  mapTokenCells.join(" · ")
)
const bystander = store().mapTokens.find((token) => token.id === bystanderId)!
check(
  "групповое перемещение: токен вне выделения остался на месте",
  cellKey(bystander) === "8,3" &&
    !movedGroup.some((token) => cellKey(token) === "8,3")
)

// Кадры прыжка — общий контракт панели Мастера и проектора.
check(
  "прыжок по дуге: отрыв 32 px, рост 1.25 и длинная тень в пике",
  TOKEN_JUMP_KEYFRAMES.y.join(",") === "0,-32,0" &&
    TOKEN_JUMP_KEYFRAMES.scale.join(",") === "1,1.25,1" &&
    TOKEN_JUMP_KEYFRAMES.filter.length === 3 &&
    TOKEN_JUMP_KEYFRAMES.filter[1].includes("20px 25px"),
  TOKEN_JUMP_KEYFRAMES.filter[1]
)
check(
  "перелёт 0.45 s, прыжок дольше и с пиком на середине",
  TOKEN_MOVE_DURATION === 0.45 &&
    TOKEN_JUMP_DURATION > TOKEN_MOVE_DURATION &&
    TOKEN_JUMP_TIMES.join(",") === "0,0.5,1"
)
check(
  "фишки анимируются Framer Motion в два слоя: координаты + высота прыжка",
  battleMapGridSource.includes('from "framer-motion"') &&
    battleMapGridSource.includes("useAnimationControls") &&
    battleMapGridSource.includes("TOKEN_MOVE_DURATION")
)
check(
  "выделенные фишки подсвечены золотой обводкой",
  battleMapGridSource.includes(
    "ring-2 ring-amber-400 ring-offset-2 ring-offset-background"
  )
)
check(
  "рамка выделения — янтарный полупрозрачный бокс, жесты по фишкам отсекаются",
  battleMapTabSource.includes("border-amber-400 bg-amber-400/10") &&
    battleMapTabSource.includes('closest("[data-map-token]")') &&
    battleMapGridSource.includes("data-map-token={token.id}") &&
    battleMapTabSource.includes("toggleTokenSelection")
)

// --- Фаза 30: /screen — монолитно чёрные поля кадрирования ---
check(
  "/screen: html и body получают background-color #000000 (html.screen-root)",
  /html\.screen-root,\s*html\.screen-root body \{\s*background-color:\s*#000000/.test(
    indexCssSource
  )
)
check(
  "/screen: контейнер страницы чёрный на весь экран, прозрачных подложек нет",
  obsScreenSource.includes(
    "bg-black w-screen h-screen flex items-center justify-center overflow-hidden"
  ) &&
    obsScreenSource.includes('classList.add("screen-root", "screen-scale")') &&
    !obsScreenSource.includes("bg-transparent")
)
check(
  "/screen: сцена тоже чёрная, серая заглушка осталась только панели Мастера",
  obsScreenSource.includes("shrink-0 bg-black") &&
    sceneStageSource.includes(") : showHint ? (")
)

// --- Фаза 31: состояния сцен («Ночь», «Пожар») ---
resetSmokeEpisode()
const stateSceneId = store().backgrounds[0].id
const stateScene = () =>
  store().backgrounds.find((item) => item.id === stateSceneId)!
const baseSceneSrc = stateScene().src
check(
  "сцена без states: базовый кадр считается «Обычным»",
  backgroundStates(stateScene()).length === 1 &&
    getBackgroundActiveState(stateScene()).id === DEFAULT_BACKGROUND_STATE_ID &&
    getBackgroundActiveState(stateScene()).name ===
      DEFAULT_BACKGROUND_STATE_NAME &&
    backgroundStateSrc(stateScene()) === baseSceneSrc &&
    !hasCustomBackgroundStates(stateScene()),
  getBackgroundActiveState(stateScene()).name
)
const nightStateId = store().addBackgroundState(stateSceneId, {
  name: "Ночь",
  src: "data:image/png;base64,NIGHT",
  isBattlemap: true,
})
check(
  "новое состояние сцены материализует «Обычное» и сразу становится активным",
  nightStateId.length > 0 &&
    backgroundStates(stateScene())[0].id === DEFAULT_BACKGROUND_STATE_ID &&
    getBackgroundActiveState(stateScene()).name === "Ночь" &&
    backgroundStateSrc(stateScene()) === "data:image/png;base64,NIGHT" &&
    hasCustomBackgroundStates(stateScene()) &&
    // Состояние может превратить сцену в карту местности.
    isBackgroundBattlemap(stateScene()) === true,
  getBackgroundActiveState(stateScene()).name
)
check(
  "«Обычное» хранит базовый кадр сцены, а не картинку состояния",
  backgroundStates(stateScene())[0].src === baseSceneSrc
)
store().updateBackgroundImage(stateSceneId, "data:image/png;base64,NIGHT2")
check(
  "замена картинки сцены правит активное состояние, а не «Обычное»",
  backgroundStateSrc(stateScene()) === "data:image/png;base64,NIGHT2" &&
    backgroundStates(stateScene())[0].src === baseSceneSrc
)
store().setActiveBackgroundState(stateSceneId, nightStateId)
store().removeBackgroundState(stateSceneId, nightStateId)
check(
  "удаление активного состояния возвращает сцену к «Обычному»",
  getBackgroundActiveState(stateScene()).id === DEFAULT_BACKGROUND_STATE_ID &&
    backgroundStateSrc(stateScene()) === baseSceneSrc &&
    !hasCustomBackgroundStates(stateScene())
)
store().removeBackgroundState(stateSceneId, DEFAULT_BACKGROUND_STATE_ID)
check(
  "«Обычное» у сцены удалить нельзя",
  backgroundStates(stateScene()).some(
    (item) => item.id === DEFAULT_BACKGROUND_STATE_ID
  )
)

// Состояния сцены уезжают в файл выпуска, а их картинки — в список ассетов.
resetSmokeEpisode()
const exportedSceneId = store().backgrounds[0].id
store().addBackgroundState(exportedSceneId, {
  name: "Пожар",
  src: "data:image/png;base64,FIRE",
})
const sceneStatesFile = buildEpisodeFile()
const exportedScene = sceneStatesFile.backgrounds[0]
check(
  "файл выпуска хранит состояния сцены и активное состояние, но не Base64",
  exportedScene.states?.length === 2 &&
    exportedScene.states[1].name === "Пожар" &&
    exportedScene.states[1].src === "" &&
    exportedScene.activeStateId ===
      store().backgrounds[0].activeStateId &&
    !JSON.stringify(sceneStatesFile).includes("data:image"),
  `состояний: ${exportedScene.states?.length}`
)
check(
  "картинки состояний сцены попадают в список ассетов выпуска",
  episodeAssetFields(sceneStatesFile).some(
    (field) => field.field === "backgrounds[0].states[1].src"
  )
)

// Импорт: состояния сцены читаются, а их пути приводятся к виду `/assets/...`.
store().importEpisode(
  parseEpisodeFile(
    JSON.stringify({
      campaign: "Состояния сцен",
      backgrounds: [
        {
          id: "bg-state",
          title: "Порт",
          src: "/placeholders/scene-1.jpg",
          actGroup: "Завязка",
          isBattlemap: false,
          states: [
            {
              id: "default",
              name: "Обычное",
              src: "/placeholders/scene-1.jpg",
            },
            {
              id: "night",
              name: "Ночь",
              src: "D:\\proj\\assets\\episodes\\test\\scenes\\night.png",
              isBattlemap: true,
            },
          ],
          activeStateId: "night",
        },
      ],
      characters: [],
      tracks: [],
      mapTokens: [],
      sceneNotes: {},
    })
  )
)
const importedStateScene = store().backgrounds.find(
  (item) => item.id === "bg-state"
)!
check(
  "импорт читает состояния сцены и нормализует их пути",
  importedStateScene.activeStateId === "night" &&
    importedStateScene.states?.[1].src ===
      "/assets/episodes/test/scenes/night.png" &&
    backgroundStateSrc(importedStateScene) ===
      "/assets/episodes/test/scenes/night.png" &&
    isBackgroundBattlemap(importedStateScene) === true,
  backgroundStateSrc(importedStateScene)
)

// --- Фаза 32: кроссфейды смены состояния ---
check(
  "кроссфейд кадра длится 300–450 мс (без резкого перемигивания)",
  CROSSFADE_MS >= 300 && CROSSFADE_MS <= 450,
  `${CROSSFADE_MS} мс`
)
check(
  "смена состояния сцены идёт через кроссфейд кадра, а не подмену src",
  sceneStageSource.includes("backgroundStateSrc(background)") &&
    sceneStageSource.includes("staleMedia") &&
    sceneStageSource.includes("animate-out") &&
    sceneStageSource.includes("CROSSFADE_MS")
)
check(
  "смена состояния персонажа растворяет прежнюю позу",
  sceneStageSource.includes("<CrossfadeImage") &&
    sceneStageSource.includes("characterFullBodySrc(character)")
)

// --- Фаза 33: тосты Sonner сверху по центру ---
check(
  "тосты подключены в корне приложения: сверху по центру и с richColors",
  appSource.includes('<Toaster position="top-center" richColors />')
)
check(
  "лимит сцены сообщается тостом, а не строкой в панели",
  episodeStoreSource.includes('toast.warning("Максимум 4 персонажа на сцене")')
)
check(
  "панель сцен шлёт уведомления тостами и не пишет статусы в разметку",
  backgroundLibrarySource.includes("toast.success") &&
    backgroundLibrarySource.includes("toast.error") &&
    !backgroundLibrarySource.includes("sceneNotice")
)

// --- Фаза 34: группу двигает только перетаскивание ---
check(
  "клик по карте снимает выделение, а не двигает группу",
  battleMapTabSource.includes(
    "Клик без протяжки снимает выделение со всех фишек"
  ) &&
    // Перемещение группы осталось только в обработчике дропа.
    (battleMapTabSource.match(/moveSelectionTo\(/g) ?? []).length === 1
)

// --- Фаза 35: сцена 4:3 — letterbox /screen, размер фигур, карточки карт ---
const scaledAt1378 = stageScale(1378, 720)
check(
  "сцена 4:3 вписывается целиком: 1378×720 → масштаб 0.6667, кадр 960×720",
  Math.abs(scaledAt1378 - 720 / 1080) < 1e-9 &&
    // отмасштабированный кадр входит и по ширине, и по высоте — головы не срезаются
    1440 * scaledAt1378 <= 1378 + 1e-9 &&
    1080 * scaledAt1378 <= 720 + 1e-9,
  `${(1440 * scaledAt1378).toFixed(1)}×${(1080 * scaledAt1378).toFixed(1)}`
)
check(
  "масштаб — минимум обеих сторон окна: 1 на 1440×1080, 2 на 4K, 0.6667 на 1280×720",
  stageScale(1440, 1080) === 1 &&
    stageScale(1920, 1080) === 1 &&
    stageScale(3840, 2160) === 2 &&
    Math.abs(stageScale(1280, 720) - 720 / 1080) < 1e-9,
  `1280×720 → ${stageScale(1280, 720).toFixed(4)}, 4K → ${stageScale(3840, 2160)}`
)
check(
  "виртуальная сцена — строго 4:3 (1440×1080), масштаб через transform",
  STAGE_WIDTH_PX === 1440 &&
    STAGE_HEIGHT_PX === 1080 &&
    obsScreenSource.includes("from \"@/lib/stage\"") &&
    obsScreenSource.includes("width: `${STAGE_WIDTH_PX}px`") &&
    obsScreenSource.includes("height: `${STAGE_HEIGHT_PX}px`") &&
    obsScreenSource.includes("transform: `scale(${scale})`") &&
    obsScreenSource.includes('transformOrigin: "center center"') &&
    obsScreenSource.includes(
      "w-screen h-screen flex items-center justify-center overflow-hidden"
    )
)
check(
  "фигуры стоят на полу во весь рост: квадрат 80% высоты, без лимита ширины",
  sceneStageSource.includes("aspect-square h-[80%] w-auto") &&
    sceneStageSource.includes(
      "pointer-events-none size-full object-contain object-bottom"
    ) &&
    // Слой на весь кадр: иначе высота в процентах не разрешается и фигура
    // вылезает в натуральном размере (баг «гигантских» персонажей).
    sceneStageSource.includes("absolute inset-0 overflow-hidden") &&
    !sceneStageSource.includes("w-[28%]") &&
    !sceneStageSource.includes("h-[70%]") &&
    !sceneStageSource.includes("h-[88%]")
)
check(
  "Viewport — компактные 10vh и 4:3, поле карт — та же пропорция",
  sceneViewportSource.includes(
    "relative mx-auto aspect-[4/3] h-[10vh] w-auto max-w-full overflow-hidden rounded-lg bg-black"
  ) &&
    sceneViewportSource.includes("<SceneStage className=\"size-full\"") &&
    battleMapTabSource.includes('aspect-[4/3] w-full shrink-0 overflow-hidden')
)
check(
  "поле карт рисует арт активного состояния карты (картинка или видео)",
  battleMapTabSource.includes(
    "const activeMapSrc = activeMap ? backgroundStateSrc(activeMap) : \"\""
  ) &&
    battleMapTabSource.includes("isVideoSrc(activeMapSrc)") &&
    battleMapTabSource.includes(
      "pointer-events-none absolute inset-0 size-full object-cover"
    )
)
check(
  "эфирный кадр карты: фон состояния + сетка с токенами поверх",
  sceneStageSource.includes("backgroundStateSrc(background)") &&
    sceneStageSource.includes("isBackgroundBattlemap(background)") &&
    sceneStageSource.includes(
      '<BattleMapGrid mapId={background.id} className="absolute inset-0" />'
    )
)
check(
  "карточки карт вписаны в колонку: 100% ширины, 4:3, название плашкой",
  battleMapTabSource.includes("overflow-hidden p-1") &&
    battleMapTabSource.includes("min-w-0 w-full flex-1") === false &&
    battleMapTabSource.includes(
      "aspect-[4/3] w-full max-w-full shrink-0 cursor-pointer overflow-hidden"
    ) &&
    battleMapTabSource.includes("truncate bg-black/75") &&
    // Фиксированных пиксельных ширин, распирающих колонку, больше нет.
    !battleMapTabSource.includes("aspect-square w-full")
)

// Кубики: инвариант калибровки (процент ширины подложки) на геометрии 4:3.
const diceGeometryOnScreen = { plateWidthPx: 1440 - 192, plateHeightPx: 1080 - 192 }
check(
  "кубик занимает заданный процент ширины подложки 1440×1080",
  DICE_WIDTH_PERCENT.every((percent, index) => {
    const width = diceWidthPx(
      diceScaleForCount(index + 1, diceGeometryOnScreen),
      diceGeometryOnScreen
    )
    return Math.abs(width - (percent / 100) * diceGeometryOnScreen.plateWidthPx) < 1
  }),
  DICE_WIDTH_PERCENT.map((percent) =>
    diceWidthPx(
      diceScaleForCount(DICE_WIDTH_PERCENT.indexOf(percent) + 1, diceGeometryOnScreen),
      diceGeometryOnScreen
    ).toFixed(0)
  ).join("/")
)
check(
  "эталон подложки кубиков — сцена 1440×1080 минус отступы (1248×888)",
  DICE_REFERENCE_GEOMETRY.plateWidthPx === 1440 - 2 * 96 &&
    DICE_REFERENCE_GEOMETRY.plateHeightPx === 1080 - 2 * 96,
  `${DICE_REFERENCE_GEOMETRY.plateWidthPx}×${DICE_REFERENCE_GEOMETRY.plateHeightPx}`
)
check(
  "подложка кубиков внутри сцены и не зависит от размеров окна",
  diceOverlaySource.includes("const PLATE_INSET_PX = 96") &&
    diceOverlaySource.includes("style={{ inset: PLATE_INSET_PX }}") &&
    // Ни одного отступа в vw: он считается от окна, а не от виртуальной сцены.
    !diceOverlaySource.includes("inset-[5vw]") &&
    !diceOverlaySource.includes("bottom-[5vw]")
)
check(
  "мир физики меряется лейаутными пикселями: масштаб окна в него не входит",
  diceOverlaySource.includes("container.offsetWidth") &&
    diceOverlaySource.includes("container.offsetHeight")
)
check(
  "память и живучесть кубиков: clear(), пересборка по потере WebGL и сторож",
  diceOverlaySource.includes("diceBox.clear()") &&
    diceOverlaySource.includes("webglcontextlost") &&
    diceOverlaySource.includes("acquireDiceEngine") &&
    diceOverlaySource.includes("DICE_ROLL_WATCHDOG_MS")
)

// --- Фаза 36: карты местности снова работают (флаг, арт, сетка с токенами) ---
resetSmokeEpisode()
const mapFlagSceneId = store().backgrounds[0].id
// Замена картинки материализует «Обычное» — раньше это замораживало флаг карты,
// и сцена, которую потом делали картой, теряла сетку и токены.
store().updateBackgroundImage(mapFlagSceneId, "data:image/png;base64,SCENE")
const mapFlagScene = () =>
  store().backgrounds.find((item) => item.id === mapFlagSceneId)!
store().toggleBattlemapMode(mapFlagSceneId)
const becameMap = isBackgroundBattlemap(mapFlagScene())
store().toggleBattlemapMode(mapFlagSceneId)
check(
  "флаг карты не замораживается состоянием «Обычное»",
  becameMap &&
    mapFlagScene().isBattlemap === false &&
    isBackgroundBattlemap(mapFlagScene()) === false &&
    backgroundStates(mapFlagScene())[0].isBattlemap === undefined,
  `карта: ${becameMap}, флаг: ${mapFlagScene().isBattlemap}`
)

// Файл старого формата мог записать «Обычному» свой `isBattlemap: false`:
// решает флаг самой сцены, иначе карта осталась бы без сетки.
store().importEpisode(
  parseEpisodeFile(
    JSON.stringify({
      campaign: "Карта",
      backgrounds: [
        {
          id: "bg-legacy-map-state",
          title: "Карта",
          src: "/placeholders/scene-1.jpg",
          actGroup: "Завязка",
          isBattlemap: true,
          states: [
            {
              id: "default",
              name: "Обычное",
              src: "/placeholders/scene-1.jpg",
              isBattlemap: false,
            },
          ],
        },
      ],
      characters: [],
      tracks: [],
      mapTokens: [],
      sceneNotes: {},
    })
  )
)
const legacyMapScene = store().backgrounds.find(
  (item) => item.id === "bg-legacy-map-state"
)!
check(
  "сцена-карта со старым «Обычным» всё равно рисует сетку",
  isBackgroundBattlemap(legacyMapScene) === true &&
    backgroundStateSrc(legacyMapScene) === "/placeholders/scene-1.jpg"
)

// --- Фаза 37: мгновенная синхронизация (без debounce) и резкие персонажи ---
resetSmokeEpisode()
teardownEpisodeSync()
const stopFastMaster = initEpisodeSync("master")
await waitFor(() => getSyncStatus() === "live")

/*
 * Дебаунса в отправке нет: подписка на стор зовёт flushSnapshot синхронно, в том
 * же тике, где Мастер кликнул сцену. Раньше снапшот ждал 30 мс таймера, и экран
 * приходил с задержкой, похожей на «клик не сработал».
 */
check(
  "снапшот уходит синхронно: подписка на стор зовёт flushSnapshot без debounce",
  episodeSyncSource.includes("useEpisodeStore.subscribe(() => flushSnapshot())") &&
    !episodeSyncSource.includes("SNAPSHOT_DELAY_MS") &&
    !episodeSyncSource.includes("scheduleSnapshot") &&
    !/setTimeout\(\(\) => flushSnapshot/.test(episodeSyncSource)
)
check(
  "локальный канал второго окна: мастер шлёт, экран применяет первый пришедший",
  episodeSyncSource.includes('const LOCAL_CHANNEL_NAME = "pedinburg-episode-sync"') &&
    episodeSyncSource.includes("localChannel?.postMessage(json)") &&
    episodeSyncSource.includes("function applyRemoteSnapshot") &&
    episodeSyncSource.includes("if (raw === lastAppliedSnapshot) return")
)

// Второе окно: живой пир по сокету + подписка на локальный канал в этом процессе.
const fastPeer = await openPeer("screen")
fastPeer.send({ type: "request-state" })
await waitFor(() => fastPeer.inbox.some((message) => message.type === "state"))

const localChannelName = "pedinburg-episode-sync"
const channelPeer =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel(localChannelName)
const channelInbox: string[] = []
if (channelPeer) {
  channelPeer.onmessage = (event: MessageEvent) =>
    channelInbox.push(String(event.data))
  // В Node канал держал бы процесс открытым до самого таймаута прогона.
  ;(channelPeer as BroadcastChannel & { unref?: () => void }).unref?.()
}

// Свежая сцена: гарантированно меняет снапшот, даже если клик «ничего не менял».
const fastSceneId = store().addBackground("Завязка", {
  title: "Мгновенная сцена",
  src: "/placeholders/scene-1.jpg",
  activate: false,
})
await wait(50)
const clickedAt = Date.now()
store().setActiveBackground(fastSceneId)
const onScreenNow = await waitFor(
  () =>
    fastPeer.inbox.some(
      (message) =>
        message.type === "state" && message.payload.activeBackgroundId === fastSceneId
    ),
  2000,
  5
)
const socketMs = Date.now() - clickedAt
check(
  "клик Мастера по сцене доезжает до /screen мгновенно",
  onScreenNow && socketMs < 250,
  `${socketMs} мс`
)
check(
  "тот же снапшот уходит в BroadcastChannel: вкладке /screen сервер не нужен",
  channelPeer
    ? await waitFor(() => channelInbox.some((raw) => raw.includes(fastSceneId)), 2000, 5)
    : true,
  channelPeer ? `сообщений в канале: ${channelInbox.length}` : "BroadcastChannel недоступен"
)
channelPeer?.close()
fastPeer.close()
stopFastMaster()
teardownEpisodeSync()

/*
 * Экран применяет снапшот ровно один раз: тот же JSON приходит двумя
 * транспортами, и второй обязан быть отброшен — иначе каждая сцена на /screen
 * монтировалась бы дважды (двойной кроссфейд, двойная работа).
 */
const stopFastScreen = initEpisodeSync("screen")
// Даём серверу отдать кэш, чтобы он не попал в подсчёт применений.
await wait(250)
let remoteApplies = 0
const unsubscribeRemoteApplies = useEpisodeStore.subscribe((state) => {
  if (state.activeBackgroundId === remoteState.activeBackgroundId) remoteApplies += 1
})
const stateJson = JSON.stringify({ type: "state", payload: remoteState })
const duplexChannel = new BroadcastChannel(localChannelName)
;(duplexChannel as BroadcastChannel & { unref?: () => void }).unref?.()
duplexChannel.postMessage(stateJson)
const appliedFromChannel = await waitFor(
  () => store().activeBackgroundId === remoteState.activeBackgroundId,
  2000,
  5
)
duplexChannel.postMessage(stateJson)
await wait(150)
unsubscribeRemoteApplies()
duplexChannel.close()
stopFastScreen()
teardownEpisodeSync()
check(
  "дубль снапшота из второго транспорта не применяется повторно",
  appliedFromChannel && remoteApplies === 1,
  `применений: ${remoteApplies}`
)

// Правая панель: жёсткая ширина, сетка в 2 колонки и пропорции 70/30.
check(
  "правая панель зажата по ширине: min-w-0/overflow-hidden у сайдбара и колонки",
  globalAudioSidebarSource.includes(
    "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden pr-0.5 pl-2"
  ) && masterPanelSource.includes('className="min-w-[85px] overflow-hidden"')
)
check(
  "саундпад — 70% высоты, треки — 30%, у обоих свой скролл",
  globalAudioSidebarSource.includes("flex min-h-0 flex-[7] flex-col gap-1.5 overflow-hidden") &&
    globalAudioSidebarSource.includes("flex min-h-0 flex-[3] flex-col gap-1.5 overflow-hidden") &&
    (globalAudioSidebarSource.match(/<ScrollArea className="min-h-0 w-full flex-1">/g) ?? [])
      .length === 2
)
check(
  "плитки звуков и треков — сетка в 2 колонки шириной с панель",
  (globalAudioSidebarSource.match(/grid w-full min-w-0 grid-cols-2 gap-2 pb-1/g) ?? [])
    .length === 2 &&
    globalAudioSidebarSource.includes(
      "flex aspect-square w-full flex-col items-center justify-center"
    )
)

// Резкость: кадр не остаётся на отдельном слое композитинга после проявления.
check(
  "персонажи не мылятся: анимация проявления снимается после её конца",
  crossfadeImageSource.includes('className={cn(className, isEntering && "animate-in fade-in")}') &&
    crossfadeImageSource.includes('const [settledSrc, setSettledSrc] = useState<string | null>(null)') &&
    crossfadeImageSource.includes('willChange: "auto"') &&
    crossfadeImageSource.includes('transform: "none"')
)
check(
  "кадр персонажа просит нативное качество масштабирования, без translateZ",
  sceneStageSource.includes("[image-rendering:high-quality]") &&
    !sceneStageSource.includes("translateZ") &&
    !sceneStageSource.includes("translate3d")
)
check(
  "выезд персонажа заканчивается целой позицией: y 0% вход, 100% уход",
  sceneStageSource.includes('animate={{ y: "0%" }}') &&
    sceneStageSource.includes('exit={{ y: "100%" }}')
)

if (failures.length > 0) {
  throw new Error(
    `Провалено проверок: ${failures.length} → ${failures.join("; ")}`
  )
}
console.log("\nALL CHECKS PASSED")
