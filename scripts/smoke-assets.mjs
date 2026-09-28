// Смоук раздачи и выгрузки ассетов выпуска на настоящем HTTP-сервере Vite.
// Запускается из scripts/smoke.mjs (npm run smoke).
//
// Что проверяем — то, чего не видно из SSR-тестов стора (src/store/syncSmoke.ts):
// * `/assets/episodes/...` и `/assets/cache/...` отдаются из корня `assets/`;
// * кириллица, пробелы и знак «№» в пути не ломают запрос (декодирование URL);
// * файл, записанный в форме NFD (macOS), открывается по запросу в форме NFC;
// * Range-запрос на файл выпуска отвечает 206 Partial Content (перемотка);
// * POST /__pedinburg/assets кладёт файл физически в `assets/cache/` и возвращает
//   URL с префиксом `/assets/cache/`;
// * выход за папку кэша и чужие расширения отсекаются с ответом 400.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const assetsRoot = resolve(root, "assets")
const episodesRoot = resolve(assetsRoot, "episodes")
const cacheRoot = resolve(assetsRoot, "cache")
/**
 * Отдельный кэш оптимизатора вне проекта: смоук не делит `node_modules/.vite`
 * с запущенным `npm run dev` и не оставляет после себя папок в репозитории.
 */
const cacheDir = join(tmpdir(), "pedinburg-smoke-vite-cache")

/** Папка выпуска-фикстуры и имена файлов внутри неё. */
const EPISODE_FOLDER = "smoke-выпуск №1"
const NFC_SCENE = "nfc-й.jpg"
/** Тот же «й», но в форме NFD: «и» + диакритика — так имя лежит на диске в macOS. */
const NFD_SCENE = "nfd-\u0438\u0306.jpg"

/** Крошечная картинка 1×1 PNG — содержимое проверяем побайтно. */
const SMOKE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="

/** Пути для выгрузки: папку кэша подставляет сервер. */
const UPLOAD_SCENE = "scenes/smoke-проверка.png"
const UPLOAD_VIDEO = "videos/smoke-клип.mp4"

/** URL из сегментов пути: кириллица и пробелы уезжают в процентном анкодинге. */
function assetUrl(segments) {
  return `/assets/${segments.map(encodeURIComponent).join("/")}`
}

/**
 * Прогон смоука ассетов. Возвращает список проверок — их печатает smoke.mjs,
 * чтобы отчёт шёл в общем потоке с SSR-проверками.
 */
