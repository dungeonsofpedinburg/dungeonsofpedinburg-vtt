import { useEpisodeStore } from "@/store/useEpisodeStore"
import type { RollDie, SyncedEpisode } from "@/data/types"

/**
 * Синхронизация Мастер-панели и экрана `/screen` двумя транспортами:
 * 1. локальный WebSocket-сервер (server/index.mjs, порт 5174) — единственный
 *    путь к OBS Browser Source и к проектору на другой машине: OBS — отдельный
 *    процесс CEF, между окнами BroadcastChannel не связывается;
 * 2. тот же браузер и origin — BroadcastChannel: доставка в том же тике, без
 *    круга через сервер (и даже если сервер не поднят).
 * Оба транспорта везут один и тот же JSON: экран применяет первый пришедший и
 * игнорирует дубль, поэтому «мгновенно» и «надёжно» не мешают друг другу.
 */
export const SYNC_DEFAULT_PORT = 5174

export type SyncRole = "master" | "screen"

type HelloMessage = { type: "hello"; role: SyncRole }
type StateMessage = { type: "state"; payload: SyncedEpisode }
type RequestStateMessage = { type: "request-state" }
/**
 * Обратный канал: экран OBS посчитал физику и отдаёт фактические значения
 * кубиков Мастеру, чтобы плашка с итогом была одна на оба окна.
 * `estimated` — физика не ответила (сторожевой таймер), значения случайные:
 * плашка Мастера пометит такой итог знаком «≈».
 */
type RollResultMessage = {
  type: "roll-result"
  payload: { eventId: number; dice: RollDie[]; sum: number; estimated?: boolean }
}
/** Состояния нет и мастера нет — экран показывает ожидание. */
type NoStateMessage = { type: "no-state" }
/** Сколько клиентов на связи (для индикатора «экранов: N»). */
type PresenceMessage = { type: "presence"; payload: SyncPresence }

export type SyncMessage =
  | HelloMessage
  | StateMessage
  | RequestStateMessage
  | RollResultMessage
  | NoStateMessage
  | PresenceMessage

/**
 * idle         — синхронизация не запущена;
 * connecting   — первая попытка подключения;
 * reconnecting — связь была и потеряна, ждём повтор;
 * waiting      — сокет открыт, но состояния от мастера ещё нет;
 * live         — всё на связи.
 */
export type SyncStatus = "idle" | "connecting" | "reconnecting" | "waiting" | "live"
export type SyncPresence = { masters: number; screens: number }

/** Снимок состояния транспорта для UI (стабильная ссылка между изменениями). */
export type SyncInfo = {
  status: SyncStatus
  role: SyncRole | null
  endpoint: string | null
  presence: SyncPresence
}

/**
 * Имя локального канала: Мастер и `/screen` в одном браузере видят состояние
 * мгновенно, без круга через сервер (и даже если сервер не поднят).
 */
const LOCAL_CHANNEL_NAME = "pedinburg-episode-sync"
/** Нарастающие паузы переподключения, мс; последнее значение повторяется бесконечно. */
const RETRY_DELAYS_MS = [250, 500, 1000, 2000, 4000]
const RETRY_JITTER = 0.2

let socket: WebSocket | null = null
let role: SyncRole | null = null
let endpoint: string | null = null
let stopped = false
let hadConnection = false
let screenHasState = false
let reconnectAttempt = 0
let status: SyncStatus = "idle"
let presence: SyncPresence = { masters: 0, screens: 0 }
let info: SyncInfo = { status: "idle", role: null, endpoint: null, presence }

let unsubscribeStore: (() => void) | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
/** Локальный канал «второй вкладки»: транспорт, которому сервер не нужен вовсе. */
let localChannel: BroadcastChannel | null = null
/** Последний отправленный JSON снапшота: не гоняем мегабайты картинок повторно. */
let lastSnapshot: string | null = null
/** Последний применённый экраном JSON: дубль из второго транспорта не рисуем снова. */
let lastAppliedSnapshot: string | null = null

const infoListeners = new Set<() => void>()

function publish() {
  info = { status, role, endpoint, presence }
  for (const listener of infoListeners) listener()
}

function setStatus(next: SyncStatus) {
  if (status === next) return
  status = next
  publish()
}

