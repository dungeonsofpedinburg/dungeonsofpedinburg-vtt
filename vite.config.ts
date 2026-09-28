import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Префикс URL, по которому адресуются ассеты выпуска. Тот же путь пишется в JSON
 * выпуска (`/assets/episodes/ep-01/scenes/harbor.png`), поэтому он одинаков на
 * Windows и macOS.
 */
const ASSETS_URL_PREFIX = '/assets/'

/**
 * Папка временного кэша внутри `./assets/`: сюда эндпоинт выгрузки кладёт файлы,
 * загруженные «на лету» из интерфейса (картинки сцен и токенов, музыка,
 * саундпад, видео-фоны, выгрузка Base64). Постоянное хранилище выпусков —
 * `./assets/episodes/`: его наполняют вручную, и эндпоинт туда не пишет никогда.
 * Кэш можно стереть целиком: подпапки создадутся заново при первой выгрузке.
 */
const ASSETS_CACHE_FOLDER = 'cache'

/** URL-префикс кэша: `/assets/cache/...` — его получает клиент в ответе выгрузки. */
const ASSETS_CACHE_URL_PREFIX = `${ASSETS_URL_PREFIX}${ASSETS_CACHE_FOLDER}/`

/**
 * Эндпоинт выгрузки ассетов выпуска: Мастер выбирает картинки и музыку в
 * браузере, а файлы ложатся в папку кэша `./assets/cache/` — из JSON на них едет
 * только относительный путь. Без этого шага файл выпуска раздувался бы Base64.
 */
const ASSET_UPLOAD_ENDPOINT = '/__pedinburg/assets'

/**
 * Предел размера тела запроса на выгрузку ассета — 1 ГБ.
 *
 * Тело — это JSON с data-URL, а Base64 добавляет к файлу ещё ~33 %, поэтому
 * запас взят с расчётом на тяжёлые видео-фоны (70 МБ и заметно больше): сервер
 * обязан принимать их без «файл слишком большой». Что не влезло — отсекаем
 * ответом 413, не читая поток целиком.
 */
const MAX_ASSET_UPLOAD_BYTES = 1024 * 1024 * 1024

/** Размер для сообщений об ошибке: 1.0 ГБ, 64 МБ. */
function formatBytes(bytes: number) {
  const megabytes = bytes / 1024 / 1024
  return megabytes >= 1024
    ? `${(megabytes / 1024).toFixed(1)} ГБ`
    : `${Math.round(megabytes)} МБ`
}

