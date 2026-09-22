/**
 * Локальный sync-сервер (WebSocket) для связки Мастер-панели (/master) и экрана OBS (/screen).
 *
 * Зачем: OBS Browser Source — изолированный CEF, `BroadcastChannel` между окнами там
 * не работает. Поэтому состояние выпуска идёт через сокеты: сервер хранит последний
 * снапшот в оперативной памяти и раздаёт его тому, кто подключился позже.
 *
 * Протокол (JSON-кадры, тот же набор типов, что и на клиенте):
 *   { type: "hello", role: "master" | "screen" }  — представление клиента
 *   { type: "state", payload: SyncedEpisode }     — мастер отдаёт снапшот (кэшируется)
 *   { type: "request-state" }                     — экран просит снапшот
 *   { type: "no-state" }                          — состояния нет и мастера нет (экран ждёт)
 *   { type: "roll-result", payload: {...} }       — экран вернул результат физики
 *   { type: "presence", payload: { masters, screens } } — сколько клиентов подключено
 *
 * Запуск: node server/index.mjs (или вместе с Vite: npm run dev:all)
 */
import { createServer } from "node:http"
import { pathToFileURL } from "node:url"
import { WebSocketServer } from "ws"

/** Порт по умолчанию: клиент (/screen, /master) стучится сюда же. */
export const DEFAULT_SYNC_PORT = 5174

/** Как часто проверяем живость клиентов (OBS умеет засыпать Browser Source). */
const HEARTBEAT_MS = 15_000
/** Сколько ждём снапшот от мастера, прежде чем сказать экрану «состояния нет». */
const REQUEST_TIMEOUT_MS = 700
/** Снапшот тяжелее этого — предупреждаем: картинки уезжают как data URL. */
const HEAVY_SNAPSHOT_BYTES = 8 * 1024 * 1024
const HEAVY_WARNING_INTERVAL_MS = 60_000

function jsonResponse(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "content-length": Buffer.byteLength(body),
  })
  response.end(body)
}

/**
 * Поднимает sync-сервер.
 * @param {object} [options]
 * @param {number} [options.port] Порт (0 — свободный, нужен тестам). По умолчанию SYNC_PORT или 5174.
 * @param {string} [options.host] Адрес прослушивания (по умолчанию SYNC_HOST или dual-stack "::").
 * @param {boolean} [options.quiet] Не логировать каждое сообщение (для автотестов).
 * @param {boolean} [options.allowDebug] Разрешить служебные сообщения debug-* (только тесты).
 * @param {number} [options.requestTimeoutMs] Ожидание снапшота от мастера по request-state.
 * @param {number} [options.heartbeatMs] Период проверки живости клиентов (по умолчанию 15 с).
 */