function setPresence(next: SyncPresence) {
  if (next.masters === presence.masters && next.screens === presence.screens) return
  presence = { masters: next.masters, screens: next.screens }
  // Мастеру важно знать, есть ли экран OBS: от этого зависит ожидание итога броска.
  useEpisodeStore.getState().setSyncScreens(presence.screens)
  publish()
}

/** Снимок стора для /screen: только то, что реально рисует сцена. */
function createSnapshot(): SyncedEpisode {
  const state = useEpisodeStore.getState()
  return {
    backgrounds: state.backgrounds,
    characters: state.characters,
    activeBackgroundId: state.activeBackgroundId,
    previousBackgroundId: state.previousBackgroundId,
    activeCharacterIds: state.activeCharacterIds,
    mapTokens: state.mapTokens,
    activeMapId: state.activeMapId,
    lastRoll: state.lastRoll,
    lastRollEvent: state.lastRollEvent,
    isRollPending: state.isRollPending,
    // Пауза, повтор и перемотка видео: без этого проектор играл бы сам по себе.
    videoPlayback: state.videoPlayback,
  }
}

/** @returns true, если кадр реально ушёл в сокет (иначе его нельзя терять). */
function sendRaw(message: SyncMessage) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(message))
  return true
}

/** Результат физики, посчитанный до открытия сокета: дошлём при подключении. */
let pendingRollResult: RollResultMessage | null = null

/**
 * Отправка результата 3D-броска с экрана OBS на панель Мастера.
 * Сокет может быть ещё не открыт (перезагрузка страницы, переподключение) —
 * тогда результат ждёт в буфере и уходит при первом же `onopen`. Иначе Мастер
 * остался бы без физики и показал локальную оценку со знаком «≈».
 *
 * `estimated` — физика не уложилась в сторожевой таймер: значения случайные,
 * и Мастер обязан показать их со знаком «≈», а не как честный бросок кубиков.
 */
export function postRollResult(
  eventId: number,
  dice: RollDie[],
  sum: number,
  estimated = false
) {
  const message: RollResultMessage = {
    type: "roll-result",
    payload: { eventId, dice, sum, ...(estimated ? { estimated: true } : {}) },
  }
  if (!sendRaw(message)) {
    pendingRollResult = message
    if (import.meta.env.DEV) {
      console.debug("[episodeSync] сокет закрыт: результат броска ждёт переподключения")
    }
    return
  }
  if (import.meta.env.DEV) {
    console.debug(`[episodeSync] результат броска ушёл Мастеру: ${sum}`)
  }
}

/**
 * Отправляет снапшот стора немедленно — в том же тике, в котором Мастер нажал
 * сцену. Никакого debounce/setTimeout: раньше состояние ждало 30 мс, и экран
 * приходил с задержкой, которую Мастер видел как «клик не сработал».
 *
 * Один и тот же JSON уходит сразу в сокет и в локальный канал; экран применит
 * первый пришедший (обычно это канал — он не ходит на сервер).
 *
 * @param force true — отвечаем на запрос экрана и шлём снапшот даже без изменений
 * (сервер мог потерять кэш, тогда молчать нельзя).
 */
function flushSnapshot(force = false) {
  const json = JSON.stringify({
    type: "state",
    payload: createSnapshot(),
  } satisfies SyncMessage)

  if (!force && json === lastSnapshot) return
  lastSnapshot = json

  // Сокета может не быть вовсе (сервер не поднят, идёт переподключение):
  // локальная вкладка `/screen` всё равно получит состояние по каналу.
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(json)
  localChannel?.postMessage(json)
}

/**
 * Локальный канал «второго окна»: мастер шлёт в него снапшоты, `/screen` слушает.
 * В Node (смоук-прогон) канал держал бы процесс открытым — снимаем ссылку.
 */
function openLocalChannel() {
  if (typeof BroadcastChannel === "undefined") return

  const channel = new BroadcastChannel(LOCAL_CHANNEL_NAME)
  ;(channel as BroadcastChannel & { unref?: () => void }).unref?.()
  // Роль проверяется внутри handleMessage: мастер входящие состояния игнорирует.
  channel.onmessage = (event: MessageEvent) => {
    if (typeof event.data === "string") handleMessage(event.data)
  }
  localChannel = channel
}

