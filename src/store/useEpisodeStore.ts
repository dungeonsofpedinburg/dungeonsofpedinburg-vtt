import { create } from "zustand"
import { GRID_COLUMNS, GRID_ROWS, campaign, initialTracks } from "@/data/content"
import {
  actGroups,
  initialBackgrounds,
  initialCharacters,
  initialMapTokens,
  initialSceneNotes,
  initialSoundpad,
} from "@/data/seed"
import { normalizeEpisodeAssets } from "@/lib/asset-url"
import { initialsFromName } from "@/lib/character"
import { initialVideoPlayback, nextSeekId, videoPlaybackForScene } from "@/lib/media"
import {
  normalizeSoundpadIcon,
  soundpadTitleFallback,
} from "@/lib/soundpad"
import {
  ROLL_PLAQUE_MS,
  diceSum,
  estimateDiceRoll,
  notationToSides,
  rollWaitMsFor,
} from "@/lib/dice"
import type {
  ActGroup,
  Background,
  Character,
  DiceRollEvent,
  DiceRollResult,
  DieSides,
  EpisodeFile,
  MapToken,
  RollDie,
  SceneNotes,
  SoundpadSlot,
  StagePhase,
  SyncedEpisode,
  TokenCategory,
  Track,
  VideoPlaybackState,
} from "@/data/types"

export const MAX_DICE_PER_TYPE = 5
/** Длительность фаз сцены — синхронна с CSS-классами в SceneStage. */
const STAGE_LEAVE_MS = 350
const STAGE_ENTER_MS = 350

export type CharacterInput = {
  name: string
  role: string
  category: TokenCategory
  avatarSrc: string
  fullBodyPngSrc: string
}

export type CharacterImagePatch = {
  avatarSrc?: string
  fullBodyPngSrc?: string
}

export type TrackInput = {
  title: string
  artist: string
  duration: string
  tag: string
  audioSrc: string
  /** Обложка из метаданных MP3 (data-URL), меняется вместе с файлом */
  coverSrc: string
}

/** Слот саундпада на входе: id всегда выдаёт стор. */
export type SoundpadSlotInput = {
  title: string
  /** Имя иконки lucide-react из набора `SOUNDPAD_ICON_NAMES` */
  icon: string
  /** Путь к звуку или data-URL выбранного файла */
  src: string
}

export type AddBackgroundOptions = {
  /** Название сцены: по умолчанию «Новая сцена N» */
  title?: string
  /** Картинка сцены: путь из public или data-URL */
  src?: string
  /** Ставить сцену сразу в эфир (по умолчанию — да, как кнопка «+») */
  activate?: boolean
}

/**
 * Живое состояние видео-фона (пауза, повтор, перемотка) — общее для Мастера и
 * /screen: команды плеера уходят в стор, а оттуда снапшотом на экран OBS.
 * Сбрасывается при смене сцены: новое видео стартует с начала в обоих окнах.
 */