export async function runAssetServerSmoke() {
  const checks = []
  const report = (label, ok, detail = "") => {
    checks.push({ label, ok: Boolean(ok), detail })
    return Boolean(ok)
  }

  const episodeDir = resolve(episodesRoot, EPISODE_FOLDER)
  const sceneDir = resolve(episodeDir, "scenes")
  const uploadedFiles = []
  const createdDirs = []

  // Кэш оптимизатора от прошлого прогона: на Windows папка остаётся занятой до
  // выхода процесса, поэтому подчищаем её в начале, а не только в конце.
  rmSync(cacheDir, { recursive: true, force: true })

  /** Создаёт папку и запоминает, что её создали мы (её же и уберём). */
  const ensureDir = (dir) => {
    if (existsSync(dir)) return
    mkdirSync(dir, { recursive: true })
    createdDirs.push(dir)
  }

  // Фикстуры выпуска: один файл с именем в NFC, другой — в NFD.
  ensureDir(sceneDir)
  writeFileSync(resolve(sceneDir, NFC_SCENE), "nfc-fixture")
  writeFileSync(resolve(sceneDir, NFD_SCENE), "nfd-fixture")

  let server = null
  try {
    server = await createServer({
      configFile: resolve(root, "vite.config.ts"),
      logLevel: "silent",
      cacheDir,
      server: { host: "127.0.0.1", port: 0, strictPort: false },
    })
    await server.listen()
    const address = server.httpServer?.address()
    const port = typeof address === "object" && address ? address.port : 0
    if (!port) throw new Error("сервер Vite не сообщил порт")
    const base = `http://127.0.0.1:${port}`

    // 1. Файл выпуска с кириллицей, пробелом и знаком «№» в пути.
    const episodeUrl = assetUrl(["episodes", EPISODE_FOLDER, "scenes", NFC_SCENE])
    const episodeResponse = await fetch(base + episodeUrl)
    const episodeBody = await episodeResponse.text()
    report(
      "ассеты: файл из assets/episodes/ отдаётся (кириллица, пробел, №)",
      episodeResponse.status === 200 &&
        episodeBody === "nfc-fixture" &&
        episodeResponse.headers.get("content-type") === "image/jpeg" &&
        episodeResponse.headers.get("accept-ranges") === "bytes",
      `${episodeResponse.status} · ${episodeUrl}`
    )

    // 2. macOS: файл лежит на диске в NFD, браузер просит NFC.
    const nfdRequestUrl = assetUrl([
      "episodes",
      EPISODE_FOLDER,
      "scenes",
      NFD_SCENE.normalize("NFC"),
    ])
    const nfdResponse = await fetch(base + nfdRequestUrl)
    const nfdBody = await nfdResponse.text()
    report(
      "ассеты: NFD-имя с диска открывается по NFC-запросу (macOS ↔ Windows)",
      nfdResponse.status === 200 && nfdBody === "nfd-fixture",
      `${nfdResponse.status} · ${nfdRequestUrl}`
    )

    // 3. Range-запрос: перемотка аудио и видео (206 Partial Content).
    const rangeResponse = await fetch(base + nfdRequestUrl, {
      headers: { Range: "bytes=0-3" },
    })
    const rangeBody = await rangeResponse.text()
    report(
      "ассеты: Range-запрос на файл выпуска отвечает 206",
      rangeResponse.status === 206 &&
        rangeBody === "nfd-" &&
        rangeResponse.headers.get("content-range") === "bytes 0-3/11",
      `${rangeResponse.status} · ${rangeResponse.headers.get("content-range")}`
    )

    // 4. Выгрузка из интерфейса: файл ложится в кэш, URL — с префиксом кэша.
    const upload = await postAsset(base, UPLOAD_SCENE, SMOKE_PNG)
    const uploadedPath = resolve(cacheRoot, UPLOAD_SCENE)
    if (existsSync(uploadedPath)) uploadedFiles.push(uploadedPath)
    const uploadedBytes = Buffer.from(SMOKE_PNG.split(",")[1], "base64")
    report(
      "ассеты: выгрузка кладёт файл в assets/cache/ и отдаёт /assets/cache/...",
      upload.status === 200 &&
        upload.body?.url === `/assets/cache/${UPLOAD_SCENE}` &&
        existsSync(uploadedPath) &&
        readFileSync(uploadedPath).equals(uploadedBytes),
      `${upload.status} · ${upload.body?.url ?? upload.body?.error ?? "нет ответа"}`
    )

    // 5. Выгруженный файл открывается по своему URL с типом из расширения.
    const uploadedResponse = await fetch(
      base + assetUrl(["cache", ...UPLOAD_SCENE.split("/")])
    )
    report(
      "ассеты: выгруженный файл открывается по своему URL",
      uploadedResponse.status === 200 &&
        uploadedResponse.headers.get("content-type") === "image/png",
      `${uploadedResponse.status} · /assets/cache/${UPLOAD_SCENE}`
    )

    // 6. Наследие: путь без папки кэша находит файл внутри кэша.
    const legacyUrl = assetUrl(UPLOAD_SCENE.split("/"))
    const legacyResponse = await fetch(base + legacyUrl)
    report(
      "ассеты: старый путь /assets/scenes/... находит файл в кэше",
      legacyResponse.status === 200,
      `${legacyResponse.status} · ${legacyUrl}`
    )

    // 7. Полный путь в теле запроса не удваивает папку кэша.
    const videoUpload = await postAsset(
      base,
      `/assets/cache/${UPLOAD_VIDEO}`,
      "data:video/mp4;base64,AAAAIGZ0eXA="
    )
    const videoPath = resolve(cacheRoot, UPLOAD_VIDEO)
    if (existsSync(videoPath)) uploadedFiles.push(videoPath)
    report(
      "ассеты: полный путь из тела запроса не удваивает папку кэша",
      videoUpload.status === 200 &&
        videoUpload.body?.url === `/assets/cache/${UPLOAD_VIDEO}` &&
        existsSync(videoPath),
      `${videoUpload.status} · ${videoUpload.body?.url ?? videoUpload.body?.error}`
    )

    // 8. Безопасность: выход за папку кэша и чужое расширение отсекаются.
    const escapeAttempt = await postAsset(base, "../episodes/взлом.png", SMOKE_PNG)
    const executableAttempt = await postAsset(base, "scenes/взлом.exe", SMOKE_PNG)
    const escapedPath = resolve(episodesRoot, "взлом.png")
    report(
      "ассеты: выход за папку кэша и чужое расширение отсекаются",
      escapeAttempt.status === 400 &&
        executableAttempt.status === 400 &&
        !existsSync(escapedPath),
      `${escapeAttempt.status} / ${executableAttempt.status}`
    )
  } catch (error) {
    report("ассеты: смоук выполнился", false, error?.message ?? String(error))
  } finally {
    try {
      await server?.close()
    } catch {
      // Сервер уже закрыт или не поднялся — фикстуры всё равно убираем.
    }
    for (const file of uploadedFiles) {
      try {
        rmSync(file, { force: true })
      } catch {
        // Файл уже удалён — отчёту это не мешает.
      }
    }
    try {
      rmSync(episodeDir, { recursive: true, force: true })
    } catch {
      // Фикстура выпуска уже убрана.
    }
    // Убираем только те папки, что создал смоук: кэш пользователя цел.
    for (const dir of createdDirs.reverse()) {
      try {
        rmSync(dir, { recursive: false, force: false })
      } catch {
        // В папке есть чужие файлы — оставляем как есть.
      }
    }
    try {
      rmSync(cacheDir, { recursive: true, force: true })
    } catch {
      // Кэш оптимизатора Vite мог не создаться.
    }
  }

  return checks
}

/** POST на эндпоинт выгрузки: возвращает статус и разобранный JSON. */
async function postAsset(base, path, dataUrl) {
  const response = await fetch(`${base}/__pedinburg/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, dataUrl }),
  })
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  }
}