function closeLocalChannel() {
  if (!localChannel) return
  localChannel.onmessage = null
  localChannel.close()
  localChannel = null
}

function connect() {
  if (stopped || !role || !endpoint) return

  const currentRole = role
  const current = new WebSocket(endpoint)
  socket = current

  current.onopen = () => {
    if (socket !== current) return
    reconnectAttempt = 0
    hadConnection = true
    // Свежее соединение — сервер мог перезапуститься и потерять кэш.
    lastSnapshot = null
    sendRaw({ type: "hello", role: currentRole })

    // Результат физики, посчитанный до подключения, важнее всего: шлём его сразу.
    if (pendingRollResult) {
      const message = pendingRollResult
      pendingRollResult = null
      sendRaw(message)
    }

    if (currentRole === "master") {
      flushSnapshot(true)
      setStatus("live")
      return
    }
    sendRaw({ type: "request-state" })
    setStatus("waiting")
  }

  current.onmessage = (event) => {
    if (socket !== current) return
    if (typeof event.data === "string") handleMessage(event.data)
  }

  current.onclose = () => {
    if (socket !== current) return
    socket = null
    scheduleReconnect()
  }

  // onerror всегда предшествует onclose — переподключение планируем там.
  current.onerror = () => {}
}

function scheduleReconnect() {
  if (stopped || !role) return

  const delay = RETRY_DELAYS_MS[Math.min(reconnectAttempt, RETRY_DELAYS_MS.length - 1)]
  reconnectAttempt += 1
  setStatus(hadConnection ? "reconnecting" : "connecting")

  retryTimer = setTimeout(() => {
    retryTimer = null
    connect()
  }, delay + delay * RETRY_JITTER * Math.random())
}

/**
 * Применяет состояние на `/screen`. Один снапшот приходит двумя транспортами
 * (сокет и локальный канал): первый побеждает, дубль отбрасываем — иначе экран
 * перерисовывал бы всю сцену дважды на каждый клик Мастера.
 */
function applyRemoteSnapshot(raw: string, payload: SyncedEpisode) {
  if (raw === lastAppliedSnapshot) return
  lastAppliedSnapshot = raw
  screenHasState = true
  useEpisodeStore.getState().applyRemoteState(payload)
}

function handleMessage(raw: string) {
  let message: SyncMessage
  try {
    message = JSON.parse(raw) as SyncMessage
  } catch {
    return
  }
  if (!message || typeof message !== "object") return

  if (message.type === "presence") {
    if (message.payload) setPresence(message.payload)
    return
  }

  if (role === "screen") {
    if (message.type === "state") {
      applyRemoteSnapshot(raw, message.payload)
      setStatus("live")
      return
    }
    // Мастера нет: остаёмся в ожидании, но уже принятое состояние не теряем.
    if (message.type === "no-state" && !screenHasState) setStatus("waiting")
    return
  }

  if (message.type === "request-state") {
    flushSnapshot(true)
    return
  }

  // Физику считает /screen: принимаем результат, если он от текущего броска.
  if (message.type === "roll-result") {
    const state = useEpisodeStore.getState()
    if (state.lastRollEvent?.id !== message.payload.eventId) return
    if (import.meta.env.DEV) {
      console.debug(`[episodeSync] физика с /screen: ${message.payload.sum}`)
    }
    state.completeDiceRoll(
      message.payload.dice,
      message.payload.sum,
      message.payload.estimated === true
    )
  }
}

/**
 * Подключает текущую вкладку к sync-серверу.
 * - role = "master": рассылает снапшоты при каждом изменении стора и отвечает на запросы.
 * - role = "screen": только принимает состояние, запрашивая его при подключении.
 * Возвращает функцию отключения (для useEffect-очистки, безопасна при двойном вызове в StrictMode).
 */
export function initEpisodeSync(nextRole: SyncRole): () => void {
  teardownEpisodeSync()

  if (typeof WebSocket === "undefined") {
    console.warn("[episodeSync] WebSocket недоступен в этом окружении — синхронизация отключена")
    return () => {}
  }

  stopped = false
  role = nextRole
  endpoint = resolveSyncUrl()
  reconnectAttempt = 0
  hadConnection = false
  screenHasState = false
  lastSnapshot = null
  lastAppliedSnapshot = null
  setStatus("connecting")
  openLocalChannel()

  if (nextRole === "master") {
    // Подписка на стор без debounce: снапшот уходит в том же тике, где Мастер
    // изменил сцену, персонажа или карту. Ждать «следующего кадра» нечего.
    unsubscribeStore = useEpisodeStore.subscribe(() => flushSnapshot())
  }

  connect()
  return teardownEpisodeSync
}

