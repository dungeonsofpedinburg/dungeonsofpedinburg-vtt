// Смоук-тесты стора и общих хелперов (syncSmoke.ts) в Node через Vite SSR.
// Запуск: npm run smoke
// Sync-сервер (server/index.mjs) поднимается прямо здесь на свободном порту:
// сокеты идут через реальный loopback, а не через моки.
import { createServer } from "vite"
import { startSyncServer } from "../server/index.mjs"

const sync = await startSyncServer({
  port: 0,
  host: "127.0.0.1",
  quiet: true,
  allowDebug: true,
  requestTimeoutMs: 400,
})
// Смоук выполняется в Node: клиент читает адрес сервера из окружения.
process.env.PEDINBURG_SYNC_URL = sync.url

const server = await createServer({
  configFile: "./vite.config.ts",
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "warn",
})

try {
  await server.ssrLoadModule("/src/store/syncSmoke.ts")
} catch (error) {
  console.error("\n[smoke] ОШИБКА:", error?.message ?? error)
  process.exitCode = 1
} finally {
  await server.close()
  await sync.close()
}
