import {
  assetFileName,
  extensionFromDataUrl,
  isInlineAsset,
  isSessionUrl,
  isSystemPath,
  toAssetUrl,
} from "@/lib/asset-url"
import { saveAssetToLibrary } from "@/lib/asset-upload"
import type { EpisodeFile } from "@/data/types"

/**
 * Экспорт выпуска: файл `episode.json` везёт ТОЛЬКО текстовые данные — разметку
 * заметок, координаты токенов и относительные пути к ассетам. Картинки и музыка
 * живут отдельными файлами в корневой папке `assets/`, поэтому JSON весит
 * сотню килобайт вместо ста мегабайт и одинаково читается на Windows и macOS.
 *
 * Здесь же лежит страховка: Base64 (`data:...`) и системные пути (`C:\...`,
 * `/Users/...`) в файл выпуска не попадают ни при каких условиях.
 */

/** Предел веса JSON: разметка выпуска — это килобайты, а не мегабайты. */
export const EPISODE_JSON_LIMIT_BYTES = 500 * 1024

/** Папки ассетов выпуска внутри корневой `assets/`: их и передают вместе с JSON. */
export const ASSET_FOLDERS = {
  scenes: "scenes",
  characters: "characters",
  music: "music",
  soundpad: "soundpad",
} as const

/** Почему значение ассета не попало в файл выпуска. */
export type AssetIssueReason = "inline" | "system-path" | "session-url"

/** Ассет, который пришлось выбросить из экспорта (в файл он не попадёт). */
export type AssetIssue = {
  /** Поле выпуска: `backgrounds[2].src` */
  field: string
  reason: AssetIssueReason
  /** Начало значения — по нему Мастер поймёт, о каком файле речь */
  sample: string
}

/** Короткое описание значения для отчёта и лога. */
function sampleOf(value: string) {
  const text = value.trim()
  return text.length > 48 ? `${text.slice(0, 48)}…` : text
}

/** Все «путевые» поля выпуска: единственное место, где перечислены ассеты. */
export function episodeAssetFields(file: EpisodeFile) {
  return [
    ...file.backgrounds.map((item, index) => ({
      field: `backgrounds[${index}].src`,
      value: item.src,
    })),
    ...file.characters.flatMap((item, index) => [
      { field: `characters[${index}].avatarSrc`, value: item.avatarSrc },
      { field: `characters[${index}].fullBodyPngSrc`, value: item.fullBodyPngSrc },
    ]),
    ...file.tracks.flatMap((item, index) => [
      { field: `tracks[${index}].audioSrc`, value: item.audioSrc },
      { field: `tracks[${index}].coverSrc`, value: item.coverSrc },
    ]),
    ...(file.soundpad ?? []).map((item, index) => ({
      field: `soundpad[${index}].src`,
      value: item.src,
    })),
  ]
}

/**
 * Одно значение ассета для файла выпуска. Всё, что указывает на папку `assets/`,
 * приводится к относительному URL (`/assets/scenes/forest.jpg`); инлайн-ассеты
 * (`data:`), временные ссылки (`blob:`) и чужие системные пути отбрасываются —
 * лучше пустое поле, чем Base64 или путь `D:\...`, который не откроется на Маке.
 */
function cleanAssetValue(value: string, field: string, issues: AssetIssue[]) {
  const raw = (value ?? "").trim()
  if (!raw) return ""
  if (isInlineAsset(raw)) {
    issues.push({ field, reason: "inline", sample: sampleOf(raw) })
    return ""
  }
  if (isSessionUrl(raw)) {
    issues.push({ field, reason: "session-url", sample: sampleOf(raw) })
    return ""
  }
  const url = toAssetUrl(raw)
  if (isSystemPath(url)) {
    issues.push({ field, reason: "system-path", sample: sampleOf(raw) })
    return ""
  }
  return url
}

/**
 * Данные выпуска для записи в файл: пути приведены к `/assets/...`, вместо
 * встроенных файлов — пустая строка (отчёт `issues` расскажет, что выброшено).
 */
export function sanitizeEpisodeForExport(file: EpisodeFile) {
  const issues: AssetIssue[] = []
  const clean = (value: string, field: string) =>
    cleanAssetValue(value, field, issues)

  const result: EpisodeFile = {
    ...file,
    backgrounds: file.backgrounds.map((item, index) => ({
      ...item,
      src: clean(item.src, `backgrounds[${index}].src`),
    })),
    characters: file.characters.map((item, index) => ({
      ...item,
      avatarSrc: clean(item.avatarSrc, `characters[${index}].avatarSrc`),
      fullBodyPngSrc: clean(
        item.fullBodyPngSrc,
        `characters[${index}].fullBodyPngSrc`
      ),
    })),
    tracks: file.tracks.map((item, index) => ({
      ...item,
      audioSrc: clean(item.audioSrc, `tracks[${index}].audioSrc`),
      coverSrc: clean(item.coverSrc, `tracks[${index}].coverSrc`),
    })),
    soundpad: (file.soundpad ?? []).map((item, index) => ({
      ...item,
      src: clean(item.src, `soundpad[${index}].src`),
    })),
  }
  return { file: result, issues }
}

