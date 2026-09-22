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
 * Копия файла выпуска, где все пути к ассетам приведены к виду `/assets/...`
 * с прямыми слешами (без букв диска и домашних папок). Стор не меняется —
 * маппинг возвращает новые массивы и объекты.
 *
 * Картинка токена лежит в самом персонаже (avatarSrc/fullBodyPngSrc), поэтому
 * отдельные пути у mapTokens не нужны; sceneNotes — текст, его не трогаем.
 */
export function normalizeEpisodeAssets(file: EpisodeFile): EpisodeFile {
  const backgrounds = Array.isArray(file.backgrounds) ? file.backgrounds : []
  const characters = Array.isArray(file.characters) ? file.characters : []
  const tracks = Array.isArray(file.tracks) ? file.tracks : []
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
  }
}
