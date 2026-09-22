import {
  GRID_CELL_HEIGHT_RATIO,
  GRID_CELL_RATIO,
  GRID_COLUMNS,
  GRID_ROWS,
  TOKEN_CELL_RATIO,
  gridCellPercent,
  gridGeometry,
  gridOffsetPercent,
} from "@/data/content"
import { resolveCellFromPoint } from "@/hooks/useGridDrop"
import { categoryBorders } from "@/components/master-panel/tokenAppearance"
import {
  crossfadeLevels,
  isCrossfadeFinished,
  isCrossfadeInStarted,
} from "@/lib/audio-crossfade"
import { fileNameWithoutExtension } from "@/lib/utils"
import { readMp3Tags } from "@/lib/audio-file"
import type { SyncedEpisode } from "@/data/types"
import {
  DICE_DEFAULT_RAW_MASS,
  DICE_DEFAULT_RAW_THROWFORCE,
  DICE_PHYSICS,
  DICE_REFERENCE_GEOMETRY,
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
  diceThrowSpeedFactor,
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
import { toAssetUrl } from "@/lib/asset-url"
import { MAX_DICE_PER_TYPE, useEpisodeStore } from "@/store/useEpisodeStore"
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

// --- Двухфазная смена персонажа (п.6) ---
store().toggleCharacterOnStage("char-ingrid")
check(
  "первый персонаж сразу выезжает (entering)",
  store().stagePhase === "entering" &&
    store().activeCharacterId === "char-ingrid",
  store().stagePhase
)
await wait(420)
check("после выезда фаза возвращается в idle", store().stagePhase === "idle")

store().toggleCharacterOnStage("char-marcus")
check(
  "смена персонажа начинается с фазы leaving",
  store().stagePhase === "leaving" &&
    store().stageFromCharacterId === "char-ingrid" &&
    store().stageToCharacterId === "char-marcus"
)
await wait(420)
check(
  "через 350 мс начинается выезд нового персонажа",
  store().stagePhase === "entering",
  store().stagePhase
)
await wait(420)
check(
  "двухфазная смена завершается в idle",
  store().stagePhase === "idle" && store().activeCharacterId === "char-marcus"
)

store().toggleCharacterOnStage("char-marcus")
check(
  "скрытие персонажа идёт через leaving",
  store().stagePhase === "leaving" && store().stageToCharacterId === null
)
await wait(800)
check(
  "после скрытия сцена пуста",
  store().stagePhase === "idle" && store().activeCharacterId === null
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
  "снапшот содержит фазу сцены",
  payload?.stagePhase === "idle",
  String(payload?.stagePhase)
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
  activeCharacterId: "char-selena",
  stagePhase: "entering",
  stageFromCharacterId: "char-ingrid",
  stageToCharacterId: "char-selena",
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
      follower.activeCharacterId === "char-selena" &&
      follower.stagePhase === "entering" &&
      follower.lastRoll === null &&
      follower.lastRollEvent?.id === 7 &&
      follower.isRollPending === true
    )
  }),
  `${store().activeBackgroundId} / ${store().stagePhase}`
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
store().resetEpisode()
check(
  "resetEpisode возвращает seed-состояние",
  store().backgrounds.length === seedBackgrounds &&
    store().tracks.length === seedTracks &&
    store().dicePool.length === 0 &&
    store().activeCharacterId === null &&
    store().stagePhase === "idle",
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
await wait(760)
store().addToken(createdId, 2, 2)
store().removeCharacter(createdId)
check(
  "removeCharacter чистит персонажа, токен и сцену",
  !store().characters.some((item) => item.id === createdId) &&
    !store().mapTokens.some((token) => token.characterId === createdId) &&
    store().activeCharacterId === null
)

check(
  "у всех персонажей корректная категория",
  store().characters.every((character) =>
    ["hero", "npc", "enemy", "item"].includes(character.category)
  )
)

// --- Экспорт/импорт выпуска ---
store().resetEpisode()
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
store().resetEpisode()
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
  store().backgrounds.find((item) => item.id === "bg-harbor")?.src ===
    "data:image/webp;base64,SCENE"
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
store().resetEpisode()
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

store().resetEpisode()
check(
  "новый выпуск возвращает название кампании",
  store().episodeTitle !== "Финал сезона: Три Ключа",
  store().episodeTitle
)

// --- Фаза 10: треки (добавление/правка/удаление) и удаление сессии ---
store().resetEpisode()
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
  "трек с аудио выживает экспорт/импорт",
  store().tracks.some(
    (track) => track.audioSrc === "data:audio/mpeg;base64,AAAA"
  )
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

store().resetEpisode()
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

store().resetEpisode()
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

store().resetEpisode()
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
  "обложка трека выживает экспорт/импорт",
  store().tracks.some(
    (track) =>
      track.id === coverTrackId && track.coverSrc === "data:image/png;base64,CCCC"
  )
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
store().resetEpisode()
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
  "ровных клеток 14 × 11",
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
store().resetEpisode()
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

store().resetEpisode()
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

const noteSceneId = Object.keys(store().sceneNotes)[0]
store().removeBackground(noteSceneId)
check(
  "заметка удалённой сцены тоже удаляется",
  store().sceneNotes[noteSceneId] === undefined
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
store().resetEpisode()

// --- Фаза 17: разделители сцен, пакетный импорт и имя файла выпуска ---
store().resetEpisode()
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
store().resetEpisode()
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
store().resetEpisode()
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

store().resetEpisode()
store().removeSceneGroup("Завязка")
check(
  "первый разделитель отдаёт сцены следующему",
  !store().sceneGroups.includes("Завязка") &&
    store().backgrounds.filter((item) => item.actGroup === "1 акт").length === 8,
  store().sceneGroups.join("/")
)

store().resetEpisode()
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
store().resetEpisode()
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
  "имя файла выпуска берётся из названия",
  episodeFileName("Порт в тумане") === "pedinburg-Порт в тумане.json",
  episodeFileName("Порт в тумане")
)
check(
  "запрещённые в имени файла символы заменяются",
  episodeFileName('Порт: "туман" / ночь?') === "pedinburg-Порт туман ночь.json",
  episodeFileName('Порт: "туман" / ночь?')
)
check(
  "точки и пробелы в конце названия отбрасываются",
  episodeFileName("Порт... ") === "pedinburg-Порт.json",
  episodeFileName("Порт... ")
)
check(
  "пустое название даёт запасное имя по дате",
  /^pedinburg-episode-\d{4}-\d{2}-\d{2}\.json$/.test(episodeFileName("   ")),
  episodeFileName("   ")
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
store().resetEpisode()

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
store().resetEpisode()
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

if (failures.length > 0) {
  throw new Error(
    `Провалено проверок: ${failures.length} → ${failures.join("; ")}`
  )
}
console.log("\nALL CHECKS PASSED")
