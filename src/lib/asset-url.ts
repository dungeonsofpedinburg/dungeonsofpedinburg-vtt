import type { EpisodeFile, GroupTracks } from "@/data/types"

/** Префикс URL, по которому раздаются ассеты выпуска (корневая папка ./assets). */
export const ASSETS_URL_PREFIX = "/assets/"

/**
 * Постоянное хранилище выпусков внутри корня assets/ (`/assets/episodes/...`):
 * папку выпуска с `episode.json`, `scenes/`, `characters/` и `music/` кладут
 * вручную — она переживает очистку кэша и её нельзя удалять.
 */
export const ASSETS_EPISODES_PREFIX = `${ASSETS_URL_PREFIX}episodes/`

/**
 * Временный кэш приложения (`/assets/cache/...`): сюда кладёт файлы эндпоинт
 * выгрузки (`POST /__pedinburg/assets`, Base64, видео). Папку можно стереть
 * целиком — приложение создаст её заново при следующей загрузке.
 */
export const ASSETS_CACHE_PREFIX = `${ASSETS_URL_PREFIX}cache/`

/**
 * Папки медиабиблиотеки внутри корня assets/: сцены, персонажи, предметы,
 * музыка, саундпад и видео. Тот же список разрешает сервер выгрузки
 * (см. `ASSET_CACHE_FOLDERS` в `vite.config.ts`) — путь к файлу начинается
 * с одной из этих папок.
 */
export const ASSET_MEDIA_FOLDERS = [
  "scenes",
  "characters",
  "items",
  "music",
  "soundpad",
  "videos",
] as const

/** Медиапапка, записанная без корня: `items/sword.png`, `scenes/forest.jpg`. */
const MEDIA_FOLDER_PREFIX = new RegExp(`^(?:${ASSET_MEDIA_FOLDERS.join("|")})/`, "i")

/**
 * Папка внутри корня assets/, записанная без самого слова `assets`:
 * `episodes/ep-01/scenes/forest.jpg`. Так пишут пути вручную собранные выпуски.
 */
const ROOT_RELATIVE_FOLDERS = /^(?:episodes|cache)\//i

/** Имя зоны с ассетами конкретного выпуска внутри корня assets/. */
export const EPISODE_ASSETS_FOLDER = "episodes"

/**
 * Slug выпуска, если из названия не осталось ни одной безопасной буквы:
 * папка всё равно нужна, а «пустого» имени у файловой системы нет.
 */
export const FALLBACK_EPISODE_SLUG = "episode-1"

/** Максимальная длина slug: хватает для читаемого имени и не режет путь. */
const EPISODE_SLUG_MAX_LENGTH = 48

/**
 * Транслитерация кириллицы для slug: «Порт в тумане» → `port-v-tumane`.
 * Без неё русские названия вычищались бы целиком и все выпуски получали бы
 * одинаковый запасной slug.
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  і: "i",
  ї: "i",
  є: "e",
  ґ: "g",
  ў: "u",
}

/**
 * Идентификатор папки выпуска: только строчные латинские буквы, цифры и дефисы —
 * имя одинаково годится для Windows, macOS, ZIP-архива и URL. Кириллица
 * транслитерируется, остальное вычищается, длина ограничена 48 символами,
 * пустое название даёт `episode-1`. Функция идемпотентна: уже готовый slug
 * повторный вызов не меняет — поэтому её безопасно применять к полю из файла.
 */
export function generateEpisodeSlug(title: string | null | undefined) {
  const transliterated = (title ?? "")
    .normalize("NFC")
    .toLowerCase()
    .split("")
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join("")
  const slug = transliterated
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, EPISODE_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "")
  return slug || FALLBACK_EPISODE_SLUG
}

/**
 * Папка выпуска внутри корня assets/: `episodes/<slug>/<folder>`. Именно этот
 * путь уходит на сервер выгрузки, поэтому и картинки экспорта, и видео-сцены
 * ложатся рядом — в папку своего выпуска, а не в общий кэш.
 */
export function episodeAssetFolder(slug: string, folder: string) {
  return `${EPISODE_ASSETS_FOLDER}/${generateEpisodeSlug(slug)}/${folder}`
}

/**
 * Веб-путь ассета выпуска: `/assets/episodes/<slug>/<folder>/<файл>`. Тем же
 * видом путь ложится в JSON, поэтому формула одна на весь проект.
 */
export function buildEpisodeAssetUrl(
  slug: string,
  folder: string,
  filename: string
) {
  return `${ASSETS_URL_PREFIX}${episodeAssetFolder(slug, folder)}/${filename}`
}

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
 *   "episodes/ep-01/scenes/forest.jpg" → "/assets/episodes/ep-01/scenes/forest.jpg"
 *   "items/sword.png" → "/assets/cache/items/sword.png"
 *
 * Значения без папки assets (например `/placeholders/*.svg` или data-URL)
 * возвращаются как есть: подставить им префикс нельзя.
 *
 * Заодно имена приводятся к канонической форме NFC: macOS хранит кириллицу в NFD
 * («й» = «и» + диакритика), а в JSON и URL должен лежать один и тот же вид пути —
 * сервер найдёт файл на диске и по NFC, и по NFD (см. `vite.config.ts`).
 */
