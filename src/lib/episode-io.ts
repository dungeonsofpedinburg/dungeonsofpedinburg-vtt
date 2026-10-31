import { GRID_COLUMNS, GRID_ROWS } from "@/data/content"
import { clampIndex, useEpisodeStore } from "@/store/useEpisodeStore"
import {
  generateEpisodeSlug,
  normalizeEpisodeAssets,
} from "@/lib/asset-url"
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
  BackgroundAppearance,
  BackgroundState,
  Character,
  CharacterAppearance,
  CharacterState,
  EpisodeFile,
  GroupTracks,
  MapToken,
  SceneNotes,
  SoundpadSlot,
  TokenCategory,
  Track,
} from "@/data/types"

const TOKEN_CATEGORIES = ["hero", "npc", "enemy", "item"]

/**
 * Снимок выпуска «как есть»: состояние стора плюс приведение путей к
 * относительным URL от корня assets/ (`/assets/episodes/<slug>/scenes/...`).
 * Встроенные ассеты (data-URL) на этом шаге ещё остаются: их выгружает в папку
 * выпуска экспорт — см. `exportEpisodeFile`.
 */
export function buildEpisodeSnapshot(): EpisodeFile {
  const state = useEpisodeStore.getState()
  return normalizeEpisodeAssets({
    exportedAt: new Date().toISOString(),
    episodeSlug: state.episodeSlug,
    campaign: state.episodeTitle,
    backgrounds: state.backgrounds,
    sceneGroups: state.sceneGroups,
    characters: state.characters,
    tracks: state.tracks,
    soundpad: state.soundpad,
    mapTokens: state.mapTokens,
    groupNotes: state.groupNotes,
    groupTracks: state.groupTracks,
    activeBackgroundId: state.activeBackgroundId,
    activeCharacterIds: state.activeCharacterIds,
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
  /** Имя файла выпуска: совпадает со slug папки ассетов — `port-v-tumane.json` */
  fileName: string
  /** Папка выпуска внутри `assets/`: `episodes/port-v-tumane` */
  episodeSlug: string
  /** Готовый JSON выпуска */
  json: string
  bytes: number
  /** Размер в человекочитаемом виде: «412 КБ» */
  size: string
  /** Ассеты, выгруженные в папку выпуска при этом экспорте */
  savedAssets: string[]
  /** Поля, которые остались без ассета — с причиной (Base64, чужой путь) */
  issues: AssetIssue[]
}

/**
 * Полный экспорт выпуска по стандарту передачи: сначала встроенные ассеты ложатся
 * файлами в папку выпуска `assets/episodes/<slug>/`, затем собирается сам JSON —
 * только относительные пути. Папку выпуска архивируют целиком
 * (`<slug>.zip`) и передают Мастеру вместе с `<slug>.json`: он распаковывает её в
 * `assets/episodes/`, и пути `/assets/episodes/<slug>/...` работают сразу.
 */
export async function exportEpisodeFile(): Promise<EpisodeExportReport> {
  const snapshot = buildEpisodeSnapshot()
  const episodeSlug = generateEpisodeSlug(snapshot.episodeSlug ?? snapshot.campaign)
  const {
    file: persisted,
    saved,
    issues: uploadIssues,
  } = await persistEpisodeAssets(snapshot, episodeSlug)
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
    fileName: episodeFileName(episodeSlug),
    episodeSlug,
    json,
    bytes,
    size: formatAssetSize(bytes),
    savedAssets: saved,
    issues,
  }
}

/**
 * Экспорт выпуска по кнопке: собирает файл (см. `exportEpisodeFile`) и отдаёт его
 * браузеру на скачивание. Папку выпуска Мастер передаёт вместе с JSON — она
 * лежит в `assets/episodes/`, поэтому относительные пути в файле уже рабочие.
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
  console.info(
    `[выпуск] ${report.fileName} — ${report.size} (папка assets/episodes/${report.episodeSlug}/)`
  )
  return report
}

/**
 * Имя JSON-файла выпуска: это тот же slug, что у папки ассетов, поэтому архив
 * `<slug>.zip` и файл `<slug>.json` всегда лежат рядом и не путаются. Slug —
 * уже безопасная строка, но приводим её к канону: пустое значение даёт
 * `episode-1.json`.
 */
export function episodeFileName(episodeSlug: string) {
  return `${generateEpisodeSlug(episodeSlug)}.json`
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
  // У пустого выпуска карт нет: токены тогда просто не создаются.
  const fallbackMapId =
    backgrounds.find((item) => item.isBattlemap)?.id ?? backgrounds[0]?.id ?? ""
  const sceneGroups = parseSceneGroups(parsed.sceneGroups, backgrounds)

  return {
    backgrounds,
    sceneGroups,
    characters: parseCharacters(parsed.characters),
    tracks: parseTracks(parsed.tracks),
    soundpad: parseSoundpad(parsed.soundpad),
    mapTokens: parseTokens(parsed.mapTokens, fallbackMapId),
    // Заметки — по группам сцен; файлы старого формата хранят их по сценам.
    groupNotes: parseGroupNotes(
      parsed.groupNotes,
      parsed.sceneNotes,
      backgrounds,
      sceneGroups
    ),
    groupTracks: parseGroupTracks(parsed.groupTracks),
    campaign: asOptionalString(parsed.campaign) ?? undefined,
    // Слаг папки выпуска: в старых файлах поля нет — стор выведет его из названия.
    episodeSlug: asOptionalString(parsed.episodeSlug) ?? undefined,
    // Сцены в эфире может не быть: пустой выпуск — это нормальное состояние.
    activeBackgroundId: asOptionalString(parsed.activeBackgroundId),
    activeCharacterIds: parseActiveCharacterIds(parsed),
    activeMapId: asOptionalString(parsed.activeMapId),
  }
}

/**
 * Кто стоял на сцене. Новый формат хранит массив (до четырёх фигур), старый —
 * одно поле `activeCharacterId`; его читаем как сцену из одного персонажа.
 */
function parseActiveCharacterIds(parsed: Record<string, unknown>) {
  const list = parsed.activeCharacterIds
  if (Array.isArray(list)) {
    return list.filter((item): item is string => typeof item === "string")
  }
  const single = asOptionalString(parsed.activeCharacterId)
  return single ? [single] : []
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

/**
 * Звук появления сцены из файла выпуска. Как у персонажей: чужие значения
 * отбрасываем, пустой результат означает «полей нет».
 */
function parseBackgroundAppearance(
  value: unknown
): BackgroundAppearance | undefined {
  if (!isRecord(value)) return undefined
  const appearance: BackgroundAppearance = {}
  if (typeof value.soundSrc === "string" && value.soundSrc.trim()) {
    appearance.soundSrc = value.soundSrc
  }
  if (value.soundMode === "once" || value.soundMode === "always") {
    appearance.soundMode = value.soundMode
  }
  return Object.keys(appearance).length > 0 ? appearance : undefined
}

function parseBackgrounds(value: unknown): Background[] {
  if (!Array.isArray(value)) {
    throw new Error("В файле нет массива фонов")
  }
  // Пустой список сцен — тоже выпуск (например только сохранённый шаблон):
  // раньше это считалось ошибкой, но чистый старт начинается именно так.
  const items = value.filter(isRecord).slice(0, 400)
  return items.map((item, index) => {
    const background: Background = {
      id: asString(item.id) || `bg-import-${index}`,
      title: asString(item.title) || `Сцена ${index + 1}`,
      src: asString(item.src),
      actGroup: asActGroup(item.actGroup),
      isBattlemap: item.isBattlemap === true,
      // Зацикливание видео-сцены: в файлах старого формата поля нет — значит «да».
      isLoop: item.isLoop !== false,
    }
    // Состояния сцены: у файлов старого формата их не было — тогда «Обычным»
    // считается сама сцена (см. `getBackgroundActiveState`).
    const states = parseBackgroundStates(item.states)
    if (states.length > 0) background.states = states
    const activeStateId = asOptionalString(item.activeStateId)
    if (activeStateId) background.activeStateId = activeStateId
    const appearance = parseBackgroundAppearance(item.appearance)
    if (appearance) background.appearance = appearance
    return background
  })
}

/** Состояния сцены: их кадры — такие же ассеты выпуска, как базовый. */
function parseBackgroundStates(value: unknown): BackgroundState[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .slice(0, 24)
    .map((item, index) => {
      const state: BackgroundState = {
        id: asString(item.id) || `state-${index}`,
        name: asString(item.name) || `Состояние ${index + 1}`,
        src: asString(item.src),
      }
      // Флаг карты местности у состояния необязательный: нет — значит как у сцены.
      if (typeof item.isBattlemap === "boolean") {
        state.isBattlemap = item.isBattlemap
      }
      // Звук появления состояния: нет полей — наследуется от сцены.
      const appearance = parseBackgroundAppearance(item.appearance)
      if (appearance) state.appearance = appearance
      return state
    })
}

/**
 * Звук и эффект появления из файла выпуска. Неизвестные значения отбрасываем:
 * в JSON могли оказаться чужие строки, а нам нужны только наши два режима и два
 * эффекта. Пустой результат означает «полей нет».
 */
function parseAppearance(value: unknown): CharacterAppearance | undefined {
  if (!isRecord(value)) return undefined
  const appearance: CharacterAppearance = {}
  if (typeof value.soundSrc === "string" && value.soundSrc.trim()) {
    appearance.soundSrc = value.soundSrc
  }
  if (value.soundMode === "once" || value.soundMode === "always") {
    appearance.soundMode = value.soundMode
  }
  if (value.effect === "slide" || value.effect === "sharp") {
    appearance.effect = value.effect
  }
  return Object.keys(appearance).length > 0 ? appearance : undefined
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
      // Варианты внешнего вида: у файлов старого формата их не было — тогда
      // «Обычным» считается сам персонаж (см. `getCharacterActiveState`).
      const states = parseCharacterStates(item.states)
      if (states.length > 0) character.states = states
      const activeStateId = asOptionalString(item.activeStateId)
      if (activeStateId) character.activeStateId = activeStateId
      const appearance = parseAppearance(item.appearance)
      if (appearance) character.appearance = appearance
      if (isRecord(item.hp)) {
        character.hp = {
          current: asNumber(item.hp.current),
          max: asNumber(item.hp.max),
        }
      }
      return character
    })
}