export function teardownEpisodeSync() {
  stopped = true

  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }

  unsubscribeStore?.()
  unsubscribeStore = null
  closeLocalChannel()
  lastAppliedSnapshot = null

  const current = socket
  socket = null
  if (current) {
    current.onopen = null
    current.onmessage = null
    current.onclose = null
    current.onerror = null
    if (current.readyState === WebSocket.CONNECTING || current.readyState === WebSocket.OPEN) {
      current.close()
    }
  }

  role = null
  endpoint = null
  lastSnapshot = null
  screenHasState = false
  hadConnection = false
  reconnectAttempt = 0
  setPresence({ masters: 0, screens: 0 })
  setStatus("idle")
}

/** Текущий статус транспорта (для логов и автотестов). */
export function getSyncStatus(): SyncStatus {
  return status
}

/** Сколько клиентов на связи по данным сервера. */
export function getSyncPresence(): SyncPresence {
  return presence
}

/** Адрес сокета, к которому подключена вкладка (null до initEpisodeSync). */
export function getSyncEndpoint(): string | null {
  return endpoint
}

/** Снимок состояния транспорта для UI (стабильная ссылка между изменениями). */
export function getSyncInfo(): SyncInfo {
  return info
}

/** Подписка на изменения транспорта — основа useSyncExternalStore. */
export function subscribeSyncInfo(listener: () => void): () => void {
  infoListeners.add(listener)
  return () => {
    infoListeners.delete(listener)
  }
}

/**
 * Адрес sync-сервера по приоритету:
 * 1. `?sync=ws://192.168.1.5:5174` (экран OBS может жить на другой машине);
 * 2. `VITE_SYNC_URL` — прод-сборка знает адрес заранее;
 * 3. `PEDINBURG_SYNC_URL` — шов для Node-сценариев (смоук-прогон поднимает сервер на свободном порту);
 * 4. `ws://<хост текущей страницы>:5174` — обычный локальный запуск.
 */
export function resolveSyncUrl(): string {
  const fromQuery = readQueryUrl()
  if (fromQuery) return fromQuery

  const fromVite = import.meta.env.VITE_SYNC_URL as string | undefined
  if (typeof fromVite === "string" && fromVite.trim()) return normalizeSyncUrl(fromVite)

  const fromNode = readNodeEnvUrl()
  if (fromNode) return fromNode

  return defaultSyncUrl()
}

function readQueryUrl(): string | null {
  if (typeof location === "undefined") return null
  const raw = new URLSearchParams(location.search).get("sync")
  return raw && raw.trim() ? normalizeSyncUrl(raw) : null
}

/** Принимает «ws://host:port», «http://host:port» и короткое «5175» (порт на текущем хосте). */
function normalizeSyncUrl(raw: string): string {
  const value = raw.trim()
  if (/^wss?:\/\//i.test(value)) return value
  if (/^https?:\/\//i.test(value)) return value.replace(/^http/i, "ws")

  const pageHost = typeof location === "undefined" || !location.hostname ? "localhost" : location.hostname
  const host = /^\d+$/.test(value) ? `${pageHost}:${value}` : value
  return `${pageProtocol() === "https:" ? "wss" : "ws"}://${host}`
}

function readNodeEnvUrl(): string | null {
  // process есть только в Node (смоук-прогон и скрипты): в браузере его просто нет.
  const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  const raw = nodeProcess?.env?.PEDINBURG_SYNC_URL
  return raw && raw.trim() ? normalizeSyncUrl(raw) : null
}

function defaultSyncUrl(): string {
  const host = typeof location === "undefined" || !location.hostname ? "localhost" : location.hostname
  return `${pageProtocol() === "https:" ? "wss" : "ws"}://${host}:${SYNC_DEFAULT_PORT}`
}

function pageProtocol(): string {
  return typeof location === "undefined" ? "http:" : location.protocol
}
