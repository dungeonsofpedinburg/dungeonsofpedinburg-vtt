// Разработка в одном окне: Vite + локальный sync-сервер (порт 5174) в одном процессе.
// Запуск: npm run dev:all (или npm run preview:all для собранной сборки).
// Ctrl+C останавливает оба процесса, потому что оба живут в этом дереве процессов.
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { DEFAULT_SYNC_PORT, startSyncServer } from "../server/index.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const viteBin = join(root, "node_modules", "vite", "bin", "vite.js")

if (!existsSync(viteBin)) {
  console.error("[dev] Не найден Vite. Сначала выполните: npm install")
  process.exit(1)
}

const args = process.argv.slice(2)
const preview = args.includes("--preview")
const viteArgs = args.filter((arg) => arg !== "--preview")
const webPort = process.env.WEB_PORT ?? "5173"
const syncPort = Number(process.env.SYNC_PORT ?? DEFAULT_SYNC_PORT)

let sync = null
try {
  sync = await startSyncServer({ port: syncPort })
} catch (error) {
  if (error?.code === "EADDRINUSE") {
    // Частый случай: сервер уже поднят соседним окном. Синхронизация общая — это нормально.
    console.warn(
      `[dev] Порт ${syncPort} занят: sync-сервер уже запущен, синхронизация пойдёт через него.`
    )
  } else {
    console.error("[dev] Не удалось поднять sync-сервер:", error?.message ?? error)
    process.exit(1)
  }
}

console.log(
  `[dev] sync-сервер: ${sync ? `${sync.url} (проверка: ${sync.url.replace(/^ws/, "http")}/health)` : "внешний"}`
)
console.log(`[dev] интерфейс: http://localhost:${webPort} · экран OBS: http://localhost:${webPort}/screen`)

const child = spawn(process.execPath, [viteBin, preview ? "preview" : "dev", "--host", "--port", webPort, ...viteArgs], {
  cwd: root,
  stdio: "inherit",
})

let closing = false
async function shutdown(code = 0) {
  if (closing) return
  closing = true
  try {
    child.kill()
  } catch {
    // Vite уже завершился сам.
  }
  await sync?.close()
  process.exit(code)
}

process.on("SIGINT", () => void shutdown(0))
process.on("SIGTERM", () => void shutdown(0))
child.on("exit", (code) => void shutdown(code ?? 0))