/** Варианты внешнего вида персонажа: их картинки — такие же ассеты выпуска. */
function parseCharacterStates(value: unknown): CharacterState[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .slice(0, 24)
    .map((item, index) => {
      const state: CharacterState = {
        id: asString(item.id) || `state-${index}`,
        name: asString(item.name) || `Состояние ${index + 1}`,
        avatarSrc: asString(item.avatarSrc),
        fullBodyPngSrc: asString(item.fullBodyPngSrc),
      }
      // Свои звук и эффект состояния: нет полей — значит наследуются.
      const appearance = parseAppearance(item.appearance)
      if (appearance) state.appearance = appearance
      return state
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

/**
 * Заметки по группам сцен. Новый формат пишет их в `groupNotes` (ключ — имя
 * группы). Файлы старого формата хранят заметки по сценам (`sceneNotes`, ключ —
 * id сцены): переносим их на акт сцены — по одной заметке на группу, первая
 * непустая побеждает.
 */
function parseGroupNotes(
  value: unknown,
  legacyValue: unknown,
  backgrounds: Background[],
  sceneGroups: string[]
): SceneNotes {
  if (isRecord(value)) {
    const notes: SceneNotes = {}
    Object.entries(value).forEach(([key, note]) => {
      const name = key.trim()
      if (name && typeof note === "string") notes[name] = note
    })
    return notes
  }
  if (!isRecord(legacyValue)) return {}

  const groupBySceneId = new Map(
    backgrounds.map((background) => [background.id, background.actGroup])
  )
  const notes: SceneNotes = {}
  Object.entries(legacyValue).forEach(([key, note]) => {
    if (typeof note !== "string" || !note.trim()) return
    // Ключ старого файла — id сцены; если сцена пропала, ключ может быть уже
    // именем группы (так выглядят файлы промежуточных версий).
    const group = groupBySceneId.get(key) ?? (sceneGroups.includes(key) ? key : "")
    if (!group) return
    if (!notes[group]?.trim()) notes[group] = note
  })
  return notes
}

/** Треки, привязанные к группам сцен: чужие и пустые записи отбрасываем. */
function parseGroupTracks(value: unknown): GroupTracks {
  if (!isRecord(value)) return {}
  const tracks: GroupTracks = {}
  Object.entries(value).forEach(([key, track]) => {
    const name = key.trim()
    if (!name || !isRecord(track)) return
    const src = asString(track.src)
    if (!src) return
    tracks[name] = {
      id: asString(track.id) || `group-track-${name}`,
      title: asString(track.title) || name,
      src,
    }
  })
  return tracks
}
