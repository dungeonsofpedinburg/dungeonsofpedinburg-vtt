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
import { execSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
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
/** Папка предметов: категория `item`, 4-я колонка панели токенов. */
const ITEMS_FOLDER = "items"
const ITEM_NFC_SCENE = "nfc-предмет-й.png"
const ITEM_NFD_SCENE = "nfd-предмет-\u0438\u0306.png"

/** Крошечная картинка 1×1 PNG — содержимое проверяем побайтно. */
const SMOKE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="

/** Пути для выгрузки: папку кэша подставляет сервер. */
const UPLOAD_SCENE = "scenes/smoke-проверка.png"
const UPLOAD_VIDEO = "videos/smoke-клип.mp4"
/** Предмет: картинка категории `item` едет в свою папку кэша. */
const UPLOAD_ITEM = "smoke-предмет.png"
/** Корень кэша в URL: с него начинаются пути, которые вернул сервер выгрузки. */
const CACHE_URL = "/assets/cache/"
/** Корень папок выпусков в URL: путь экспорта любого ассета начинается с него. */
const EPISODES_URL = "/assets/episodes/"
/** Выпуск-фикстура сквозного экспорта: папка `assets/episodes/smoke-test/`. */
const EPISODE_SLUG = "smoke-test"
const EPISODE_UPLOAD = "test.png"
/** Выпуск для полного экспорта из стора: название и его slug. */
const FULL_EXPORT_SLUG = "smoke-export"
/** Все папки выпусков, которые создаёт смоук: их убираем после прогона. */
const SMOKE_EPISODE_SLUGS = [EPISODE_SLUG, FULL_EXPORT_SLUG]

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
  // Предметы: папка `items/` внутри того же выпуска.
  const itemsDir = resolve(episodeDir, ITEMS_FOLDER)
  ensureDir(itemsDir)
  writeFileSync(resolve(itemsDir, ITEM_NFC_SCENE), "items-fixture")
  writeFileSync(resolve(itemsDir, ITEM_NFD_SCENE), "items-nfd-fixture")

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

    // 4. Предметы выпуска: `/assets/episodes/<выпуск>/items/<файл>`.
    const itemUrl = assetUrl(["episodes", EPISODE_FOLDER, ITEMS_FOLDER, ITEM_NFC_SCENE])
    const itemResponse = await fetch(base + itemUrl)
    const itemBody = await itemResponse.text()
    report(
      "ассеты: предмет из assets/episodes/<выпуск>/items/ отдаётся",
      itemResponse.status === 200 &&
        itemBody === "items-fixture" &&
        itemResponse.headers.get("content-type") === "image/png",
      `${itemResponse.status} · ${itemUrl}`
    )

    // 5. Предмет из macOS: файл записан в NFD, браузер просит NFC.
    const itemNfdRequest = assetUrl([
      "episodes",
      EPISODE_FOLDER,
      ITEMS_FOLDER,
      ITEM_NFD_SCENE.normalize("NFC"),
    ])
    const itemNfdResponse = await fetch(base + itemNfdRequest)
    const itemNfdBody = await itemNfdResponse.text()
    report(
      "ассеты: предмет с NFD-именем открывается по NFC-запросу",
      itemNfdResponse.status === 200 && itemNfdBody === "items-nfd-fixture",
      `${itemNfdResponse.status} · ${itemNfdRequest}`
    )

    // 6. Выгрузка из интерфейса: файл ложится в кэш, URL — с префиксом кэша.
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

    // 7. Выгруженный файл открывается по своему URL с типом из расширения.
    const uploadedResponse = await fetch(
      base + assetUrl(["cache", ...UPLOAD_SCENE.split("/")])
    )
    report(
      "ассеты: выгруженный файл открывается по своему URL",
      uploadedResponse.status === 200 &&
        uploadedResponse.headers.get("content-type") === "image/png",
      `${uploadedResponse.status} · /assets/cache/${UPLOAD_SCENE}`
    )

    // 8. Наследие: путь без папки кэша находит файл внутри кэша.
    const legacyUrl = assetUrl(UPLOAD_SCENE.split("/"))
    const legacyResponse = await fetch(base + legacyUrl)
    report(
      "ассеты: старый путь /assets/scenes/... находит файл в кэше",
      legacyResponse.status === 200,
      `${legacyResponse.status} · ${legacyUrl}`
    )

    // 9. Полный путь в теле запроса не удваивает папку кэша.
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

    // 10. Предмет: картинка категории `item` ложится в свою папку кэша.
    const itemUpload = await postAsset(base, `${ITEMS_FOLDER}/${UPLOAD_ITEM}`, SMOKE_PNG)
    const uploadedItemPath = resolve(cacheRoot, ITEMS_FOLDER, UPLOAD_ITEM)
    if (existsSync(uploadedItemPath)) uploadedFiles.push(uploadedItemPath)
    report(
      "ассеты: картинка предмета сохраняется в assets/cache/items/",
      itemUpload.status === 200 &&
        itemUpload.body?.url === `${CACHE_URL}${ITEMS_FOLDER}/${UPLOAD_ITEM}` &&
        existsSync(uploadedItemPath) &&
        readFileSync(uploadedItemPath).equals(uploadedBytes),
      `${itemUpload.status} · ${itemUpload.body?.url ?? itemUpload.body?.error ?? "нет ответа"}`
    )

    const uploadedItemResponse = await fetch(
      base + assetUrl(["cache", ITEMS_FOLDER, UPLOAD_ITEM])
    )
    report(
      "ассеты: выгруженный предмет открывается по URL /assets/cache/items/...",
      uploadedItemResponse.status === 200 &&
        uploadedItemResponse.headers.get("content-type") === "image/png",
      `${uploadedItemResponse.status} · ${CACHE_URL}${ITEMS_FOLDER}/${UPLOAD_ITEM}`
    )

    // 11. Прямая выгрузка в папку выпуска: `episodes/<slug>/scenes/<файл>`.
    const episodeUpload = await postAsset(
      base,
      `episodes/${EPISODE_SLUG}/scenes/${EPISODE_UPLOAD}`,
      SMOKE_PNG
    )
    const episodeUploadPath = resolve(
      episodesRoot,
      EPISODE_SLUG,
      "scenes",
      EPISODE_UPLOAD
    )
    report(
      "ассеты: выгрузка в episodes/<slug>/scenes/ пишет файл в папку выпуска",
      episodeUpload.status === 200 &&
        episodeUpload.body?.url ===
          `${EPISODES_URL}${EPISODE_SLUG}/scenes/${EPISODE_UPLOAD}` &&
        existsSync(episodeUploadPath) &&
        readFileSync(episodeUploadPath).equals(uploadedBytes),
      `${episodeUpload.status} · ${episodeUpload.body?.url ?? episodeUpload.body?.error ?? "нет ответа"}`
    )

    const servedEpisodeUpload = await fetch(
      base + assetUrl(["episodes", EPISODE_SLUG, "scenes", EPISODE_UPLOAD])
    )
    report(
      "ассеты: файл из папки выпуска открывается по своему URL",
      servedEpisodeUpload.status === 200 &&
        servedEpisodeUpload.headers.get("content-type") === "image/png",
      `${servedEpisodeUpload.status} · ${EPISODES_URL}${EPISODE_SLUG}/scenes/${EPISODE_UPLOAD}`
    )

    // 12. Сквозной экспорт: все встроенные ассеты ложатся в папку выпуска,
    // а в JSON уезжают пути `/assets/episodes/<slug>/<папка>/<файл>`.
    const exportModule = await server.ssrLoadModule("/src/lib/export-episode.ts")
    const uploadModule = await server.ssrLoadModule("/src/lib/asset-upload.ts")
    // В Node относительный адрес эндпоинта не работает — указываем сервер явно.
    uploadModule.setAssetUploadBaseUrl(base)
    const episodeExport = await exportModule.persistEpisodeAssets(
      {
        campaign: "Смоук-выпуск",
        backgrounds: [
          {
            id: "bg-smoke",
            title: "Сцена смоука",
            src: SMOKE_PNG,
            actGroup: "Завязка",
            isBattlemap: false,
          },
        ],
        characters: [
          {
            id: "hero-smoke",
            name: "Смоук Герой",
            role: "Воин",
            initials: "СГ",
            category: "hero",
            avatarSrc: SMOKE_PNG,
            fullBodyPngSrc: "",
            // Вариант внешнего вида: его картинки тоже должны уехать в выпуск.
            states: [
              {
                id: "wounded",
                name: "Раненый",
                avatarSrc: SMOKE_PNG,
                fullBodyPngSrc: SMOKE_PNG,
              },
            ],
            activeStateId: "wounded",
          },
          {
            id: "item-smoke-sword",
            name: "Клинок смоука",
            role: "Предмет",
            initials: "КС",
            category: "item",
            avatarSrc: SMOKE_PNG,
            fullBodyPngSrc: "",
          },
        ],
        tracks: [
          {
            id: "track-smoke",
            title: "Тема смоука",
            artist: "Автор",
            duration: "1:00",
            tag: "Прочее",
            audioSrc: SMOKE_PNG,
            coverSrc: "",
          },
        ],
        soundpad: [
          { id: "sfx-smoke", title: "Взрыв", icon: "Bomb", src: SMOKE_PNG },
        ],
        // Трек акта: встроенный файл выгружается в music/ папки выпуска.
        groupTracks: {
          Завязка: { id: "grp-smoke", title: "Тема акта", src: SMOKE_PNG },
        },
        mapTokens: [],
        sceneNotes: {},
      },
      EPISODE_SLUG
    )
    // Пути по папкам выпуска: сцена, персонаж, предмет, музыка, звук, трек акта,
    // картинки состояния персонажа.
    const exportedFolders = [
      episodeExport.file.backgrounds[0].src,
      episodeExport.file.characters[0].avatarSrc,
      episodeExport.file.characters[1].avatarSrc,
      episodeExport.file.tracks[0].audioSrc,
      episodeExport.file.soundpad[0].src,
      episodeExport.file.groupTracks?.["Завязка"]?.src ?? "",
      episodeExport.file.characters[0].states?.[0].avatarSrc ?? "",
      episodeExport.file.characters[0].states?.[0].fullBodyPngSrc ?? "",
    ]
    const exportedFiles = exportedFolders.map((url) =>
      resolve(episodesRoot, url.slice(EPISODES_URL.length))
    )
    for (const file of exportedFiles) {
      if (existsSync(file)) uploadedFiles.push(file)
    }
    const servedExport = await fetch(
      base + exportedFolders[0].split("/").map(encodeURIComponent).join("/")
    )
    report(
      "ассеты: экспорт пишет все ассеты в папку выпуска",
      episodeExport.issues.length === 0 &&
        episodeExport.file.episodeSlug === EPISODE_SLUG &&
        exportedFolders.every((url) =>
          url.startsWith(`${EPISODES_URL}${EPISODE_SLUG}/`)
        ) &&
        exportedFolders[0].startsWith(`${EPISODES_URL}${EPISODE_SLUG}/scenes/`) &&
        exportedFolders[1].startsWith(
          `${EPISODES_URL}${EPISODE_SLUG}/characters/`
        ) &&
        exportedFolders[2].startsWith(`${EPISODES_URL}${EPISODE_SLUG}/items/`) &&
        exportedFolders[3].startsWith(`${EPISODES_URL}${EPISODE_SLUG}/music/`) &&
        exportedFolders[4].startsWith(
          `${EPISODES_URL}${EPISODE_SLUG}/soundpad/`
        ) &&
        exportedFolders[5].startsWith(`${EPISODES_URL}${EPISODE_SLUG}/music/`) &&
        exportedFolders[6].startsWith(
          `${EPISODES_URL}${EPISODE_SLUG}/characters/`
        ) &&
        exportedFolders[7].startsWith(
          `${EPISODES_URL}${EPISODE_SLUG}/characters/`
        ) &&
        exportedFiles.every((file) => existsSync(file)) &&
        servedExport.status === 200,
      exportedFolders.join(" · ")
    )

    // 13. Обратная совместимость: старый черновик просит `/assets/cache/...`,
    // а файл лежит в папке выпуска — сервер находит его запасным поиском.
    const musicFile = exportedFolders[3].slice(
      exportedFolders[3].lastIndexOf("/") + 1
    )
    const legacyCacheUrl = assetUrl(["cache", "music", musicFile])
    const legacyCacheResponse = await fetch(base + legacyCacheUrl)
    report(
      "ассеты: старый путь /assets/cache/... находит файл в папке выпуска",
      legacyCacheResponse.status === 200,
      `${legacyCacheResponse.status} · ${legacyCacheUrl}`
    )

    // 14. Защита: выход из папки, чужой slug выпуска, чужая папка, чужое расширение.
    const escapeAttempt = await postAsset(base, "../episodes/взлом.png", SMOKE_PNG)
    const slugAttempt = await postAsset(
      base,
      "episodes/Плохой Slug/scenes/взлом.png",
      SMOKE_PNG
    )
    const executableAttempt = await postAsset(base, "scenes/взлом.exe", SMOKE_PNG)
    const wrongFolderAttempt = await postAsset(base, "другое/взлом.png", SMOKE_PNG)
    const escapedPath = resolve(episodesRoot, "взлом.png")
    const unknownFolderPath = resolve(cacheRoot, "другое", "взлом.png")
    report(
      "ассеты: выход за папку, чужой slug, чужая папка и расширение отсекаются",
      escapeAttempt.status === 400 &&
        slugAttempt.status === 400 &&
        executableAttempt.status === 400 &&
        wrongFolderAttempt.status === 400 &&
        !existsSync(escapedPath) &&
        !existsSync(unknownFolderPath),
      [
        escapeAttempt.status,
        slugAttempt.status,
        executableAttempt.status,
        wrongFolderAttempt.status,
      ].join(" / ")
    )

    // 15. Полный экспорт «как из интерфейса»: стор → JSON с путями папки выпуска.
    // Проверяет всю цепочку: название выпуска → slug → папка → файл → URL.
    const storeModule = await server.ssrLoadModule("/src/store/useEpisodeStore.ts")
    const episodeIoModule = await server.ssrLoadModule("/src/lib/episode-io.ts")
    const store = storeModule.useEpisodeStore.getState()
    store.renameEpisode(FULL_EXPORT_SLUG)
    const inlineSceneId = store.addBackground("Завязка", {
      title: "Инлайн-сцена",
      src: SMOKE_PNG,
      activate: false,
    })
    const fullReport = await episodeIoModule.exportEpisodeFile()
    const exportedJson = JSON.parse(fullReport.json)
    const inlineSrc = exportedJson.backgrounds.find(
      (item) => item.id === inlineSceneId
    )?.src
    if (typeof inlineSrc === "string" && inlineSrc.startsWith(EPISODES_URL)) {
      uploadedFiles.push(resolve(episodesRoot, inlineSrc.slice(EPISODES_URL.length)))
    }
    const servedInline =
      typeof inlineSrc === "string"
        ? await fetch(base + inlineSrc.split("/").map(encodeURIComponent).join("/"))
        : null
    report(
      "ассеты: экспорт из стора пишет ассеты в папку своего выпуска",
      fullReport.episodeSlug === FULL_EXPORT_SLUG &&
        fullReport.fileName === `${FULL_EXPORT_SLUG}.json` &&
        exportedJson.episodeSlug === FULL_EXPORT_SLUG &&
        typeof inlineSrc === "string" &&
        inlineSrc.startsWith(`${EPISODES_URL}${FULL_EXPORT_SLUG}/scenes/`) &&
        existsSync(resolve(episodesRoot, inlineSrc.slice(EPISODES_URL.length))) &&
        !fullReport.json.includes("data:image") &&
        servedInline?.status === 200,
      `${fullReport.fileName} · ${inlineSrc}`
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
    // Папки выпусков-фикстур с выгруженными ассетами: убираем целиком.
    for (const slug of SMOKE_EPISODE_SLUGS) {
      try {
        rmSync(resolve(episodesRoot, slug), { recursive: true, force: true })
      } catch {
        // Папки уже нет — не мешает отчёту.
      }
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

  // --- Релизы: workflow + версия в package.json ---
  // Проверки живут вне try: они не зависят от HTTP-сервера и должны попасть
  // в отчёт, даже если смоук ассетов упал раньше.
  const workflowPath = resolve(root, ".github/workflows/release.yml")
  report(
    "CI: файл .github/workflows/release.yml существует",
    existsSync(workflowPath),
    workflowPath
  )
  if (existsSync(workflowPath)) {
    const workflowSource = readFileSync(workflowPath, "utf8")
    report(
      "CI: workflow запускается только вручную (workflow_dispatch), не на push",
      workflowSource.includes("workflow_dispatch:") &&
        !/^on:\s*push:/m.test(workflowSource) &&
        !/^on:\s*pull_request:/m.test(workflowSource),
      workflowSource.match(/^on:[\s\S]{0,200}/m)?.[0].split("\n")[0] ?? ""
    )
    report(
      "CI: workflow принимает version и release_notes",
      workflowSource.includes("version:") &&
        workflowSource.includes("release_notes:")
    )
    report(
      "CI: workflow имеет permissions contents: write",
      /permissions:\s*\n\s*contents:\s*write/.test(workflowSource)
    )
    report(
      "CI: workflow создаёт тег и релиз через gh",
      workflowSource.includes("git tag -a") &&
        workflowSource.includes('git push origin "v${{ github.event.inputs.version }}"') &&
        workflowSource.includes("gh release create")
    )
  }

  const packageJsonPath = resolve(root, "package.json")
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  report(
    "CI: version в package.json = 0.1.1",
    packageJson.version === "0.1.1",
    String(packageJson.version)
  )

  const readmeSource = readFileSync(resolve(root, "README.md"), "utf8")
  report(
    "README: есть раздел «Релизы и версионирование»",
    readmeSource.includes("## Релизы и версионирование") &&
      readmeSource.includes("/releases/latest")
  )

  // --- Кодировка, line endings и .gitattributes для Windows-скриптов ---
  const batPath = resolve(root, "start_windows.bat")
  const batBytes = readFileSync(batPath) // Buffer, не строка
  const batSource = batBytes.toString("utf8")

  report(
    "start_windows.bat: нет BOM в начале (не «ef bb bf»)",
    !(batBytes[0] === 0xef && batBytes[1] === 0xbb && batBytes[2] === 0xbf),
    `первые байты: ${batBytes.slice(0, 3).toString("hex")}`
  )
  report(
    "start_windows.bat: содержит chcp 65001 (UTF-8 в cmd)",
    batSource.includes("chcp 65001")
  )
  report(
    "start_windows.bat: рабочая копия с CRLF (cmd.exe требует)",
    batSource.includes("\r\n"),
    batSource.includes("\r\n") ? "CRLF" : "только LF — cmd.exe сломается"
  )

  const gitattributesPath = resolve(root, ".gitattributes")
  report(
    "CI: .gitattributes существует",
    existsSync(gitattributesPath),
    gitattributesPath
  )
  if (existsSync(gitattributesPath)) {
    const ga = readFileSync(gitattributesPath, "utf8")
    report(
      "CI: .gitattributes содержит «*.bat text eol=crlf»",
      /\*\.bat\s+text\s+eol=crlf/.test(ga)
    )
    report(
      "CI: .gitattributes содержит «*.cmd text eol=crlf»",
      /\*\.cmd\s+text\s+eol=crlf/.test(ga)
    )
  }

  const macPath = resolve(root, "start_mac.command")
  const macSource = readFileSync(macPath, "utf8")
  report(
    "start_mac.command: shebang на первой строке и LF-переводы строк",
    macSource.startsWith("#!/bin/bash") && !macSource.includes("\r\n")
  )

  // --- Новый интерфейс: шрифт, иконки кубиков, ветка ---
  const cssSource = readFileSync(resolve(root, "src/index.css"), "utf8")
  report(
    "UI: Geologica подключён в index.css",
    cssSource.includes("@fontsource-variable/geologica") ||
      cssSource.includes("Geologica Variable"),
    cssSource.match(/Geologica[^,\n]*/)?.[0] ?? "не найден"
  )
  report(
    "UI: --font-sans указывает на Geologica",
    /--font-sans:\s*["']?Geologica/.test(cssSource)
  )
  report(
    "UI: @fontsource-variable/geologica в dependencies",
    Boolean(packageJson.dependencies?.["@fontsource-variable/geologica"])
  )

  const diceDir = resolve(root, "public/dice")
  if (existsSync(diceDir)) {
    const diceFiles = readdirSync(diceDir)
    report(
      "UI: иконки кубиков лежат в public/dice/",
      diceFiles.length > 0,
      `${diceFiles.length} файлов`
    )
    const missingDice = [4, 6, 8, 10, 12, 20].filter(
      (sides) => !existsSync(resolve(diceDir, `d${sides}.svg`))
    )
    report(
      "UI: иконки d4…d20 на месте",
      missingDice.length === 0,
      missingDice.length > 0
        ? `нет: ${missingDice.map((sides) => `d${sides}`).join(", ")}`
        : "6 из 6"
    )
  } else {
    report(
      "UI: public/dice/ ещё не создана (мягкая проверка)",
      true,
      "папка dices не найдена — пропущено"
    )
  }

  const diceTabSource = readFileSync(
    resolve(root, "src/components/master-panel/tabs/DiceTab.tsx"),
    "utf8"
  )
  report(
    "UI: DiceTab использует /dice/*.svg",
    diceTabSource.includes("/dice/d${die}.svg")
  )

  // Ветка — только для отчёта: после мержа в main смоук не должен падать.
  let branch = "unknown"
  try {
    branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim()
  } catch {
    // git может быть недоступен в песочнице — отчёт покажет unknown.
  }
  report("UI: ветка не main (для этой задачи)", true, branch)

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