type EpisodeState = {
  /** Название выпуска — правится прямо в хэдере */
  episodeTitle: string
  backgrounds: Background[]
  /** Разделители сцен (акты): порядок отображения в библиотеке и в заметках. */
  sceneGroups: string[]
  characters: Character[]
  tracks: Track[]
  activeBackgroundId: string
  previousBackgroundId: string | null
  activeCharacterId: string | null
  stagePhase: StagePhase
  stageFromCharacterId: string | null
  stageToCharacterId: string | null
  mapTokens: MapToken[]
  activeMapId: string | null
  sceneNotes: SceneNotes
  /**
   * Слоты саундпада — быстрые звуковые эффекты поверх музыки. Живут только в
   * панели Мастера: на /screen звук не транслируется (как и треки).
   */
  soundpad: SoundpadSlot[]
  /** Управление видео-фоном: пауза, повтор и перемотка — одно на оба окна */
  videoPlayback: VideoPlaybackState
  dicePool: DieSides[]
  lastRoll: DiceRollResult | null
  /** Последний запрос броска: id растёт, dice — нотации для экрана OBS */
  lastRollEvent: DiceRollEvent | null
  /**
   * Ждём результат физики с /screen (или фолбэк по таймауту). По этому флагу
   * кнопка «LET'S ROLL» показывает «Кубики летят…», а на /screen появляется подложка.
   */
  isRollPending: boolean
  /**
   * Сколько экранов OBS на связи (presence sync-сервера). От этого зависит
   * ожидание итога: с экраном ждём физику дольше, без него считаем локально.
   * Поле локальное для вкладки и в снапшот состояния не попадает.
   */
  syncScreens: number

  setActiveBackground: (backgroundId: string) => void
  renameEpisode: (title: string) => void
  renameBackground: (backgroundId: string, title: string) => void
  updateBackgroundImage: (backgroundId: string, src: string) => void
  setActiveMap: (mapId: string) => void
  addBackground: (actGroup: ActGroup, options?: AddBackgroundOptions) => string
  /** Новый разделитель в конце списка: возвращает его имя для инлайн-правки */
  addSceneGroup: () => string
  /** Переименование разделителя: одноимённые сливаются, сцены переезжают */
  renameSceneGroup: (name: string, nextName: string) => void
  /** Удаление разделителя: сцены уходят в предыдущий (первый — в следующий) */
  removeSceneGroup: (name: string) => void
  /** Перестановка разделителей: сцены едут вместе с ними */
  moveSceneGroup: (sourceName: string, targetName: string) => void
  /** Перенос сцены в конец чужого разделителя (бросок на заголовок) */
  moveBackgroundToGroup: (backgroundId: string, groupName: string) => void
  /** Копия сцены — встаёт сразу за исходной, с пустой раскладкой токенов */
  duplicateBackground: (backgroundId: string) => void
  /** Удаление сцены; последнюю сцену выпуска удалить нельзя */
  removeBackground: (backgroundId: string) => void
  /** Зацикливание видео-сцены: рубильник в плеере Viewport Мастера */
  setBackgroundLoop: (backgroundId: string, isLoop: boolean) => void
  /** Пауза и возобновление видео-фона — команда уезжает и на /screen */
  setVideoPlaying: (isPlaying: boolean) => void
  /** Кнопка Play/Pause в плеере Мастера */
  toggleVideoPlaying: () => void
  /** Повтор видео: общее состояние и настройка самой сцены */
  setVideoLoop: (isLoop: boolean) => void
  /** Перемотка: время в секундах; каждое событие помечается новым seekId */
  seekVideo: (time: number) => void
  moveBackground: (sourceId: string, targetId: string) => void
  toggleBattlemapMode: (backgroundId: string) => void
  updateSceneNote: (backgroundId: string, note: string) => void
  addCharacter: (input: CharacterInput) => string
  renameCharacter: (characterId: string, name: string) => void
  updateCharacterImage: (characterId: string, patch: CharacterImagePatch) => void
  setCharacterCategory: (characterId: string, category: TokenCategory) => void
  removeCharacter: (characterId: string) => void
  moveTrack: (sourceId: string, targetId: string) => void
  addTrack: (input: TrackInput) => string
  updateTrack: (trackId: string, patch: Partial<TrackInput>) => void
  removeTrack: (trackId: string) => void
  /** Новый слот саундпада: возвращает его id, чтобы сразу открыть правку */
  addSoundpadSlot: (input: SoundpadSlotInput) => string
  updateSoundpadSlot: (slotId: string, patch: Partial<SoundpadSlotInput>) => void
  removeSoundpadSlot: (slotId: string) => void
  /**
   * Удаление пачкой из режима множественного выделения. Персонажи уходят со
   * сцены и с карт, сцены — вместе с раскладкой токенов и заметками: всё, что
   * тянется за элементом, чистит стор, а не компонент.
   */
  deleteBatchCharacters: (ids: string[]) => void
  deleteBatchBackgrounds: (ids: string[]) => void
  deleteBatchTracks: (ids: string[]) => void
  deleteBatchSoundpadSlots: (ids: string[]) => void
  toggleCharacterOnStage: (characterId: string) => void
  addToken: (
    characterId: string,
    cellX: number,
    cellY: number,
    mapId?: string
  ) => string
  setTokenPosition: (tokenId: string, cellX: number, cellY: number) => void
  removeToken: (tokenId: string) => void
  addDie: (sides: DieSides) => void
  removeDie: (sides: DieSides) => void
  clearDicePool: () => void
  /**
   * Запускает 3D-бросок: событие уходит на /screen, Staging area очищается.
   * Итог возвращает физика экрана (completeDiceRoll), он же попадает в плашку.
   */
  triggerDiceRoll: (notation: string[]) => void
  /**
   * Записывает итог броска: фактические значения физики с экрана OBS или
   * локальную оценку. `estimated` — значения случайные (физика не ответила),
   * в плашке такой итог идёт со знаком «≈».
   */
  completeDiceRoll: (dice: RollDie[], sum: number, estimated?: boolean) => void
  clearRoll: () => void
  /** Сколько экранов OBS на связи — приходит из presence sync-сервера. */
  setSyncScreens: (count: number) => void
  resetEpisode: () => void
  importEpisode: (file: EpisodeFile) => void
  applyRemoteState: (state: SyncedEpisode) => void
}

let identifier = 0

