import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Префикс URL, по которому адресуются ассеты выпуска. Тот же путь пишется в JSON
 * выпуска (`/assets/scenes/harbor.png`), поэтому он одинаков на Windows и macOS.
 */
const ASSETS_URL_PREFIX = '/assets/'

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

/**
 * Отдаёт файлы из корневой папки `assets/` по URL `/assets/...` — и в dev, и в
 * preview. Без этого пути из JSON выпуска работали бы только в dev (Vite отдаёт
 * файлы корня проекта неявно) и падали с 404 в preview, где есть только dist.
 */
function createEpisodeAssetsMiddleware(assetsRoot: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const url = req.url ?? ''
    if (!url.startsWith(ASSETS_URL_PREFIX)) return next()
    if (PUBLIC_ASSET_FOLDERS.test(url)) return next()

    let relativePath: string
    try {
      relativePath = decodeURIComponent(
        new URL(url, 'http://localhost').pathname.slice(ASSETS_URL_PREFIX.length)
      )
    } catch {
      // Битый процентный анкодинг (например `/assets/%zz.png`) — отдаём 404.
      return next()
    }

    const filePath = path.resolve(assetsRoot, relativePath)
    // Защита от выхода за папку assets: `..`, абсолютные пути, UNC.
    if (!filePath.startsWith(assetsRoot + path.sep)) return next()
    if (!existsSync(filePath)) return next()
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