/** Символы, недопустимые в пути ассета: разделители Windows и прочие спецсимволы. */
const UNSAFE_ASSET_PATH = /[\\:*?"<>|]/

/** Есть ли в пути управляющие символы: их в именах файлов быть не должно. */
function hasControlChars(value: string) {
  for (const char of value) {
    if ((char.codePointAt(0) ?? 0) < 0x20) return true
  }
  return false
}

/** data-URL с base64: `data:image/webp;base64,AAAA…` */
const DATA_URL_PATTERN = /^data:[^;,]+;base64,([\s\S]+)$/

/**
 * Папки dice-box (`ammo` — WASM-физика, `themes` — оформление кубиков) лежат в
 * public/assets и раздаются самим Vite: их перехватывать нельзя.
 */
const PUBLIC_ASSET_FOLDERS = /^\/assets\/(?:ammo|themes)\//i

/** MIME-типы ассетов выпуска: картинки сцен и токенов, музыка, видео, шрифты. */
const ASSET_MIME_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/** Диапазон запрошен неверно или выходит за границы файла — по RFC 7233 это 416. */
const UNSATISFIABLE_RANGE = 'unsatisfiable'

/**
 * Один диапазон из заголовка Range (перемотка музыки в плеере):
 * `bytes=100-199`, `bytes=100-` (до конца файла), `bytes=-500` (последние 500 байт).
 * Возвращает `null`, если заголовка нет или он испорчен — тогда отдаём файл
 * целиком, как рекомендует RFC 7233. `UNSATISFIABLE_RANGE` — диапазон записан
 * верно, но файл его не покрывает: клиент получит 416.
 */
function parseByteRange(header: string | undefined, size: number) {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null
  if (!match || (match[1] === '' && match[2] === '')) return null
  if (size === 0) return UNSATISFIABLE_RANGE
  if (match[1] === '') {
    // `bytes=-500` — последние 500 байт файла.
    const length = Number(match[2])
    if (length <= 0) return UNSATISFIABLE_RANGE
    return { start: Math.max(size - length, 0), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Number(match[2])
  // Начало за концом файла — диапазон невыполним.
  if (start >= size) return UNSATISFIABLE_RANGE
  // `bytes=50-20` — диапазон вывернут наизнанку, заголовок просто игнорируем.
  if (end < start) return null
  return { start, end: Math.min(end, size - 1) }
}

/** Ответ эндпоинта выгрузки: JSON, который клиент читает как отчёт о записи файла. */
function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  // Это отчёт о записи, а не файл: кэшировать его нельзя.
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Тело запроса больше предела: клиенту отвечаем 413, а не общей 500. */
class RequestTooLargeError extends Error {}

/**
 * Тело запроса целиком. Ассет едет в JSON как data-URL, поэтому тело бывает
 * крупным (Base64 — это +33% к размеру файла): читаем поток с ограничением.
 *
 * Превышение предела не роняет соединение: отвечаем клиенту ошибкой, а остаток
 * тела сливаем в никуда (`req.resume()`), иначе браузер увидел бы обрыв сети
 * вместо понятного сообщения.
 */
function readRequestBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    // Размер обычно известен заранее — на этом отсекаем сразу, без чтения.
    const declared = Number(req.headers['content-length'] ?? 0)
    if (Number.isFinite(declared) && declared > MAX_ASSET_UPLOAD_BYTES) {
      req.resume()
      reject(new RequestTooLargeError('тело запроса больше допустимого размера'))
      return
    }

    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    req.on('data', (chunk: Buffer) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_ASSET_UPLOAD_BYTES) {
        settled = true
        chunks.length = 0
        reject(new RequestTooLargeError('тело запроса больше допустимого размера'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

/**
 * Путь внутри папки кэша для принимаемого файла или `null`, если путь
 * небезопасен: выход за папку (`..`), буква диска, обратные слеши, имя без
 * известного расширения. Расширения сверяем с таблицей MIME — так в папку
 * ассетов не попадёт ничего исполняемого.
 *
 * Запись возможна только в кэш: путь к постоянным выпускам (`../episodes/...`)
 * отсекается проверкой вложенности, а не «договорённостью» с клиентом.
 */
function resolveCacheFilePath(cacheRoot: string, relativePath: string) {
  if (!relativePath || UNSAFE_ASSET_PATH.test(relativePath)) return null
  if (hasControlChars(relativePath)) return null
  const segments = relativePath.split('/')
  if (segments.some((part) => part === '' || part === '.' || part === '..')) return null
  const extension = path.extname(relativePath).toLowerCase()
  if (!(extension in ASSET_MIME_TYPES)) return null
  const filePath = path.resolve(cacheRoot, relativePath)
  // Второй барьер к `..`: итоговый путь обязан остаться внутри кэша.
  if (!filePath.startsWith(cacheRoot + path.sep)) return null
  return filePath
}

/**
 * Путь из тела запроса внутрь кэша. Клиент присылает `scenes/forest.jpg`, но
 * полную форму (`/assets/cache/scenes/forest.jpg`) тоже принимаем: эндпоинт не
 * должен зависеть от того, какая запись пути сложилась в вызывающем коде.
 * Префиксы снимаем до проверки безопасности — итоговый путь всё равно обязан
 * остаться внутри `assets/cache/`.
 */
function toCacheRelativePath(value: string) {
  return value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^assets\//i, '')
    .replace(/^cache\//i, '')
}

/**
 * Файл ассета внутри корневой `assets/` по относительному пути из URL — или
 * `null`, если файла нет. Учитывает две особенности файловых систем:
 *
 * * защита от выхода за `assets/`: `..`, абсолютные пути и UNC не проходят;
 * * кириллица на macOS: APFS/HFS+ хранит имена в NFD («й» = «и» + диакритика),
 *   а браузер запрашивает канонический NFC — проверяем оба варианта нормализации
 *   и берём тот, что реально лежит на диске.
 */
function resolveExistingAssetPath(assetsRoot: string, relativePath: string) {
  const target = path.resolve(assetsRoot, relativePath)
  // Защита от выхода за папку assets: `..`, абсолютные пути, UNC.
  if (target !== assetsRoot && !target.startsWith(assetsRoot + path.sep)) return null
  const nfcPath = path.normalize(target).normalize('NFC')
  const nfdPath = path.normalize(target).normalize('NFD')
  if (existsSync(nfcPath)) return nfcPath
  if (existsSync(nfdPath)) return nfdPath
  return null
}

/**
 * Приём ассета выпуска от Мастера: раскодирует data-URL из тела запроса и кладёт
 * файл в папку кэша `assets/cache/`, чтобы в JSON выпуска уехал относительный
 * путь (`/assets/cache/scenes/forest.jpg`), а не Base64 на сто мегабайт. Папки
 * кэша создаются автоматически — их можно стереть, загрузка их вернёт.
 */
async function handleAssetUpload(
  req: IncomingMessage,
  res: ServerResponse,
  cacheRoot: string
) {
  try {
    const body = JSON.parse(await readRequestBody(req)) as {
      path?: unknown
      dataUrl?: unknown
    }
    if (typeof body.path !== 'string' || typeof body.dataUrl !== 'string') {
      sendJson(res, 400, { error: 'нужны поля path и dataUrl' })
      return
    }
    // Обратно в URL уезжает канонический NFC: тем же видом пути лежат в JSON.
    const relativePath = toCacheRelativePath(body.path).normalize('NFC')
    const filePath = resolveCacheFilePath(cacheRoot, relativePath)
    if (!filePath) {
      sendJson(res, 400, { error: 'недопустимый путь ассета' })
      return
    }
    const match = DATA_URL_PATTERN.exec(body.dataUrl.trim())
    if (!match) {
      sendJson(res, 400, { error: 'ожидался data-URL с base64' })
      return
    }
    const file = Buffer.from(match[1], 'base64')
    if (file.length === 0) {
      sendJson(res, 400, { error: 'пустой файл' })
      return
    }
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, file)
    sendJson(res, 200, {
      url: `${ASSETS_CACHE_URL_PREFIX}${relativePath}`,
      bytes: file.length,
    })
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      // 413 — «файл слишком большой»: так браузер видит понятную причину,
      // а не обрыв соединения посреди выгрузки.
      sendJson(res, 413, {
        error: `файл слишком большой: предел ${formatBytes(MAX_ASSET_UPLOAD_BYTES)} на тело запроса (в JSON ассет едет в base64, это ещё +33% к файлу)`,
      })
      return
    }
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'не удалось сохранить ассет',
    })
  }
}

/**
 * Отдаёт файлы из корневой папки `assets/` по URL `/assets/...` — и в dev, и в
 * preview. Без этого пути из JSON выпуска работали бы только в dev (Vite отдаёт
 * файлы корня проекта неявно) и падали с 404 в preview, где есть только dist.
 * Так закрыты обе зоны: постоянные выпуски (`/assets/episodes/...`) и кэш
 * (`/assets/cache/...`). Тот же middleware принимает POST `/__pedinburg/assets` —
 * запись ассетов выпуска в кэш.
 */
function createEpisodeAssetsMiddleware(assetsRoot: string) {
  const cacheRoot = path.resolve(assetsRoot, ASSETS_CACHE_FOLDER)
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.startsWith(ASSET_UPLOAD_ENDPOINT)) {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'нужен метод POST' })
        return
      }
      void handleAssetUpload(req, res, cacheRoot)
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const url = req.url ?? ''
    if (!url.startsWith(ASSETS_URL_PREFIX)) return next()
    if (PUBLIC_ASSET_FOLDERS.test(url)) return next()

    let requestPath: string
    try {
      // Декодируем адрес целиком: кириллица и пробелы приезжают в процентном
      // анкодинге, а строка запроса (`?v=2`) к файлу отношения не имеет.
      requestPath = decodeURIComponent(url.split('?')[0])
    } catch {
      // Битый процентный анкодинг (например `/assets/%zz.png`) — отдаём 404.
      return next()
    }
    if (!requestPath.startsWith(ASSETS_URL_PREFIX)) return next()

    const relativePath = requestPath.slice(ASSETS_URL_PREFIX.length)
    const filePath =
      resolveExistingAssetPath(assetsRoot, relativePath) ??
      // Наследие: до разделения на `episodes/` и `cache/` файлы лежали прямо в
      // `assets/scenes`, `assets/music` и т.д. Файл выпуска, собранный тогда,
      // продолжает открываться — ищем тот же путь внутри кэша.
      resolveExistingAssetPath(assetsRoot, `${ASSETS_CACHE_FOLDER}/${relativePath}`)
    if (!filePath) return next()
    const stats = statSync(filePath)
    if (!stats.isFile()) return next()

    const etag = `W/"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`
    const extension = path.extname(filePath).toLowerCase()
    res.setHeader(
      'Content-Type',
      ASSET_MIME_TYPES[extension] ?? 'application/octet-stream'
    )
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Last-Modified', stats.mtime.toUTCString())
    res.setHeader('ETag', etag)
    // Картинки сцен подменяют прямо во время эфира: пусть клиент каждый раз
    // спрашивает свежесть у сервера, а не держит файл в кэше.
    res.setHeader('Cache-Control', 'no-cache')

    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304
      return res.end()
    }

    const range = parseByteRange(req.headers.range, stats.size)
    if (range === UNSATISFIABLE_RANGE) {
      res.statusCode = 416
      res.setHeader('Content-Range', `bytes */${stats.size}`)
      return res.end()
    }
    if (range) {
      res.statusCode = 206
      res.setHeader(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${stats.size}`
      )
      res.setHeader('Content-Length', String(range.end - range.start + 1))
    } else {
      res.statusCode = 200
      res.setHeader('Content-Length', String(stats.size))
    }
    if (req.method === 'HEAD') return res.end()

    const stream = range
      ? createReadStream(filePath, { start: range.start, end: range.end })
      : createReadStream(filePath)
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  }
}

/** Плагин раздачи корневой папки assets/ по URL `/assets/...` в dev и preview. */
function serveEpisodeAssets(): Plugin {
  const assetsRoot = path.resolve(import.meta.dirname, 'assets')
  const middleware = createEpisodeAssetsMiddleware(assetsRoot)
  return {
    name: 'pedinburg:serve-episode-assets',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), serveEpisodeAssets()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