export async function startSyncServer(options = {}) {
  const requestedPort = Number(options.port ?? process.env.SYNC_PORT ?? DEFAULT_SYNC_PORT)
  const requestedHost = options.host ?? process.env.SYNC_HOST ?? null
  const quiet = options.quiet ?? false
  const allowDebug = options.allowDebug ?? false
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS

  const log = (...args) => {
    if (!quiet) console.log("[sync]", ...args)
  }
  const warn = (...args) => console.warn("[sync]", ...args)

  /** Последний снапшот выпуска — «состояние в оперативной памяти» сервера. */
  let currentState = null
  let lastHeavyWarningAt = 0

  const stats = {
    statesReceived: 0,
    statesRelayed: 0,
    requests: 0,
    noStateSent: 0,
    rollResults: 0,
    clientsTotal: 0,
  }

  /** socket -> { role: "master" | "screen" | null, alive: boolean, misses: number } */
  const clients = new Map()
  /** Запросы экранов, ждущие флаша от мастера: { socket, timer } */
  const pendingRequests = new Set()

  const http = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    if (url.pathname === "/health") {
      jsonResponse(response, 200, healthPayload())
      return
    }
    jsonResponse(response, 404, { ok: false, error: "not found" })
  })

  const wss = new WebSocketServer({ server: http })

  /** Заполняется после listen — /health отдаёт актуальный порт. */
  let boundHost = requestedHost ?? "localhost"
  let boundPort = requestedPort

  function presence() {
    let masters = 0
    let screens = 0
    for (const info of clients.values()) {
      if (info.role === "master") masters += 1
      else if (info.role === "screen") screens += 1
    }
    return { masters, screens }
  }

  function healthPayload() {
    return {
      ok: true,
      port: boundPort,
      hasState: currentState !== null,
      clients: presence(),
      stats: { ...stats, pendingRequests: pendingRequests.size },
    }
  }

  function send(socket, message) {
    if (socket.readyState !== socket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }

  /** Рассылка всем, кроме отправителя: сохраняем семантику BroadcastChannel (без эха). */
  function relay(message, except) {
    const json = JSON.stringify(message)
    let delivered = 0
    for (const socket of clients.keys()) {
      if (socket === except) continue
      if (socket.readyState !== socket.OPEN) continue
      socket.send(json)
      delivered += 1
    }
    return delivered
  }

  function relayPresence() {
    relay({ type: "presence", payload: presence() }, null)
  }

  function clearPending(except) {
    for (const entry of [...pendingRequests]) {
      if (except && entry.socket === except) continue
      clearTimeout(entry.timer)
      pendingRequests.delete(entry)
    }
  }

  function warnIfHeavy(size) {
    if (size <= HEAVY_SNAPSHOT_BYTES) return
    const now = Date.now()
    if (now - lastHeavyWarningAt < HEAVY_WARNING_INTERVAL_MS) return
    lastHeavyWarningAt = now
    warn(
      `снапшот ${(size / 1024 / 1024).toFixed(1)} МБ — тяжело для сокета. ` +
        "Помогут картинки меньшего размера (они едут как data URL)."
    )
  }

  function handleMessage(socket, data) {
    const text = typeof data === "string" ? data : data.toString()
    let message
    try {
      message = JSON.parse(text)
    } catch {
      warn("пропущен неразборчивый кадр")
      return
    }
    if (!message || typeof message !== "object") return

    const info = clients.get(socket)
    if (!info) return

    switch (message.type) {
      case "hello": {
        if (message.role !== "master" && message.role !== "screen") return
        info.role = message.role
        log(`подключился ${message.role} (всего: ${clients.size})`)
        relayPresence()
        return
      }

      case "state": {
        if (!message.payload || typeof message.payload !== "object") return
        currentState = message.payload
        stats.statesReceived += 1
        warnIfHeavy(text.length)
        clearPending()
        stats.statesRelayed += relay({ type: "state", payload: currentState }, socket)
        return
      }

      case "request-state": {
        stats.requests += 1
        // Основной сценарий: состояние уже есть — отдаём сразу из памяти.
        if (currentState) {
          send(socket, { type: "state", payload: currentState })
          log("отдал снапшот из кэша")
          return
        }
        // Кэша нет: просим мастеров флашнуть снапшот, иначе честно говорим «пусто».
        const hasMaster = [...clients.values()].some((item) => item.role === "master")
        if (!hasMaster) {
          stats.noStateSent += 1
          send(socket, { type: "no-state" })
          return
        }
        relay({ type: "request-state" }, socket)
        const entry = {
          socket,
          timer: setTimeout(() => {
            pendingRequests.delete(entry)
            if (currentState) {
              send(socket, { type: "state", payload: currentState })
              return
            }
            stats.noStateSent += 1
            send(socket, { type: "no-state" })
          }, requestTimeoutMs),
        }
        pendingRequests.add(entry)
        return
      }

      case "roll-result": {
        if (!message.payload || typeof message.payload !== "object") return
        stats.rollResults += 1
        relay(message, socket)
        log(`результат броска разослан (${stats.rollResults})`)
        return
      }

      // Служебные сообщения автотестов: в обычном запуске отключены.
      case "debug-clear-state": {
        if (!allowDebug) return
        currentState = null
        log("debug: кэш состояния очищен")
        return
      }

      case "debug-drop-clients": {
        if (!allowDebug) return
        log("debug: рвём соединения")
        for (const item of [...clients.keys()]) item.terminate()
        return
      }

      default:
        return
    }
  }

  wss.on("connection", (socket) => {
    stats.clientsTotal += 1
    const clientId = stats.clientsTotal
    clients.set(socket, { id: clientId, role: null, alive: true, misses: 0 })
    log(`соединение #${clientId} (всего: ${clients.size})`)

    socket.on("pong", () => {
      const info = clients.get(socket)
      if (info) info.alive = true
    })
    socket.on("message", (data) => handleMessage(socket, data))
    socket.on("close", () => {
      clearPending(socket)
      const info = clients.get(socket)
      clients.delete(socket)
      log(`отключился клиент #${clientId} (${info?.role ?? "роль неизвестна"}, всего: ${clients.size})`)
      relayPresence()
    })
    socket.on("error", (error) => {
      warn("ошибка сокета:", error?.message ?? error)
      socket.terminate()
    })
  })

  /**
   * Держим OBS-источник живым: браузерный CEF сам отвечает на ping.
   * Один пропущенный pong не приговор — закрываем только после двух подряд,
   * чтобы фриз на пару секунд не рвал трансляцию.
   */
  const heartbeat = setInterval(() => {
    for (const [socket, info] of clients) {
      if (!info.alive) {
        info.misses += 1
        if (info.misses >= 2) {
          log("клиент не отвечает на ping — закрываю сокет")
          socket.terminate()
        }
        continue
      }
      info.alive = false
      info.misses = 0
      if (socket.readyState === socket.OPEN) socket.ping()
    }
  }, heartbeatMs)
  heartbeat.unref?.()

  const address = await listenWithFallback(http, { port: requestedPort, host: requestedHost })
  boundHost = address.host
  boundPort = address.port
  const displayHost = boundHost === "::" || boundHost === "0.0.0.0" ? "localhost" : boundHost
  const url = `ws://${displayHost}:${boundPort}`

  log(`${url} · состояние: ${currentState ? "есть" : "пусто"}`)
  if (!quiet) log(`проверка: http://${displayHost}:${boundPort}/health`)

  return {
    url,
    port: boundPort,
    host: boundHost,
    hasState: () => currentState !== null,
    health: healthPayload,
    async close() {
      clearInterval(heartbeat)
      for (const entry of pendingRequests) clearTimeout(entry.timer)
      pendingRequests.clear()
      for (const socket of clients.keys()) {
        try {
          socket.terminate()
        } catch {
          // Сокет уже закрыт — молча идём дальше.
        }
      }
      clients.clear()
      await new Promise((resolve) => wss.close(() => resolve()))
      http.closeAllConnections?.()
      await new Promise((resolve) => http.close(() => resolve()))
    },
  }
}

/**
 * Порт 0 нужен тестам: берём свободный. Хост по умолчанию — dual-stack "::",
 * чтобы `ws://localhost` не спотыкался об IPv6; при недоступности — IPv4.
 */
function listenWithFallback(server, { port, host }) {
  const candidates = host ? [host] : ["::", "0.0.0.0"]

  return new Promise((resolve, reject) => {
    let index = 0

    const attempt = () => {
      const candidate = candidates[index]
      const onError = (error) => {
        if (error?.code === "EADDRINUSE") {
          error.host = candidate
          reject(error)
          return
        }
        index += 1
        if (index >= candidates.length) {
          reject(error)
          return
        }
        attempt()
      }

      server.once("error", onError)
      server.listen(port, candidate, () => {
        server.off("error", onError)
        const address = server.address()
        resolve({
          host: typeof address === "object" && address ? address.address : candidate,
          port: typeof address === "object" && address ? address.port : Number(port),
        })
      })
    }

    attempt()
  })
}

/** Запуск напрямую: `node server/index.mjs` (отладка связки без Vite). */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const server = await startSyncServer()
  const shutdown = () => {
    void server.close().then(() => process.exit(0))
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

