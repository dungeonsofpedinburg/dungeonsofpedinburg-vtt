import type { EpisodeFile } from "@/data/types"

/** Префикс URL, по которому раздаются ассеты выпуска (корневая папка ./assets). */
export const ASSETS_URL_PREFIX = "/assets/"

/**
 * Значения, которые уже являются ссылкой, а не путём к файлу: data-URL картинок
 * из стора, blob:-превью, CDN и протокол-относительные ссылки — не переписываем.
 */
const KEEP_AS_IS = /^(?:data:|blob:|https?:|\/\/)/i

/**
 * Приводит путь к ассету выпуска к относительному URL от корня assets/:
 *
 *   "C:\game\assets\scenes\ep1\forest.jpg" → "/assets/scenes/ep1/forest.jpg"
 *   "/Users/me/proj/assets/music/theme.mp3" → "/assets/music/theme.mp3"
 *   "file:///D:/proj/assets/x.png" → "/assets/x.png"
 *   "assets/scenes/forest.jpg" → "/assets/scenes/forest.jpg"
 *
 * Значения без папки assets (например `/placeholders/*.svg` или data-URL)
 * возвращаются как есть: подставить им префикс нельзя.
 */
export function toAssetUrl(value: string | null | undefined): string {
  const path = (value ?? "").trim()
  if (!path || KEEP_AS_IS.test(path)) return path
  // file:///D:/proj/assets/x.png → D:/proj/assets/x.png, затем слеши \\ → /.
  const unified = path.replace(/^file:\/{2,}/i, "").replace(/\\/g, "/")
  if (unified.startsWith("assets/")) {
    return `${ASSETS_URL_PREFIX}${unified.slice("assets/".length)}`
  }
  // Жадный `.*` — берём последнее вхождение `/assets/`: путь с вложенной папкой
  // assets/assets/x.png тоже даёт корректный URL от корня.
  return unified.replace(/^.*\/assets\//i, ASSETS_URL_PREFIX)
}

/**
 * Инлайн-ассет: картинка или музыка, зашитая прямо в значение как
 * `data:image/webp;base64,...`. В JSON выпуска такие значения запрещены — именно
 * они превращают файл выпуска из сотни килобайт в сто мегабайт. Файлы лежат в
 * корневой папке `assets/`, а в JSON едет только относительный путь.
 */
export function isInlineAsset(value: string | null | undefined) {
  return /^data:/i.test((value ?? "").trim())
}

/** Временная ссылка текущей сессии: `blob:...` — после перезапуска уже мертва. */
export function isSessionUrl(value: string | null | undefined) {
  return /^blob:/i.test((value ?? "").trim())
}

/**
 * Системный путь в значении ассета: буква диска (`C:\...`), `file://`, домашняя
 * папка macOS/Linux (`/Users/...`, `/home/...`) или обратные слеши. Такое
 * значение в JSON выпуска недопустимо: на другой машине его просто не открыть.
 * Всё, что содержит папку `assets/`, `toAssetUrl` заранее приводит к `/assets/...`.
 */
export function isSystemPath(value: string | null | undefined) {
  const path = (value ?? "").trim()
  if (!path) return false
  return (
    /^[a-z]:[\\/]/i.test(path) ||
    /^file:\/\//i.test(path) ||
    /^\/(?:users|home|volumes|mnt|media|private)\//i.test(path) ||
    path.includes("\\")
  )
}

/** MIME → расширение файла: обратный маппинг к таблице ассетов в vite.config.ts. */
const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
}

/**
 * Расширение для файла, который выгружаем из data-URL:
 * `data:image/webp;base64,...` → `webp`. Незнакомый MIME — `bin`, чтобы имя
 * файла всё равно осталось безопасным.
 */
export function extensionFromDataUrl(dataUrl: string) {
  const mime = /^data:([^;,]+)[;,]/.exec(dataUrl.trim())?.[1]?.toLowerCase()
  return (mime ? EXTENSION_BY_MIME[mime] : undefined) ?? "bin"
}

/**
 * Читаемая часть имени файла: строчные буквы, цифры и дефисы. Пробелы, кавычки,
 * точки и разделители путей становятся дефисами, поэтому имя одинаково годится
 * для Windows, macOS и URL — `/assets/scenes/порт-в-тумане.jpg`.
 */
export function slugifyAssetName(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^0-9a-zа-яё]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "")
}

/**
 * Имя файла ассета выпуска: `id` держит уникальность между одноимёнными сценами,
 * слаг из названия — читаемость. Точка в имени ровно одна и только перед
 * расширением, поэтому «../» в имени появиться не может.
 */
export function assetFileName(
  id: string,
  label: string,
  extension: string
) {
  const idPart = slugifyAssetName(id)
  const labelPart = slugifyAssetName(label)
  const base = labelPart && labelPart !== idPart ? `${idPart}-${labelPart}` : idPart
  return `${base || "asset"}.${extension}`
}

/**
 * Копия файла выпуска, где все пути к ассетам приведены к виду `/assets/...`
 * с прямыми слешами (без букв диска и домашних папок). Стор не меняется —
 * маппинг возвращает новые массивы и объекты.
 *
 * Картинка токена лежит в самом персонаже (avatarSrc/fullBodyPngSrc), поэтому
 * отдельные пути у mapTokens не нужны; sceneNotes — текст, его не трогаем.
 * Звуковой эффект саундпада (`soundpad[].src`) нормализуется как обычный ассет:
 * в файле выпуска он тоже лежит в папке `assets/`.
 */
export function normalizeEpisodeAssets(file: EpisodeFile): EpisodeFile {
  const backgrounds = Array.isArray(file.backgrounds) ? file.backgrounds : []
  const characters = Array.isArray(file.characters) ? file.characters : []
  const tracks = Array.isArray(file.tracks) ? file.tracks : []
  const soundpad = Array.isArray(file.soundpad) ? file.soundpad : []
  return {
    ...file,
    backgrounds: backgrounds.map((item) => ({
      ...item,
      src: toAssetUrl(item.src),
    })),
    characters: characters.map((item) => ({
      ...item,
      avatarSrc: toAssetUrl(item.avatarSrc),
      fullBodyPngSrc: toAssetUrl(item.fullBodyPngSrc),
    })),
    tracks: tracks.map((item) => ({
      ...item,
      audioSrc: toAssetUrl(item.audioSrc),
      coverSrc: toAssetUrl(item.coverSrc),
    })),
    soundpad: soundpad.map((item) => ({
      ...item,
      src: toAssetUrl(item.src),
    })),
  }
}