function nextId(prefix: string) {
  identifier += 1
  return `${prefix}-${identifier.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function clampIndex(value: number, max: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(Math.trunc(value), 0), max)
}

/**
 * Номер разделителя в списке. Неизвестные группы (файл старого формата,
 * переименование в процессе) уезжают в конец — сцены не теряются.
 */
function groupOrderIndex(sceneGroups: string[], groupName: string) {
  const index = sceneGroups.indexOf(groupName)
  return index < 0 ? sceneGroups.length : index
}

/** Куда вставить новую сцену, чтобы она попала в конец своего разделителя. */
function insertIndexForGroup(
  backgrounds: Background[],
  groupName: ActGroup,
  sceneGroups: string[]
) {
  const groupIndex = groupOrderIndex(sceneGroups, groupName)
  let insertAt = backgrounds.length
  for (let index = backgrounds.length - 1; index >= 0; index -= 1) {
    if (groupOrderIndex(sceneGroups, backgrounds[index].actGroup) > groupIndex) {
      insertAt = index
    }
  }
  return insertAt
}

/**
 * Приводит сцены в соответствие порядку разделителей: так библиотека,
 * заметки и экспорт показывают один и тот же порядок, а сцены внутри
 * разделителя остаются там, куда их поставил мастер.
 */
function orderBackgroundsByGroups(
  backgrounds: Background[],
  sceneGroups: string[]
) {
  return backgrounds
    .map((background, index) => ({ background, index }))
    .sort((left, right) => {
      const delta =
        groupOrderIndex(sceneGroups, left.background.actGroup) -
        groupOrderIndex(sceneGroups, right.background.actGroup)
      return delta !== 0 ? delta : left.index - right.index
    })
    .map((entry) => entry.background)
}

/**
 * Разделители импортируемого выпуска: сначала список из файла, затем имена,
 * которые встречаются только у сцен (файлы старого формата).
 */
function resolveSceneGroups(backgrounds: Background[], groups?: string[]) {
  const names: string[] = []
  const push = (value: string | undefined) => {
    const name = value?.trim()
    if (name && !names.includes(name)) names.push(name)
  }
  groups?.forEach(push)
  backgrounds.forEach((background) => push(background.actGroup))
  return names.length > 0 ? names : [...actGroups]
}

/**
 * Локальная оценка броска: экран OBS не ответил, физику посчитать негде.
 * Значения случайные, поэтому итог помечаем `estimated` — в плашке он пойдёт
 * со знаком «≈», чтобы его не приняли за честный бросок 3D-кубиков.
 */
function estimateRoll(pool: DieSides[]): DiceRollResult {
  const dice = estimateDiceRoll(pool)
  return {
    id: nextId("roll"),
    dice,
    sum: diceSum(dice),
    createdAt: Date.now(),
    estimated: true,
  }
}

/** Номер последнего запроса броска: по нему мастер принимает ответ только от него. */
let rollEventCounter = 0
/** Ждём ответ физики с /screen, иначе бросок посчитает сам Мастер. */
let rollWaitTimer: ReturnType<typeof setTimeout> | null = null
/** Плашка с итогом гаснет сама. */
let rollPlaqueTimer: ReturnType<typeof setTimeout> | null = null

function clearRollTimers() {
  if (rollWaitTimer !== null) {
    clearTimeout(rollWaitTimer)
    rollWaitTimer = null
  }
  if (rollPlaqueTimer !== null) {
    clearTimeout(rollPlaqueTimer)
    rollPlaqueTimer = null
  }
}

/** Итог броска снимается со сцены через ROLL_PLAQUE_MS — и у Мастера, и на /screen. */
/** Отмена ожидания результата с /screen: таймер плашки не трогаем. */
function cancelRollWait() {
  if (rollWaitTimer !== null) {
    clearTimeout(rollWaitTimer)
    rollWaitTimer = null
  }
}

function schedulePlaqueFade() {
  if (rollPlaqueTimer !== null) clearTimeout(rollPlaqueTimer)
  rollPlaqueTimer = setTimeout(() => {
    rollPlaqueTimer = null
    useEpisodeStore.setState({ lastRoll: null })
  }, ROLL_PLAQUE_MS)
}

/** Таймеры фаз: новый клик по персонажу отменяет незавершённый переход. */
let stageTimer: ReturnType<typeof setTimeout> | null = null
function clearStageTimer() {
  if (stageTimer !== null) {
    clearTimeout(stageTimer)
    stageTimer = null
  }
}

const IDLE_STAGE = {
  stagePhase: "idle" as StagePhase,
  stageFromCharacterId: null,
  stageToCharacterId: null,
}

export const useEpisodeStore = create<EpisodeState>()((set, get) => ({
  episodeTitle: campaign.title,
  backgrounds: initialBackgrounds,
  sceneGroups: [...actGroups],
  characters: initialCharacters,
  tracks: initialTracks,
  soundpad: initialSoundpad,
  activeBackgroundId: initialBackgrounds[0].id,
  previousBackgroundId: null,
  activeCharacterId: null,
  ...IDLE_STAGE,
  mapTokens: initialMapTokens,
  activeMapId: initialBackgrounds.find((item) => item.isBattlemap)?.id ?? null,
  sceneNotes: initialSceneNotes,
  dicePool: [],
  lastRoll: null,
  lastRollEvent: null,
  isRollPending: false,
  syncScreens: 0,
  videoPlayback: initialVideoPlayback(),

  setActiveBackground: (backgroundId) =>
    set((state) => {
      const background = state.backgrounds.find(
        (item) => item.id === backgroundId
      )
      if (!background || state.activeBackgroundId === backgroundId) return {}
      return {
        // Предыдущая сцена нужна для fade-перехода (в панели и на /screen).
        previousBackgroundId: state.activeBackgroundId,
        activeBackgroundId: backgroundId,
        activeMapId: background.isBattlemap ? backgroundId : state.activeMapId,
        // Новое видео стартует с начала и играет: срок годности команд плеера
        // истёк, а seekId сменился — /screen получит синхронный старт с 00:00.
        videoPlayback: videoPlaybackForScene(
          background,
          state.videoPlayback.seekId
        ),
      }
    }),

  renameEpisode: (title) => set({ episodeTitle: title }),

  updateBackgroundImage: (backgroundId, src) =>
    set((state) => ({
      backgrounds: state.backgrounds.map((item) =>
        item.id === backgroundId ? { ...item, src } : item
      ),
    })),

  addBackground: (actGroup, options) => {
    const id = nextId("bg")
    set((state) => {
      const count =
        state.backgrounds.filter((item) => item.actGroup === actGroup).length +
        1
      const background: Background = {
        id,
        title: options?.title?.trim() || `Новая сцена ${count}`,
        src: options?.src ?? "",
        actGroup,
        isBattlemap: false,
      }
      const next = [...state.backgrounds]
      next.splice(
        insertIndexForGroup(state.backgrounds, actGroup, state.sceneGroups),
        0,
        background
      )
      return {
        backgrounds: next,
        // Пакетный импорт сцен не должен «перещёлкивать» эфир на каждой сцене.
        ...(options?.activate === false
          ? {}
          : { activeBackgroundId: background.id }),
      }
    })
    return id
  },

  duplicateBackground: (backgroundId) => {
    const state = get()
    const index = state.backgrounds.findIndex(
      (item) => item.id === backgroundId
    )
    if (index < 0) return
    const source = state.backgrounds[index]
    const copy: Background = {
      ...source,
      id: nextId("bg"),
      title: `${source.title} · копия`,
    }
    const backgrounds = [...state.backgrounds]
    // Копия встаёт сразу за исходной сценой, порядок остальных не меняется.
    backgrounds.splice(index + 1, 0, copy)
    set({ backgrounds })
  },

  removeBackground: (backgroundId) => {
    const state = get()
    const index = state.backgrounds.findIndex(
      (item) => item.id === backgroundId
    )
    // Последнюю сцену не удаляем: на проекторе должно что-то остаться.
    if (index < 0 || state.backgrounds.length <= 1) return

    const backgrounds = state.backgrounds.filter(
      (item) => item.id !== backgroundId
    )
    const sceneNotes = { ...state.sceneNotes }
    delete sceneNotes[backgroundId]

    set({
      backgrounds,
      sceneNotes,
      // Раскладка удалённой карты уходит вместе с ней, иначе останутся висячие токены.
      mapTokens: state.mapTokens.filter((token) => token.mapId !== backgroundId),
      // Если удалили эфирную сцену — в эфир встаёт соседняя по списку.
      activeBackgroundId:
        state.activeBackgroundId === backgroundId
          ? backgrounds[Math.min(index, backgrounds.length - 1)].id
          : state.activeBackgroundId,
      previousBackgroundId:
        state.previousBackgroundId === backgroundId
          ? null
          : state.previousBackgroundId,
      activeMapId:
        state.activeMapId === backgroundId ? null : state.activeMapId,
    })
  },

  setBackgroundLoop: (backgroundId, isLoop) =>
    set((state) => ({
      backgrounds: state.backgrounds.map((item) =>
        item.id === backgroundId ? { ...item, isLoop } : item
      ),
    })),

  /**
   * Пауза и возобновление видео. Одна команда на оба окна: /screen применит её
   * из снапшота, поэтому проектор не продолжит играть сам по себе.
   */
  setVideoPlaying: (isPlaying) =>
    set((state) => ({
      videoPlayback: { ...state.videoPlayback, isPlaying },
    })),

  toggleVideoPlaying: () =>
    set((state) => ({
      videoPlayback: {
        ...state.videoPlayback,
        isPlaying: !state.videoPlayback.isPlaying,
      },
    })),

  /**
   * Повтор видео. Пишем и в живое состояние (его видят оба окна), и в саму сцену:
   * так выбор Мастера переживает возврат на сцену и уезжает в файл выпуска.
   */
  setVideoLoop: (isLoop) =>
    set((state) => ({
      videoPlayback: { ...state.videoPlayback, isLoop },
      backgrounds: state.backgrounds.map((item) =>
        item.id === state.activeBackgroundId ? { ...item, isLoop } : item
      ),
    })),

  /**
   * Перемотка: храним время и метку события. По `seekId` элементы видео в обоих
   * окнах понимают, что поступила новая команда (сравнивать одно время мало:
   * повторная перемотка в ту же секунду не изменила бы состояние).
   */
  seekVideo: (time) =>
    set((state) => ({
      videoPlayback: {
        ...state.videoPlayback,
        seekTime: Number.isFinite(time) && time > 0 ? time : 0,
        // Метка строго растёт: две перемотки подряд в одну миллисекунду не
        // потеряются (эффекты окон реагируют именно на смену метки).
        seekId: nextSeekId(state.videoPlayback.seekId),
      },
    })),

  moveBackground: (sourceId, targetId) =>
    set((state) => {
      const sourceIndex = state.backgrounds.findIndex(
        (item) => item.id === sourceId
      )
      const targetIndex = state.backgrounds.findIndex(
        (item) => item.id === targetId
      )
      if (sourceIndex < 0 || targetIndex < 0 || sourceId === targetId) {
        return {}
      }
      // Бросок сцены на сцену другого разделителя переносит её в тот разделитель.
      const target = state.backgrounds[targetIndex]
      const rest = state.backgrounds.filter((item) => item.id !== sourceId)
      // Тянем вниз — встаём за целью, вверх — перед целью (как в списках).
      const insertAt =
        rest.findIndex((item) => item.id === targetId) +
        (sourceIndex < targetIndex ? 1 : 0)
      const moved = {
        ...state.backgrounds[sourceIndex],
        actGroup: target.actGroup,
      }
      const next = [...rest]
      next.splice(insertAt, 0, moved)
      return { backgrounds: next }
    }),

  addSceneGroup: () => {
    const sceneGroups = get().sceneGroups
    let index = sceneGroups.length + 1
    // Имя не должно совпасть с уже переименованным разделителем.
    while (sceneGroups.includes(`Новый разделитель ${index}`)) index += 1
    const name = `Новый разделитель ${index}`
    set({ sceneGroups: [...sceneGroups, name] })
    return name
  },

  renameSceneGroup: (name, nextName) =>
    set((state) => {
      const trimmed = nextName.trim()
      if (!trimmed || trimmed === name || !state.sceneGroups.includes(name)) {
        return {}
      }
      // Совпадение имён сливает разделители: сцены обоих остаются на месте.
      const sceneGroups = state.sceneGroups
        .map((group) => (group === name ? trimmed : group))
        .filter((group, index, list) => list.indexOf(group) === index)
      return {
        sceneGroups,
        backgrounds: orderBackgroundsByGroups(
          state.backgrounds.map((item) =>
            item.actGroup === name ? { ...item, actGroup: trimmed } : item
          ),
          sceneGroups
        ),
      }
    }),

  removeSceneGroup: (name) =>
    set((state) => {
      const index = state.sceneGroups.indexOf(name)
      // Последний разделитель не удаляем: сценам некуда переезжать.
      if (index < 0 || state.sceneGroups.length <= 1) return {}
      const fallback =
        state.sceneGroups[index - 1] ?? state.sceneGroups[index + 1]
      const sceneGroups = state.sceneGroups.filter((group) => group !== name)
      // Сцены удалённого разделителя переезжают в соседний — ничего не теряется.
      const moved = state.backgrounds
        .filter((item) => item.actGroup === name)
        .map((item) => ({ ...item, actGroup: fallback }))
      const rest = state.backgrounds.filter((item) => item.actGroup !== name)
      return {
        sceneGroups,
        backgrounds: orderBackgroundsByGroups([...rest, ...moved], sceneGroups),
      }
    }),

  moveSceneGroup: (sourceName, targetName) =>
    set((state) => {
      const from = state.sceneGroups.indexOf(sourceName)
      const to = state.sceneGroups.indexOf(targetName)
      if (from < 0 || to < 0 || from === to) return {}
      const sceneGroups = [...state.sceneGroups]
      const [moved] = sceneGroups.splice(from, 1)
      sceneGroups.splice(to, 0, moved)
      // Сцены едут вместе с разделителем: библиотека и экспорт совпадают.
      return {
        sceneGroups,
        backgrounds: orderBackgroundsByGroups(state.backgrounds, sceneGroups),
      }
    }),

  moveBackgroundToGroup: (backgroundId, groupName) =>
    set((state) => {
      if (!state.sceneGroups.includes(groupName)) return {}
      const background = state.backgrounds.find(
        (item) => item.id === backgroundId
      )
      if (!background) return {}
      const rest = state.backgrounds.filter(
        (item) => item.id !== backgroundId
      )
      const next = [...rest]
      next.splice(
        insertIndexForGroup(rest, groupName, state.sceneGroups),
        0,
        { ...background, actGroup: groupName }
      )
      return { backgrounds: next }
    }),

  toggleBattlemapMode: (backgroundId) =>
    set((state) => {
      const background = state.backgrounds.find(
        (item) => item.id === backgroundId
      )
      if (!background) return {}
      const isBattlemap = !background.isBattlemap
      return {
        backgrounds: state.backgrounds.map((item) =>
          item.id === backgroundId ? { ...item, isBattlemap } : item
        ),
        activeMapId: isBattlemap
          ? backgroundId
          : state.activeMapId === backgroundId
            ? null
            : state.activeMapId,
      }
    }),

  updateSceneNote: (backgroundId, note) =>
    set((state) => ({
      sceneNotes: { ...state.sceneNotes, [backgroundId]: note },
    })),

  moveTrack: (sourceId, targetId) =>
    set((state) => {
      const from = state.tracks.findIndex((item) => item.id === sourceId)
      const to = state.tracks.findIndex((item) => item.id === targetId)
      if (from < 0 || to < 0 || from === to) return {}
      const next = [...state.tracks]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return { tracks: next }
    }),

  renameBackground: (backgroundId, title) =>
    set((state) => ({
      backgrounds: state.backgrounds.map((item) =>
        item.id === backgroundId ? { ...item, title } : item
      ),
    })),

  setActiveMap: (mapId) =>
    set((state) => {
      const map = state.backgrounds.find((item) => item.id === mapId)
      if (!map || !map.isBattlemap) return {}
      // Меняем только редактируемую карту: эфирный фон не затрагивается.
      return { activeMapId: mapId }
    }),

  addCharacter: (input) => {
    const name = input.name.trim() || "Новый персонаж"
    const character: Character = {
      id: nextId("char"),
      name,
      role: input.role.trim() || "Без роли",
      initials: initialsFromName(name),
      category: input.category,
      avatarSrc: input.avatarSrc,
      fullBodyPngSrc: input.fullBodyPngSrc || input.avatarSrc,
    }
    set((state) => ({ characters: [...state.characters, character] }))
    return character.id
  },

  renameCharacter: (characterId, name) =>
    set((state) => ({
      characters: state.characters.map((character) => {
        if (character.id !== characterId) return character
        const nextName = name.trim() || character.name
        return {
          ...character,
          name: nextName,
          initials: initialsFromName(nextName),
        }
      }),
    })),

  updateCharacterImage: (characterId, patch) =>
    set((state) => ({
      characters: state.characters.map((character) =>
        character.id === characterId
          ? {
              ...character,
              avatarSrc: patch.avatarSrc ?? character.avatarSrc,
              fullBodyPngSrc: patch.fullBodyPngSrc ?? character.fullBodyPngSrc,
            }
          : character
      ),
    })),

  setCharacterCategory: (characterId, category) =>
    set((state) => ({
      characters: state.characters.map((character) =>
        character.id === characterId ? { ...character, category } : character
      ),
    })),

  removeCharacter: (characterId) => {
    clearStageTimer()
    set((state) => {
      const wasStaged =
        state.activeCharacterId === characterId ||
        state.stageFromCharacterId === characterId ||
        state.stageToCharacterId === characterId
      return {
        characters: state.characters.filter(
          (character) => character.id !== characterId
        ),
        mapTokens: state.mapTokens.filter(
          (token) => token.characterId !== characterId
        ),
        ...(wasStaged ? { activeCharacterId: null, ...IDLE_STAGE } : {}),
      }
    })
  },

  addTrack: (input) => {
    const track: Track = {
      id: nextId("track"),
      title: input.title.trim() || "Новый трек",
      artist: input.artist.trim() || "Неизвестный исполнитель",
      duration: input.duration.trim() || "0:00",
      tag: input.tag.trim() || "Прочее",
      audioSrc: input.audioSrc,
      coverSrc: input.coverSrc,
    }
    set((state) => ({ tracks: [...state.tracks, track] }))
    return track.id
  },

  updateTrack: (trackId, patch) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, ...patch } : track
      ),
    })),

  removeTrack: (trackId) =>
    set((state) => ({
      tracks: state.tracks.filter((track) => track.id !== trackId),
    })),

  addSoundpadSlot: (input) => {
    const index = get().soundpad.length
    const slot: SoundpadSlot = {
      id: nextId("sfx"),
      title: input.title.trim() || soundpadTitleFallback(index),
      // Имя иконки приходит из UI, но стор не доверяет ему: в поле уезжает
      // компонент lucide, а в файле выпуска — строку проверяет тот же набор.
      icon: normalizeSoundpadIcon(input.icon),
      src: input.src.trim(),
    }
    set((state) => ({ soundpad: [...state.soundpad, slot] }))
    return slot.id
  },

  updateSoundpadSlot: (slotId, patch) =>
    set((state) => ({
      soundpad: state.soundpad.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              ...patch,
              ...(patch.icon ? { icon: normalizeSoundpadIcon(patch.icon) } : {}),
            }
          : slot
      ),
    })),

  removeSoundpadSlot: (slotId) =>
    set((state) => ({
      soundpad: state.soundpad.filter((slot) => slot.id !== slotId),
    })),

  deleteBatchCharacters: (ids) => {
    if (ids.length === 0) return
    clearStageTimer()
    const doomed = new Set(ids)
    set((state) => {
      // Если удаляем того, кто сейчас на сцене, — сцену гасим целиком.
      const wasStaged =
        Boolean(
          state.activeCharacterId && doomed.has(state.activeCharacterId)
        ) ||
        Boolean(
          state.stageFromCharacterId && doomed.has(state.stageFromCharacterId)
        ) ||
        Boolean(
          state.stageToCharacterId && doomed.has(state.stageToCharacterId)
        )
      return {
        characters: state.characters.filter(
          (character) => !doomed.has(character.id)
        ),
        // Токены удалённых уходят с карт: висячих фишек не остаётся.
        mapTokens: state.mapTokens.filter(
          (token) => !doomed.has(token.characterId)
        ),
        ...(wasStaged ? { activeCharacterId: null, ...IDLE_STAGE } : {}),
      }
    })
  },

  deleteBatchBackgrounds: (ids) => {
    if (ids.length === 0) return
    set((state) => {
      if (state.backgrounds.length === 0) return {}
      const doomed = new Set(ids)
      const survivors = state.backgrounds.filter(
        (item) => !doomed.has(item.id)
      )
      // Выделили все сцены — одну всё равно оставляем: на проекторе должно быть
      // что показывать. Оставляем ту, что сейчас в эфире.
      if (survivors.length === 0) {
        const keeper =
          state.backgrounds.find(
            (item) => item.id === state.activeBackgroundId
          ) ?? state.backgrounds[state.backgrounds.length - 1]
        survivors.push(keeper)
        doomed.delete(keeper.id)
      }

      const sceneNotes = { ...state.sceneNotes }
      doomed.forEach((id) => {
        delete sceneNotes[id]
      })

      // Эфирную сцену заменяет соседняя по списку — та же логика, что у одиночного
      // удаления: индекс ищем в исходном порядке.
      const activeIndex = Math.max(
        state.backgrounds.findIndex(
          (item) => item.id === state.activeBackgroundId
        ),
        0
      )
      const activeBackgroundId = doomed.has(state.activeBackgroundId)
        ? survivors[Math.min(activeIndex, survivors.length - 1)].id
        : state.activeBackgroundId

      return {
        backgrounds: survivors,
        sceneNotes,
        mapTokens: state.mapTokens.filter(
          (token) => !doomed.has(token.mapId)
        ),
        activeBackgroundId,
        previousBackgroundId:
          state.previousBackgroundId &&
          doomed.has(state.previousBackgroundId)
            ? null
            : state.previousBackgroundId,
        activeMapId:
          state.activeMapId && doomed.has(state.activeMapId)
            ? (survivors.find((item) => item.isBattlemap)?.id ?? null)
            : state.activeMapId,
      }
    })
  },

  deleteBatchTracks: (ids) => {
    if (ids.length === 0) return
    const doomed = new Set(ids)
    set((state) => ({
      tracks: state.tracks.filter((track) => !doomed.has(track.id)),
    }))
  },

  deleteBatchSoundpadSlots: (ids) => {
    if (ids.length === 0) return
    const doomed = new Set(ids)
    set((state) => ({
      soundpad: state.soundpad.filter((slot) => !doomed.has(slot.id)),
    }))
  },

  toggleCharacterOnStage: (characterId) => {
    const state = useEpisodeStore.getState()
    const nextCharacterId =
      state.activeCharacterId === characterId ? null : characterId
    clearStageTimer()

    // На сцене никого не было — сразу выезд снизу.
    if (state.activeCharacterId === null && nextCharacterId !== null) {
      set({
        activeCharacterId: nextCharacterId,
        stagePhase: "entering",
        stageFromCharacterId: null,
        stageToCharacterId: nextCharacterId,
      })
      stageTimer = setTimeout(() => {
        stageTimer = null
        set(IDLE_STAGE)
      }, STAGE_ENTER_MS)
      return
    }

    // Кто-то на сцене: сначала он уезжает вниз, только потом выезжает новый.
    set({
      activeCharacterId: nextCharacterId,
      stagePhase: "leaving",
      stageFromCharacterId: state.activeCharacterId,
      stageToCharacterId: nextCharacterId,
    })
    stageTimer = setTimeout(() => {
      stageTimer = null
      const target = useEpisodeStore.getState().stageToCharacterId
      if (!target) {
        set(IDLE_STAGE)
        return
      }
      set({ stagePhase: "entering", stageToCharacterId: target })
      stageTimer = setTimeout(() => {
        stageTimer = null
        set(IDLE_STAGE)
      }, STAGE_ENTER_MS)
    }, STAGE_LEAVE_MS)
  },

  /*
   * Возвращает id токена: панель карт сразу помечает его активным
   * (подсветка карточки в колонках и рамка токена на сетке).
   */
  addToken: (characterId, cellX, cellY, mapId) => {
    const state = get()
    const targetMapId =
      mapId ??
      state.activeMapId ??
      state.backgrounds.find((item) => item.isBattlemap)?.id ??
      ""
    const x = clampIndex(cellX, GRID_COLUMNS - 1)
    const y = clampIndex(cellY, GRID_ROWS - 1)
    // Один персонаж может стоять на каждой карте в своём месте.
    const existing = state.mapTokens.find(
      (token) => token.characterId === characterId && token.mapId === targetMapId
    )
    if (existing) {
      set((current) => ({
        mapTokens: current.mapTokens.map((token) =>
          token.id === existing.id ? { ...token, cellX: x, cellY: y } : token
        ),
      }))
      return existing.id
    }
    const token = {
      id: nextId("token"),
      characterId,
      mapId: targetMapId,
      cellX: x,
      cellY: y,
    }
    set((current) => ({ mapTokens: [...current.mapTokens, token] }))
    return token.id
  },

  setTokenPosition: (tokenId, cellX, cellY) =>
    set((state) => {
      const moving = state.mapTokens.find((token) => token.id === tokenId)
      if (!moving) return {}
      const x = clampIndex(cellX, GRID_COLUMNS - 1)
      const y = clampIndex(cellY, GRID_ROWS - 1)
      const target = state.mapTokens.find(
        (token) =>
          token.id !== tokenId &&
          token.mapId === moving.mapId &&
          token.cellX === x &&
          token.cellY === y
      )
      return {
        mapTokens: state.mapTokens.map((token) => {
          if (token.id === tokenId) return { ...token, cellX: x, cellY: y }
          if (target && token.id === target.id) {
            return { ...token, cellX: moving.cellX, cellY: moving.cellY }
          }
          return token
        }),
      }
    }),

  removeToken: (tokenId) =>
    set((state) => ({
      mapTokens: state.mapTokens.filter((token) => token.id !== tokenId),
    })),

  addDie: (sides) =>
    set((state) => {
      const count = state.dicePool.filter((die) => die === sides).length
      if (count >= MAX_DICE_PER_TYPE) return {}
      // Набор нового пула отменяет ожидание прошлого броска — кнопка снова активна.
      cancelRollWait()
      return { dicePool: [...state.dicePool, sides], isRollPending: false }
    }),

  removeDie: (sides) =>
    set((state) => {
      const index = state.dicePool.lastIndexOf(sides)
      if (index < 0) return {}
      cancelRollWait()
      const next = [...state.dicePool]
      next.splice(index, 1)
      return { dicePool: next, isRollPending: false }
    }),

  clearDicePool: () => set({ dicePool: [] }),

  triggerDiceRoll: (notation) => {
    if (notation.length === 0) return
    clearRollTimers()
    rollEventCounter += 1
    const eventId = rollEventCounter
    // Пул уходит в бросок, плашка прошлого итога снимается до нового результата.
    set({
      dicePool: [],
      lastRoll: null,
      lastRollEvent: { id: eventId, dice: notation },
      isRollPending: true,
    })
    // Экран OBS не ответил — считаем бросок локально, без 3D-кубиков. Если экран
    // на связи, ждём дольше: первый бросок грузит wasm и тему, и кубики катятся
    // пару секунд — иначе Мастер показывал случайное число раньше физики.
    const waitMs = rollWaitMsFor(get().syncScreens)
    rollWaitTimer = setTimeout(() => {
      rollWaitTimer = null
      const state = get()
      if (state.lastRollEvent?.id !== eventId || state.lastRoll) return
      set({
        lastRoll: estimateRoll(notationToSides(notation)),
        isRollPending: false,
      })
      schedulePlaqueFade()
    }, waitMs)
  },

  completeDiceRoll: (dice, sum, estimated = false) => {
    clearRollTimers()
    set({
      lastRoll: {
        id: nextId("roll"),
        dice,
        sum,
        createdAt: Date.now(),
        // Флаг «≈» едет вместе с результатом: его посчитал не физический мир,
        // а сторожевой таймер /screen (или фолбэк Мастера).
        ...(estimated ? { estimated: true } : {}),
      },
      // Результат пришёл — блокировка кнопки снимается.
      isRollPending: false,
    })
    schedulePlaqueFade()
  },

  clearRoll: () => {
    clearRollTimers()
    set({ lastRoll: null, lastRollEvent: null, isRollPending: false })
  },

  /**
   * Presence sync-сервера: сколько экранов OBS на связи. Значение локальное
   * (в снапшот не едет) и живёт до конца сессии вкладки.
   */
  setSyncScreens: (count) =>
    set({ syncScreens: Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0 }),

  resetEpisode: () => {
    clearStageTimer()
    clearRollTimers()
    set({
      episodeTitle: campaign.title,
      backgrounds: initialBackgrounds,
      sceneGroups: [...actGroups],
      characters: initialCharacters,
      tracks: initialTracks,
      soundpad: initialSoundpad,
      activeBackgroundId: initialBackgrounds[0].id,
      previousBackgroundId: null,
      activeCharacterId: null,
      ...IDLE_STAGE,
      mapTokens: initialMapTokens,
      activeMapId: initialBackgrounds.find((item) => item.isBattlemap)?.id ?? null,
      sceneNotes: initialSceneNotes,
      dicePool: [],
      lastRoll: null,
      lastRollEvent: null,
      isRollPending: false,
      // Новый выпуск — видео с начала и на паузе не стоит.
      videoPlayback: initialVideoPlayback(),
    })
  },

  importEpisode: (file) => {
    clearStageTimer()
    clearRollTimers()
    // Пути из чужой ОС приводим к /assets/... — в сторе живут URL, а не пути
    // Windows (C:\...) или macOS (/Users/...). data-URL и http(s) не трогаем.
    const source = normalizeEpisodeAssets(file)
    set((state) => {
      const backgrounds = source.backgrounds
      const firstBackgroundId = backgrounds[0].id
      // Разделители из файла + порядок сцен под них: библиотека не «поедет».
      const sceneGroups = resolveSceneGroups(backgrounds, source.sceneGroups)
      const orderedBackgrounds = orderBackgroundsByGroups(
        backgrounds,
        sceneGroups
      )
      const hasBackground = (id: string | null | undefined) =>
        Boolean(id && orderedBackgrounds.some((item) => item.id === id))
      const hasCharacter = (id: string | null | undefined) =>
        Boolean(id && source.characters.some((item) => item.id === id))
      const hasMap = (id: string | null | undefined) =>
        Boolean(
          id &&
            orderedBackgrounds.some(
              (item) => item.id === id && item.isBattlemap
            )
        )

      return {
        episodeTitle: source.campaign?.trim()
          ? source.campaign
          : state.episodeTitle,
        backgrounds: orderedBackgrounds,
        sceneGroups,
        characters: source.characters,
        tracks: source.tracks.length > 0 ? source.tracks : state.tracks,
        // Пустой саундпад в файле — не повод стереть уже настроенные звуки
        // (как и треки): плитки живут в панели Мастера, а не в выпуске.
        soundpad:
          (source.soundpad?.length ?? 0) > 0
            ? (source.soundpad ?? [])
            : state.soundpad,
        // Токены без владельца отбрасываем, иначе останутся «висячие» фишки.
        mapTokens: source.mapTokens.filter((token) =>
          source.characters.some(
            (character) => character.id === token.characterId
          )
        ),
        sceneNotes: source.sceneNotes,
        activeBackgroundId: hasBackground(source.activeBackgroundId)
          ? source.activeBackgroundId
          : firstBackgroundId,
        previousBackgroundId: null,
        activeCharacterId: hasCharacter(source.activeCharacterId)
          ? source.activeCharacterId
          : null,
        ...IDLE_STAGE,
        activeMapId: hasMap(source.activeMapId)
          ? source.activeMapId
          : (orderedBackgrounds.find((item) => item.isBattlemap)?.id ?? null),
        dicePool: [],
        lastRoll: null,
        lastRollEvent: null,
        isRollPending: false,
        // Импорт — как новый выпуск: видео-команды прежней сессии не переносим.
        videoPlayback: initialVideoPlayback(),
      }
    })
  },

  applyRemoteState: (remote) =>
    set({
      backgrounds: remote.backgrounds,
      characters: remote.characters,
      activeBackgroundId: remote.activeBackgroundId,
      previousBackgroundId: remote.previousBackgroundId,
      activeCharacterId: remote.activeCharacterId,
      stagePhase: remote.stagePhase,
      stageFromCharacterId: remote.stageFromCharacterId,
      stageToCharacterId: remote.stageToCharacterId,
      mapTokens: remote.mapTokens,
      activeMapId: remote.activeMapId,
      lastRoll: remote.lastRoll,
      lastRollEvent: remote.lastRollEvent,
      isRollPending: remote.isRollPending,
      // Команды плеера Мастера приходят снапшотом: пауза, повтор и перемотка
      // применяются к видео на этом экране тем же кодом, что и в панели.
      videoPlayback: remote.videoPlayback,
    }),
}))
