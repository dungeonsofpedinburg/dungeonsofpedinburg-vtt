import { GRID_COLUMNS, GRID_ROWS } from "@/data/content"
import { clampIndex, useEpisodeStore } from "@/store/useEpisodeStore"
import { normalizeEpisodeAssets } from "@/lib/asset-url"
import { initialsFromName } from "@/lib/character"
import { normalizeSoundpadIcon, soundpadTitleFallback } from "@/lib/soundpad"
import {
  EPISODE_JSON_LIMIT_BYTES,
  assertNoInlineAssets,
  describeAssetIssues,
  episodeJsonBytes,
  episodeJsonText,
  formatAssetSize,
  persistEpisodeAssets,
  sanitizeEpisodeForExport,
  type AssetIssue,
} from "@/lib/export-episode"
import type {
  ActGroup,
  Background,
  Character,
  EpisodeFile,
  MapToken,
  SceneNotes,
  SoundpadSlot,
  TokenCategory,
  Track,
} from "@/data/types"

const TOKEN_CATEGORIES = ["hero", "npc", "enemy", "item"]

/**
 * Снимок выпуска «как есть»: состояние стора плюс приведение путей к
 * относительным URL от корня assets/ (`/assets/scenes/harbor.png`). Встроенные
 * ассеты (data-URL) на этом шаге ещё остаются: их выгружает в папку `assets/`
 * экспорт — см. `exportEpisodeFile`.
 */
export function buildEpisodeSnapshot(): EpisodeFile {
  const state = useEpisodeStore.getState()
  return normalizeEpisodeAssets({
    exportedAt: new Date().toISOString(),
    campaign: state.episodeTitle,
    backgrounds: state.backgrounds,
    sceneGroups: state.sceneGroups,
    characters: state.characters,
    tracks: state.tracks,
    soundpad: state.soundpad,
    mapTokens: state.mapTokens,
    sceneNotes: state.sceneNotes,
    activeBackgroundId: state.activeBackgroundId,
    activeCharacterId: state.activeCharacterId,
    activeMapId: state.activeMapId,
  })
}

/**
 * Снимок выпуска для файла: пути относительные (`/assets/...`), встроенных
 * ассетов нет — в JSON уезжают только текст, разметка заметок, координаты
 * токенов и килобайты путей. Синхронный: если картинки нужно ещё и выгрузить в
 * папку `assets/`, берите `exportEpisodeFile()`.
 */
export function buildEpisodeFile(): EpisodeFile {
  return sanitizeEpisodeForExport(buildEpisodeSnapshot()).file
}

/** Отчёт об экспорте: файл уже собран и готов к сохранению. */
export type EpisodeExportReport = {
  /** Имя файла выпуска: `pedinburg-Порт в тумане.json` */
  fileName: string
  /** Готовый JSON выпуска */
  json: string
  bytes: number
  /** Размер в человекочитаемом виде: «412 КБ» */
  size: string
  /** Ассеты, выгруженные в корневую папку `assets/` при этом экспорте */
  savedAssets: string[]
  /** Поля, которые остались без ассета — с причиной (Base64, чужой путь) */
  issues: AssetIssue[]
}

/**
 * Полный экспорт выпуска по стандарту передачи: сначала встроенные ассеты ложатся
 * файлами в корневую папку `assets/` (её передают вместе с JSON), затем
 * собирается сам JSON — только относительные пути. Папку `assets/` на второй
 * машине кладут в корень проекта, и пути `/assets/...` работают сразу.
 */
export async function exportEpisodeFile(): Promise<EpisodeExportReport> {
  const {
    file: persisted,
    saved,
    issues: uploadIssues,
  } = await persistEpisodeAssets(buildEpisodeSnapshot())
  const { file, issues: sanitizeIssues } = sanitizeEpisodeForExport(persisted)
  // Поля ассетов уже очищены — это последняя страховка перед записью файла.
  assertNoInlineAssets(file)

  const json = episodeJsonText(file)
  const bytes = episodeJsonBytes(json)
  const issues = [...uploadIssues, ...sanitizeIssues]
  if (bytes > EPISODE_JSON_LIMIT_BYTES) {
    console.warn(
      `[выпуск] JSON весит ${formatAssetSize(bytes)} — это больше предела ${formatAssetSize(EPISODE_JSON_LIMIT_BYTES)}`
    )
  }
  if (issues.length > 0) {
    console.warn(`[выпуск] поля без ассета: ${describeAssetIssues(issues)}`)
  }

  return {
    fileName: episodeFileName(file.campaign ?? ""),
    json,
    bytes,
    size: formatAssetSize(bytes),
    savedAssets: saved,
    issues,
  }
}