export function toAssetUrl(value: string | null | undefined): string {
  const path = (value ?? "").trim()
  if (!path || KEEP_AS_IS.test(path)) return path
  // file:///D:/proj/assets/x.png → D:/proj/assets/x.png, затем слеши \\ → /.
  const unified = path
    .replace(/^file:\/{2,}/i, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .normalize("NFC")
  if (unified.startsWith("assets/")) {
    return `${ASSETS_URL_PREFIX}${unified.slice("assets/".length)}`
  }
  // Путь от корня assets/ без самого слова `assets`: `episodes/ep-01/scene.png`,
  // `cache/music/theme.mp3` — обе зоны валидны, префикс просто дописываем.
  if (ROOT_RELATIVE_FOLDERS.test(unified)) {
    return `${ASSETS_URL_PREFIX}${unified}`
  }
  // Медиапапка без корня (`items/sword.png`, `characters/алхимик.png`) — так
  // писали пути до разделения на зоны: файлы выгрузки лежат в кэше, поэтому
  // дописываем именно его. Постоянные выпуски указывают путь целиком:
  // `/assets/episodes/ep-01/items/sword.png`.
  if (MEDIA_FOLDER_PREFIX.test(unified)) {
    return `${ASSETS_URL_PREFIX}cache/${unified}`
  }
  // Жадный `.*` — берём последнее вхождение `/assets/`: путь с вложенной папкой
  // assets/assets/x.png тоже даёт корректный URL от корня.
  return unified.replace(/^.*\/assets\//i, ASSETS_URL_PREFIX)
}

/**
 * Путь лежит в медиатеке — внутри корня assets/: в постоянных выпусках
 * (`episodes/`), в кэше (`cache/`) или в одной из папок библиотеки (`scenes/`,
 * `characters/`, `items/`, `music/`, `soundpad/`, `videos/`). Значения вне корня
 * (CDN, data-URL, чужой системный путь) возвращают `false`.
 */
export function isAssetLibraryPath(value: string | null | undefined) {
  const path = (value ?? "").trim().replace(/^\.\//, "")
  if (!path) return false
  if (path.startsWith(ASSETS_URL_PREFIX)) return true
  return ROOT_RELATIVE_FOLDERS.test(path) || MEDIA_FOLDER_PREFIX.test(path)
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
 * Настройки появления (персонажа или сцены): путь к звуку приводим к
 * `/assets/...`, остальные поля оставляем как есть. Поле `soundSrc` не
 * добавляем, если его не было: отсутствие — это «унаследовать», а пустая
 * строка — «без звука».
 */
function normalizeAppearance<T extends { soundSrc?: string }>(
  appearance: T | undefined
): T | undefined {
  if (!appearance || appearance.soundSrc === undefined) return appearance
  return { ...appearance, soundSrc: toAssetUrl(appearance.soundSrc) }
}

/**
 * Копия файла выпуска, где все пути к ассетам приведены к виду `/assets/...`
 * с прямыми слешами (без букв диска и домашних папок) и к форме NFC. Стор не
 * меняется — маппинг возвращает новые массивы и объекты.
 *
 * Картинка токена лежит в самом персонаже (avatarSrc/fullBodyPngSrc), поэтому
 * отдельные пути у mapTokens не нужны; заметки актов (`groupNotes`) — текст, его
 * не трогаем.
 * Ассеты выпуска (`backgrounds[].src`, картинки персонажей, музыка, саундпад и
 * треки актов) живут в папке выпуска `assets/episodes/<slug>/`: там же
 * оказываются файлы, выгруженные из интерфейса, поэтому пути старых черновиков с
 * `/assets/cache/...` сервер тоже продолжает находить.
 */
export function normalizeEpisodeAssets(file: EpisodeFile): EpisodeFile {
  const backgrounds = Array.isArray(file.backgrounds) ? file.backgrounds : []
  const characters = Array.isArray(file.characters) ? file.characters : []
  const tracks = Array.isArray(file.tracks) ? file.tracks : []
  const soundpad = Array.isArray(file.soundpad) ? file.soundpad : []
  // Треки групп: путь к файлу — такой же ассет, как музыка выпуска.
  const groupTracks: GroupTracks = {}
  Object.entries(file.groupTracks ?? {}).forEach(([group, track]) => {
    if (!track) return
    groupTracks[group] = { ...track, src: toAssetUrl(track.src) }
  })
  return {
    ...file,
    backgrounds: backgrounds.map((item) => ({
      ...item,
      src: toAssetUrl(item.src),
      // Звук появления сцены — такой же путь выпуска, как её кадры.
      appearance: normalizeAppearance(item.appearance),
      // Картинки состояний сцены — такие же пути выпуска, как базовый кадр.
      states: (item.states ?? []).map((state) => ({
        ...state,
        src: toAssetUrl(state.src),
        appearance: normalizeAppearance(state.appearance),
      })),
    })),
    characters: characters.map((item) => ({
      ...item,
      avatarSrc: toAssetUrl(item.avatarSrc),
      fullBodyPngSrc: toAssetUrl(item.fullBodyPngSrc),
      // Звук появления — такой же путь выпуска, как картинки.
      appearance: normalizeAppearance(item.appearance),
      // Картинки вариантов внешнего вида — такие же пути выпуска.
      states: (item.states ?? []).map((state) => ({
        ...state,
        avatarSrc: toAssetUrl(state.avatarSrc),
        fullBodyPngSrc: toAssetUrl(state.fullBodyPngSrc),
        appearance: normalizeAppearance(state.appearance),
      })),
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
    groupTracks,
  }
}
