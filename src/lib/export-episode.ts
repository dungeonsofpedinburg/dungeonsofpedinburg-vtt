import {
  assetFileName,
  episodeAssetFolder,
  extensionFromDataUrl,
  generateEpisodeSlug,
  isAssetLibraryPath,
  isInlineAsset,
  isSessionUrl,
  isSystemPath,
  toAssetUrl,
} from "@/lib/asset-url"
import { saveAssetToLibrary } from "@/lib/asset-upload"
import type {
  CharacterState,
  EpisodeFile,
  GroupTracks,
  TokenCategory,
} from "@/data/types"

/**
 * Экспорт выпуска: файл `episode.json` везёт ТОЛЬКО текстовые данные — разметку
 * заметок, координаты токенов и относительные пути к ассетам. Картинки и музыка
 * живут отдельными файлами в корне `assets/`: постоянные — в `assets/episodes/`
 * (их кладут вручную вместе с JSON), загруженные из интерфейса — в
 * `assets/cache/` (временный кэш, его можно стереть). Поэтому JSON весит сотню
 * килобайт вместо ста мегабайт и одинаково читается на Windows и macOS.
 *
 * Здесь же лежит страховка: Base64 (`data:...`) и системные пути (`C:\...`,
 * `/Users/...`) в файл выпуска не попадают ни при каких условиях.
 */

/** Предел веса JSON: разметка выпуска — это килобайты, а не мегабайты. */
export const EPISODE_JSON_LIMIT_BYTES = 500 * 1024

/**
 * Папки ассетов внутри папки выпуска (`assets/episodes/<slug>/`): сцены,
 * персонажи, предметы, музыка и саундпад. Экспорт выгружает файлы именно сюда,
 * поэтому папку выпуска можно целиком заархивировать и передать Мастеру — все
 * картинки и звуки уже внутри, а в JSON лежат относительные пути
 * `/assets/episodes/<slug>/scenes/forest.jpg`.
 */
export const ASSET_FOLDERS = {
  scenes: "scenes",
  characters: "characters",
  items: "items",
  music: "music",
  soundpad: "soundpad",
} as const

/**
 * Папка картинок персонажа: предметы (4-я колонка панели токенов, `category:
 * "item"`) едут в `items/`, все остальные категории — в `characters/`. Папка
 * выбирается один раз здесь, поэтому и аватар, и фигура предмета лежат рядом.
 */
export function characterAssetFolder(category: TokenCategory) {
  return category === "item" ? ASSET_FOLDERS.items : ASSET_FOLDERS.characters
}

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
    // Звук появления сцены — такой же ассет выпуска, как её кадры.
    ...file.backgrounds.flatMap((item, index) => [
      ...(item.appearance
        ? [
            {
              field: `backgrounds[${index}].appearance.soundSrc`,
              value: item.appearance.soundSrc ?? "",
            },
          ]
        : []),
      // Состояния сцены: «Ночь», «Пожар» — их кадры тоже обязаны уехать в папку.
      ...(item.states ?? []).flatMap((state, stateIndex) => [
        {
          field: `backgrounds[${index}].states[${stateIndex}].src`,
          value: state.src,
        },
        ...(state.appearance
          ? [
              {
                field: `backgrounds[${index}].states[${stateIndex}].appearance.soundSrc`,
                value: state.appearance.soundSrc ?? "",
              },
            ]
          : []),
      ]),
    ]),
    ...file.characters.flatMap((item, index) => [
      { field: `characters[${index}].avatarSrc`, value: item.avatarSrc },
      { field: `characters[${index}].fullBodyPngSrc`, value: item.fullBodyPngSrc },
      // Звук появления — такой же ассет выпуска, как картинки.
      ...(item.appearance
        ? [
            {
              field: `characters[${index}].appearance.soundSrc`,
              value: item.appearance.soundSrc ?? "",
            },
          ]
        : []),
      // Варианты внешнего вида: их картинки тоже обязаны уехать в папку выпуска.
      ...(item.states ?? []).flatMap((state, stateIndex) => [
        {
          field: `characters[${index}].states[${stateIndex}].avatarSrc`,
          value: state.avatarSrc,
        },
        {
          field: `characters[${index}].states[${stateIndex}].fullBodyPngSrc`,
          value: state.fullBodyPngSrc,
        },
        ...(state.appearance
          ? [
              {
                field: `characters[${index}].states[${stateIndex}].appearance.soundSrc`,
                value: state.appearance.soundSrc ?? "",
              },
            ]
          : []),
      ]),
    ]),
    ...file.tracks.flatMap((item, index) => [
      { field: `tracks[${index}].audioSrc`, value: item.audioSrc },
      { field: `tracks[${index}].coverSrc`, value: item.coverSrc },
    ]),
    ...(file.soundpad ?? []).map((item, index) => ({
      field: `soundpad[${index}].src`,
      value: item.src,
    })),
    // Треки групп — такие же ассеты: файл лежит в папке выпуска или в кэше.
    ...Object.entries(file.groupTracks ?? {}).map(([group, track]) => ({
      field: `groupTracks["${group}"].src`,
      value: track?.src ?? "",
    })),
  ]
}

