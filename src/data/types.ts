import type { ElementType } from "react"

/** Иконка Lucide для плейсхолдеров. React-компоненты НЕ попадают в стор (structured clone). */
export type IconComponent = ElementType

/**
 * Название разделителя сцен (акта) в библиотеке фонов и в заметках.
 * Стартовый набор — `actGroups` из seed, но мастер может переименовывать
 * разделители и создавать свои, поэтому тип — просто строка.
 */
export type ActGroup = string

/** Категория токена/персонажа: 4 колонки в панели токенов. */
export type TokenCategory = "hero" | "npc" | "enemy" | "item"

export type Background = {
  id: string
  title: string
  /** Путь к картинке или видео сцены (1920×880). Пустая строка — иконочный плейсхолдер. */
  src: string
  actGroup: ActGroup
  isBattlemap: boolean
  /**
   * Зацикливать видео-сцену (`.mp4`/`.webm`). Значения нет — значит «да»:
   * у картинок настройка смысла не имеет, а файлы выпуска старого формата её
   * просто не знают. Рубильник живёт в плеере Viewport Мастера.
   */
  isLoop?: boolean
}

export type Character = {
  id: string
  name: string
  role: string
  initials: string
  category: TokenCategory
  avatarSrc: string
  fullBodyPngSrc: string
  hp?: { current: number; max: number }
}

export type MapToken = {
  id: string
  characterId: string
  /** Карта местности, на которой стоит токен (у каждой карты своя раскладка) */
  mapId: string
  /** Колонка 0..14 */
  cellX: number
  /** Ряд 0..5 */
  cellY: number
}

export type Track = {
  id: string
  title: string
  artist: string
  duration: string
  tag: string
  /** Аудио как data-URL (пустая строка — трек без файла). На /screen не транслируется. */
  audioSrc: string
  /** Обложка из метаданных MP3 (data-URL). Пустая строка — плитка-заглушка в плейлисте. */
  coverSrc: string
}

/**
 * Слот саундпада: одноразовый звуковой эффект, который играет поверх музыки.
 * Хранит только имя иконки (не React-компонент), поэтому уезжает в файл выпуска.
 */
export type SoundpadSlot = {
  id: string
  /** Короткое название под иконкой: «Взрыв», «Шаги» */
  title: string
  /** Имя иконки из lucide-react — строго из набора `SOUNDPAD_ICON_NAMES` */
  icon: string
  /**
   * Путь к звуку: `/assets/...` в файле выпуска, data-URL — пока файл выбран
   * в панели, но ещё не выгружен в папку `assets`. Пустая строка — звука нет.
   */
  src: string
}

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20

export type SceneNotes = Record<string, string>

/** Фазы двухфазной анимации выхода/выхода персонажа. */
export type StagePhase = "idle" | "leaving" | "entering"

export type RollDie = {
  sides: DieSides
  value: number
}

export type DiceRollResult = {
  id: string
  dice: RollDie[]
  sum: number
  createdAt: number
  /**
   * Итог посчитан локально: экран OBS не ответил, значения случайные (не с физики).
   * В плашке такой результат помечается «≈», чтобы его не приняли за честный бросок.
   */
  estimated?: boolean
}

/**
 * Запрос броска: id растёт при каждом нажатии «LET'S ROLL», dice — нотации
 * (`['1d20','2d6']`). Физику считает экран OBS, результат возвращается обратно.
 */
export type DiceRollEvent = {
  id: number
  dice: string[]
}

/**
 * Живое состояние видео-фона: одно на оба окна. Пауза, повтор и перемотка идут
 * через стор и уезжают на /screen снапшотом, иначе проектор продолжал бы играть
 * «своё» видео и слушал только собственный плеер.
 */
export type VideoPlaybackState = {
  /** Играет (true) или стоит на паузе */
  isPlaying: boolean
  /** Зациклено: кнопка повтора в плеере Мастера */
  isLoop: boolean
  /** Время перемотки в секундах */
  seekTime: number
  /** Метка события перемотки: изменилась — надо выставить currentTime */
  seekId: number
}

/** Срез состояния, транслируемый на экран OBS (только сериализуемые данные). */
export type SyncedEpisode = {
  backgrounds: Background[]
  characters: Character[]
  activeBackgroundId: string
  /** Предыдущая сцена — нужна для fade-перехода на /screen */
  previousBackgroundId: string | null
  activeCharacterId: string | null
  stagePhase: StagePhase
  stageFromCharacterId: string | null
  stageToCharacterId: string | null
  mapTokens: MapToken[]
  activeMapId: string | null
  lastRoll: DiceRollResult | null
  /** Запрос 3D-броска: по нему /screen запускает кубики */
  lastRollEvent: DiceRollEvent | null
  /** Ждём физику с /screen: на экране показывается подложка под кубики */
  isRollPending: boolean
  /** Управление видео-фоном: пауза, повтор, перемотка — для обоих окон сразу */
  videoPlayback: VideoPlaybackState
}

/** Данные выпуска для экспорта/импорта JSON. */
export type EpisodeFile = {
  exportedAt?: string
  campaign?: string
  backgrounds: Background[]
  /** Разделители сцен в порядке отображения (нет в файлах старого формата). */
  sceneGroups?: string[]
  characters: Character[]
  tracks: Track[]
  /** Слоты саундпада (нет в файлах старого формата — тогда пусто) */
  soundpad?: SoundpadSlot[]
  mapTokens: MapToken[]
  sceneNotes: SceneNotes
  activeBackgroundId?: string
  activeCharacterId?: string | null
  activeMapId?: string | null
}