/**
 * Экспорт выпуска по кнопке: собирает файл (см. `exportEpisodeFile`) и отдаёт его
 * браузеру на скачивание. Папку `assets/` Мастер передаёт вместе с JSON — она
 * лежит в корне проекта, поэтому относительные пути в файле уже рабочие.
 */
export async function downloadEpisodeFile() {
  const report = await exportEpisodeFile()
  const blob = new Blob([report.json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = report.fileName
  link.click()
  URL.revokeObjectURL(url)
  console.info(`[выпуск] ${report.fileName} — ${report.size}`)
  return report
}

/**
 * Имя JSON-файла выпуска: берём название выпуска («Порт в тумане» →
 * `pedinburg-Порт в тумане.json`), а если оно пустое — запасное имя по дате.
 */
export function episodeFileName(title: string) {
  const slug = sanitizeFileNamePart(title)
  if (!slug) {
    return `pedinburg-episode-${new Date().toISOString().slice(0, 10)}.json`
  }
  return `pedinburg-${slug}.json`
}

/** Символы, недопустимые в имени файла Windows. */
const FORBIDDEN_FILE_CHARS = '\\/:*?"<>|'

/** Убирает из названия символы, недопустимые в имени файла. */
function sanitizeFileNamePart(value: string) {
  let clean = ""
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    // Управляющие символы (код < 32) в именах файлов тоже запрещены.
    clean += code < 0x20 || FORBIDDEN_FILE_CHARS.includes(char) ? " " : char
  }
  return clean.replace(/\s+/g, " ").trim().slice(0, 80).replace(/[. ]+$/, "")
}

/**
 * Разбор и валидация JSON выпуска. Бросает Error с понятным текстом,
 * если файл не подходит — диалог показывает сообщение пользователю.
 */
export function parseEpisodeFile(text: string): EpisodeFile {
  let parsed: unknown
  try {
    // BOM от редакторов Windows (Notepad, Excel) JSON.parse не переваривает.
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""))
  } catch {
    throw new Error("Файл не является корректным JSON")
  }
  if (!isRecord(parsed)) {
    throw new Error("Ожидался объект выпуска")
  }

  const backgrounds = parseBackgrounds(parsed.backgrounds)
  // Для файлов старого формата (без mapId у токенов) — первая карта местности.
  const fallbackMapId =
    backgrounds.find((item) => item.isBattlemap)?.id ?? backgrounds[0].id

  return {
    backgrounds,
    sceneGroups: parseSceneGroups(parsed.sceneGroups, backgrounds),
    characters: parseCharacters(parsed.characters),
    tracks: parseTracks(parsed.tracks),
    soundpad: parseSoundpad(parsed.soundpad),
    mapTokens: parseTokens(parsed.mapTokens, fallbackMapId),
    sceneNotes: parseSceneNotes(parsed.sceneNotes),
    campaign: asOptionalString(parsed.campaign) ?? undefined,
    activeBackgroundId:
      asOptionalString(parsed.activeBackgroundId) ?? undefined,
    activeCharacterId: asOptionalString(parsed.activeCharacterId),
    activeMapId: asOptionalString(parsed.activeMapId),
  }
}

/** Чтение выбранного файла выпуска. */
export function readEpisodeFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
    reader.readAsText(file)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function asCategory(value: unknown): TokenCategory {
  const raw = asString(value)
  return TOKEN_CATEGORIES.includes(raw) ? (raw as TokenCategory) : "hero"
}

function asActGroup(value: unknown): ActGroup {
  const raw = asString(value).trim()
  // Разделители теперь свободные: имя из файла сохраняем как есть.
  return raw || "Завязка"
}

/**
 * Разделители сцен из файла. Для выпусков старого формата (без списка
 * разделителей) порядок выводится из самих сцен: как они лежат в файле.
 */