/**
 * Одно значение ассета для файла выпуска. Всё, что указывает на корень `assets/`,
 * приводится к относительному URL (`/assets/episodes/ep-01/scenes/forest.jpg` или
 * `/assets/cache/scenes/forest.jpg`) и нормализуется в NFC; инлайн-ассеты
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
  // Путь внутри корня assets/ — и постоянные выпуски (`episodes/`), и кэш
  // (`cache/`) — валиден как есть: файл отдаёт тот же сервер, что раздаёт статику.
  if (isAssetLibraryPath(url)) return url
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

  /**
   * Настройки появления (персонажа или сцены): путь к звуку чистим как прочие
   * ассеты — встроенный файл (data-URL) в JSON не попадает. Сам объект
   * `appearance` оставляем (даже без `soundSrc`): по его наличию список ассетов
   * знает, что поле вообще было.
   */
  const cleanAppearance = <T extends { soundSrc?: string }>(
    appearance: T | undefined,
    field: string
  ): T | undefined => {
    if (!appearance) return undefined
    const next: T = { ...appearance }
    const soundSrc = clean(appearance.soundSrc ?? "", field)
    if (soundSrc) next.soundSrc = soundSrc
    else delete next.soundSrc
    return next
  }

  const result: EpisodeFile = {
    ...file,
    backgrounds: file.backgrounds.map((item, index) => ({
      ...item,
      src: clean(item.src, `backgrounds[${index}].src`),
      appearance: cleanAppearance(
        item.appearance,
        `backgrounds[${index}].appearance.soundSrc`
      ),
      // Кадры состояний сцены чистим так же, как базовый: встроенные выбрасываем.
      states: (item.states ?? []).map((state, stateIndex) => ({
        ...state,
        src: clean(
          state.src,
          `backgrounds[${index}].states[${stateIndex}].src`
        ),
        appearance: cleanAppearance(
          state.appearance,
          `backgrounds[${index}].states[${stateIndex}].appearance.soundSrc`
        ),
      })),
    })),
    characters: file.characters.map((item, index) => ({
      ...item,
      avatarSrc: clean(item.avatarSrc, `characters[${index}].avatarSrc`),
      fullBodyPngSrc: clean(
        item.fullBodyPngSrc,
        `characters[${index}].fullBodyPngSrc`
      ),
      appearance: cleanAppearance(
        item.appearance,
        `characters[${index}].appearance.soundSrc`
      ),
      // Картинки вариантов внешнего вида чистим так же, как базовые.
      states: (item.states ?? []).map((state, stateIndex) => ({
        ...state,
        appearance: cleanAppearance(
          state.appearance,
          `characters[${index}].states[${stateIndex}].appearance.soundSrc`
        ),
        avatarSrc: clean(
          state.avatarSrc,
          `characters[${index}].states[${stateIndex}].avatarSrc`
        ),
        fullBodyPngSrc: clean(
          state.fullBodyPngSrc,
          `characters[${index}].states[${stateIndex}].fullBodyPngSrc`
        ),
      })),
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
  // Треки групп: путь чистим, пустые записи выбрасываем целиком.
  const groupTracks: GroupTracks = {}
  Object.entries(file.groupTracks ?? {}).forEach(([group, track]) => {
    if (!track) return
    const src = clean(track.src, `groupTracks["${group}"].src`)
    if (!src) return
    groupTracks[group] = { ...track, src }
  })
  // Заметки сцен старого формата в файл не пишем: их место заняли заметки групп.
  const { sceneNotes: _legacyNotes, ...rest } = result

  return { file: { ...rest, groupTracks }, issues }
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
 * Выгружает встроенные ассеты в папку выпуска `assets/episodes/<slug>/` и
 * заменяет data-URL на относительный путь `/assets/episodes/<slug>/...`. Из
 * браузера записать файл на диск нельзя, поэтому файлы кладёт локальный сервер
 * Vite/Express — тот же, что раздаёт `assets/` по URL (см. `@/lib/asset-upload`).
 * Относительные значения не трогаем: файлы постоянных выпусков перезаписи не
 * требуют.
 *
 * Папка выпуска — то, что Продюсер передаёт Мастеру: папку архивируют целиком,
 * поэтому все медиа выпуска оказываются внутри неё, а не в общем кэше.
 *
 * Отчёт возвращается отдельно: `saved` — что легло в папку выпуска, `issues` —
 * что пришлось выбросить (тогда в JSON останется пустая строка, но не Base64).
 */
export async function persistEpisodeAssets(file: EpisodeFile, episodeSlug: string) {
  const saved: string[] = []
  const issues: AssetIssue[] = []
  /** Папка выпуска для медиапапки: `scenes` → `episodes/<slug>/scenes`. */
  const inEpisode = (folder: string) => episodeAssetFolder(episodeSlug, folder)

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
    file.backgrounds.map(async (item, index) => {
      // Состояния сцены («Ночь», «Пожар»): встроенные кадры выгружаем вместе с
      // базовым, иначе на машине Мастера их просто не окажется.
      const states = await Promise.all(
        (item.states ?? []).map(async (state, stateIndex) => ({
          ...state,
          src: await persist(
            `backgrounds[${index}].states[${stateIndex}].src`,
            inEpisode(ASSET_FOLDERS.scenes),
            `${item.id}-${state.id}`,
            `${item.title} ${state.name}`,
            state.src
          ),
          // Звук появления состояния — «короткий звук», кладём рядом со сценой.
          ...(state.appearance
            ? {
                appearance: {
                  ...state.appearance,
                  ...(state.appearance.soundSrc
                    ? {
                        soundSrc: await persist(
                          `backgrounds[${index}].states[${stateIndex}].appearance.soundSrc`,
                          inEpisode(ASSET_FOLDERS.scenes),
                          `${item.id}-${state.id}-appear`,
                          `${item.title} ${state.name} появление`,
                          state.appearance.soundSrc
                        ),
                      }
                    : {}),
                },
              }
            : {}),
        }))
      )
      return {
        ...item,
        states,
        ...(item.appearance
          ? {
              appearance: {
                ...item.appearance,
                ...(item.appearance.soundSrc
                  ? {
                      soundSrc: await persist(
                        `backgrounds[${index}].appearance.soundSrc`,
                        inEpisode(ASSET_FOLDERS.scenes),
                        `${item.id}-appear`,
                        `${item.title} появление`,
                        item.appearance.soundSrc
                      ),
                    }
                  : {}),
              },
            }
          : {}),
        src: await persist(
          `backgrounds[${index}].src`,
          inEpisode(ASSET_FOLDERS.scenes),
          item.id,
          item.title,
          item.src
        ),
      }
    })
  )

  const characters = await Promise.all(
    file.characters.map(async (item, index) => {
      // Предметы (`category: "item"`) лежат в своей папке `items/` — рядом с
      // прочими медиа выпуска, а не среди персонажей.
      const folder = inEpisode(characterAssetFolder(item.category))
      // Варианты внешнего вида: встроенные картинки выгружаем вместе с базовыми,
      // иначе на машине Мастера не окажется «Раненого» и прочих состояний.
      const states: CharacterState[] = []
      for (const [stateIndex, state] of (item.states ?? []).entries()) {
        const [avatarSrc, fullBodyPngSrc] = await Promise.all([
          persist(
            `characters[${index}].states[${stateIndex}].avatarSrc`,
            folder,
            `${item.id}-${state.id}`,
            `${item.name} ${state.name} токен`,
            state.avatarSrc
          ),
          persist(
            `characters[${index}].states[${stateIndex}].fullBodyPngSrc`,
            folder,
            `${item.id}-${state.id}`,
            `${item.name} ${state.name}`,
            state.fullBodyPngSrc
          ),
        ])
        states.push({
          ...state,
          avatarSrc,
          fullBodyPngSrc,
          // Звук появления состояния — «короткий звук», как у саундпада.
          ...(state.appearance
            ? {
                appearance: {
                  ...state.appearance,
                  ...(state.appearance.soundSrc
                    ? {
                        soundSrc: await persist(
                          `characters[${index}].states[${stateIndex}].appearance.soundSrc`,
                          inEpisode(ASSET_FOLDERS.soundpad),
                          `${item.id}-${state.id}-appear`,
                          `${item.name} ${state.name} появление`,
                          state.appearance.soundSrc
                        ),
                      }
                    : {}),
                },
              }
            : {}),
        })
      }
      return {
        ...item,
        states,
        ...(item.appearance
          ? {
              appearance: {
                ...item.appearance,
                ...(item.appearance.soundSrc
                  ? {
                      soundSrc: await persist(
                        `characters[${index}].appearance.soundSrc`,
                        inEpisode(ASSET_FOLDERS.soundpad),
                        `${item.id}-appear`,
                        `${item.name} появление`,
                        item.appearance.soundSrc
                      ),
                    }
                  : {}),
              },
            }
          : {}),
        avatarSrc: await persist(
          `characters[${index}].avatarSrc`,
          folder,
          item.id,
          `${item.name} токен`,
          item.avatarSrc
        ),
        fullBodyPngSrc: await persist(
          `characters[${index}].fullBodyPngSrc`,
          folder,
          item.id,
          item.name,
          item.fullBodyPngSrc
        ),
      }
    })
  )

  const tracks = await Promise.all(
    file.tracks.map(async (item, index) => ({
      ...item,
      audioSrc: await persist(
        `tracks[${index}].audioSrc`,
        inEpisode(ASSET_FOLDERS.music),
        item.id,
        item.title,
        item.audioSrc
      ),
      coverSrc: await persist(
        `tracks[${index}].coverSrc`,
        inEpisode(ASSET_FOLDERS.music),
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
        inEpisode(ASSET_FOLDERS.soundpad),
        item.id,
        item.title,
        item.src
      ),
    }))
  )

  /** Треки групп: встроенный файл уезжает в `music/` папки выпуска. */
  const persistGroupTracks = async (groupTracks: GroupTracks) => {
    const result: GroupTracks = {}
    for (const [group, track] of Object.entries(groupTracks)) {
      if (!track) continue
      const src = await persist(
        `groupTracks["${group}"].src`,
        inEpisode(ASSET_FOLDERS.music),
        track.id,
        track.title,
        track.src
      )
      if (src) result[group] = { ...track, src }
    }
    return result
  }

  const persisted: EpisodeFile = {
    ...file,
    // Slug в файле совпадает с папкой, куда легли ассеты: при импорте на другой
    // машине пути сойдутся без пересчёта.
    episodeSlug: generateEpisodeSlug(episodeSlug),
    backgrounds,
    characters,
    tracks,
    soundpad: soundpadSlots,
    groupTracks: await persistGroupTracks(file.groupTracks ?? {}),
  }
  // Треки групп обычно уже лежат файлами (их кладут при привязке к акту), но
  // встроенный (data-URL) тоже выгружаем — как и остальные ассеты выпуска.
  return { file: persisted, saved, issues }
}