/**
 * Первое «грязное» поле выпуска — или `null`, если файл чистый. Ловит и Base64,
 * и системные пути: вызывается перед записью файла как последняя страховка.
 */
export function findInlineAssetLeak(file: EpisodeFile): string | null {
  for (const { field, value } of episodeAssetFields(file)) {
    if (isInlineAsset(value)) return `${field} = ${sampleOf(value)}`
    if (isSessionUrl(value)) return `${field} = ${sampleOf(value)}`
    if (isSystemPath(value)) return `${field} = ${sampleOf(value)}`
  }
  return null
}

/**
 * Проверка перед выгрузкой файла: если Base64 или системный путь всё-таки
 * просочился в данные — это ошибка экспорта, а не «тяжёлый, но рабочий» файл.
 */
export function assertNoInlineAssets(file: EpisodeFile) {
  const leak = findInlineAssetLeak(file)
  if (leak) {
    throw new Error(`В JSON выпуска попал встроенный ассет: ${leak}`)
  }
}

/** Сериализация выпуска: отступ в два пробела, чтобы файл читался глазами. */
export function episodeJsonText(file: EpisodeFile) {
  return JSON.stringify(file, null, 2)
}

/** Вес JSON в байтах: считаем байты UTF-8, а не длину строки. */
export function episodeJsonBytes(json: string) {
  return new TextEncoder().encode(json).length
}

/** Размер файла для отчёта: «412 КБ». */
export function formatAssetSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`
  const kilobytes = bytes / 1024
  if (kilobytes < 1024) {
    return `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)} КБ`
  }
  return `${(kilobytes / 1024).toFixed(1)} МБ`
}

/** Сводка по выброшенным ассетам — её показывает консоль и диалог Мастера. */
export function describeAssetIssues(issues: AssetIssue[]) {
  const reasons: Record<AssetIssueReason, string> = {
    inline: "встроенный файл (Base64)",
    "system-path": "системный путь",
    "session-url": "временная ссылка сессии",
  }
  return issues
    .map((issue) => `${issue.field}: ${reasons[issue.reason]} — ${issue.sample}`)
    .join("; ")
}

/**
 * Выгружает встроенные ассеты в корневую папку `assets/` и заменяет data-URL на
 * относительный путь `/assets/...`. Из браузера записать файл на диск нельзя,
 * поэтому файлы кладёт локальный сервер Vite/Express — тот же, что раздаёт
 * `assets/` по URL (см. `@/lib/asset-upload`). Относительные значения не трогаем.
 *
 * Отчёт возвращается отдельно: `saved` — что легло в `assets/`, `issues` — что
 * пришлось выбросить (тогда в JSON останется пустая строка, но не Base64).
 */
export async function persistEpisodeAssets(file: EpisodeFile) {
  const saved: string[] = []
  const issues: AssetIssue[] = []

  const persist = async (
    field: string,
    folder: string,
    id: string,
    label: string,
    value: string
  ) => {
    if (!isInlineAsset(value)) return value
    const fileName = assetFileName(id, label, extensionFromDataUrl(value))
    const upload = await saveAssetToLibrary(folder, fileName, value)
    if (!upload.ok) {
      // Сервер отказал (слишком большой файл, недоступен) — ассет в JSON не
      // попадёт, поле останется пустым, а причина уйдёт в отчёт `issues`.
      issues.push({ field, reason: "inline", sample: sampleOf(value) })
      return ""
    }
    saved.push(upload.url)
    return upload.url
  }

  const backgrounds = await Promise.all(
    file.backgrounds.map(async (item, index) => ({
      ...item,
      src: await persist(
        `backgrounds[${index}].src`,
        ASSET_FOLDERS.scenes,
        item.id,
        item.title,
        item.src
      ),
    }))
  )

  const characters = await Promise.all(
    file.characters.map(async (item, index) => ({
      ...item,
      avatarSrc: await persist(
        `characters[${index}].avatarSrc`,
        ASSET_FOLDERS.characters,
        item.id,
        `${item.name} токен`,
        item.avatarSrc
      ),
      fullBodyPngSrc: await persist(
        `characters[${index}].fullBodyPngSrc`,
        ASSET_FOLDERS.characters,
        item.id,
        item.name,
        item.fullBodyPngSrc
      ),
    }))
  )

  const tracks = await Promise.all(
    file.tracks.map(async (item, index) => ({
      ...item,
      audioSrc: await persist(
        `tracks[${index}].audioSrc`,
        ASSET_FOLDERS.music,
        item.id,
        item.title,
        item.audioSrc
      ),
      coverSrc: await persist(
        `tracks[${index}].coverSrc`,
        ASSET_FOLDERS.music,
        item.id,
        `${item.title} обложка`,
        item.coverSrc
      ),
    }))
  )

  const soundpadSlots = await Promise.all(
    (file.soundpad ?? []).map(async (item, index) => ({
      ...item,
      src: await persist(
        `soundpad[${index}].src`,
        ASSET_FOLDERS.soundpad,
        item.id,
        item.title,
        item.src
      ),
    }))
  )

  const persisted: EpisodeFile = {
    ...file,
    backgrounds,
    characters,
    tracks,
    soundpad: soundpadSlots,
  }
  return { file: persisted, saved, issues }
}

