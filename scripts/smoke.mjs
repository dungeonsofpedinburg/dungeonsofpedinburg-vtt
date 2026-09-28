// Смоук-тесты стора и общих хелперов (syncSmoke.ts) в Node через Vite SSR.
// Запуск: npm run smoke
// Sync-сервер (server/index.mjs) поднимается прямо здесь на свободном порту:
// сокеты идут через реальный loopback, а не через моки.
// Вторая часть — раздача и выгрузка ассетов на настоящем HTTP-сервере Vite
// (scripts/smoke-assets.mjs): кодирование URL, кириллица, NFD, Range, кэш.
import { createServer } from "vite"
import { startSyncServer } from "../server/index.mjs"
import { runAssetServerSmoke } from "./smoke-assets.mjs"

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

// Ассеты выпуска: файлы из корня assets/ и выгрузка в assets/cache/.
try {
  const assetChecks = await runAssetServerSmoke()
  for (const item of assetChecks) {
    if (!item.ok) process.exitCode = 1
    console.log(
      `${item.ok ? "PASS" : "FAIL"} · ${item.label}${item.detail ? ` — ${item.detail}` : ""}`
    )
  }
} catch (error) {
  console.error("\n[smoke] ОШИБКА ассетов:", error?.message ?? error)
  process.exitCode = 1
}