function parseSceneGroups(value: unknown, backgrounds: Background[]) {
  if (!Array.isArray(value)) return uniqueGroupNames(backgrounds)
  const names: string[] = []
  value.forEach((item) => {
    const name = asString(item).trim()
    if (name && !names.includes(name)) names.push(name)
  })
  return names.length > 0 ? names : uniqueGroupNames(backgrounds)
}

/** Имена разделителей в порядке появления сцен — фолбэк для старых файлов. */
function uniqueGroupNames(backgrounds: Background[]) {
  const names: string[] = []
  backgrounds.forEach((background) => {
    const name = background.actGroup.trim()
    if (name && !names.includes(name)) names.push(name)
  })
  return names
}

function parseBackgrounds(value: unknown): Background[] {
  if (!Array.isArray(value)) {
    throw new Error("В файле нет массива фонов")
  }
  const items = value.filter(isRecord).slice(0, 400)
  if (items.length === 0) {
    throw new Error("Список фонов пуст")
  }
  return items.map((item, index) => ({
    id: asString(item.id) || `bg-import-${index}`,
    title: asString(item.title) || `Сцена ${index + 1}`,
    src: asString(item.src),
    actGroup: asActGroup(item.actGroup),
    isBattlemap: item.isBattlemap === true,
    // Зацикливание видео-сцены: в файлах старого формата поля нет — значит «да».
    isLoop: item.isLoop !== false,
  }))
}

function parseCharacters(value: unknown): Character[] {
  if (!Array.isArray(value)) {
    throw new Error("В файле нет массива персонажей")
  }
  return value
    .filter(isRecord)
    .slice(0, 200)
    .map((item, index) => {
      const name = asString(item.name) || `Персонаж ${index + 1}`
      const character: Character = {
        id: asString(item.id) || `char-import-${index}`,
        name,
        role: asString(item.role, "Без роли"),
        initials: asString(item.initials) || initialsFromName(name),
        category: asCategory(item.category),
        avatarSrc: asString(item.avatarSrc),
        fullBodyPngSrc: asString(item.fullBodyPngSrc),
      }
      if (isRecord(item.hp)) {
        character.hp = {
          current: asNumber(item.hp.current),
          max: asNumber(item.hp.max),
        }
      }
      return character
    })
}

function parseTracks(value: unknown): Track[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .slice(0, 200)
    .map((item, index) => ({
      id: asString(item.id) || `track-import-${index}`,
      title: asString(item.title) || `Трек ${index + 1}`,
      artist: asString(item.artist, "Неизвестный исполнитель"),
      duration: asString(item.duration, "0:00"),
      tag: asString(item.tag, "Прочее"),
      audioSrc: asString(item.audioSrc),
      coverSrc: asString(item.coverSrc),
    }))
}

/**
 * Слоты саундпада из файла выпуска. Имя иконки проверяется по разрешённому
 * набору: чужая строка не должна превратиться в «пустую» плитку в панели.
 * Старые файлы поля не знают — тогда саундпад остаётся пустым.
 */
function parseSoundpad(value: unknown): SoundpadSlot[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .slice(0, 48)
    .map((item, index) => ({
      id: asString(item.id) || `sfx-import-${index}`,
      title: asString(item.title) || soundpadTitleFallback(index),
      icon: normalizeSoundpadIcon(item.icon),
      src: asString(item.src),
    }))
}

function parseTokens(value: unknown, fallbackMapId: string): MapToken[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).flatMap((item, index) => {
    const characterId = asString(item.characterId)
    if (!characterId) return []
    return [
      {
        id: asString(item.id) || `token-import-${index}`,
        characterId,
        // Файлы старого формата не знают про карты — кладём токены на первую карту.
        mapId: asString(item.mapId) || fallbackMapId,
        cellX: clampIndex(asNumber(item.cellX), GRID_COLUMNS - 1),
        cellY: clampIndex(asNumber(item.cellY), GRID_ROWS - 1),
      },
    ]
  })
}

function parseSceneNotes(value: unknown): SceneNotes {
  if (!isRecord(value)) return {}
  const notes: SceneNotes = {}
  Object.entries(value).forEach(([key, note]) => {
    if (typeof note === "string") notes[key] = note
  })
  return notes
}
