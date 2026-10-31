import { AnimatePresence, motion } from "framer-motion"
import { ImageOff, X } from "lucide-react"
import { useEffect, useRef, useState, type RefObject } from "react"
import { DiceOverlay } from "@/components/dice/DiceOverlay"
import { BattleMapGrid } from "@/components/master-panel/BattleMapGrid"
import { CrossfadeImage, CROSSFADE_MS } from "@/components/master-panel/CrossfadeImage"
import { Button } from "@/components/ui/button"
import { backgroundIcon } from "@/data/seed"
import {
  DEFAULT_CHARACTER_STATE_ID,
  characterFullBodySrc,
  getCharacterActiveState,
  resolveCharacterAppearance,
} from "@/lib/character"
import {
  backgroundStateSrc,
  getBackgroundActiveState,
  isBackgroundBattlemap,
  resolveBackgroundAppearance,
} from "@/lib/background"
import { ROLL_RESULT_TEXT, formatRollBreakdown } from "@/lib/dice"
import { isVideoSrc, shouldSeekVideo } from "@/lib/media"
import { playSfx } from "@/lib/sfx-player"
import { STAGE_RELAYOUT_MS, STAGE_SLIDE_MS, characterStagePosition } from "@/lib/stage"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"
import type { Background, Character } from "@/data/types"

type SceneStageProps = {
  className?: string
  /** В панели мастера можно закрыть результат броска, на /screen — нет. */
  interactive?: boolean
  /**
   * Кто считает 3D-бросок. По умолчанию "master" — кубиков нет: физику ведёт
   * экран OBS ("screen"), а Мастер получает готовый итог для плашки.
   */
  diceRole?: "master" | "screen"
  /**
   * Ссылка на `<video>` активной видео-сцены. Плеер Мастера живёт в Viewport и
   * управляет ровно тем элементом, что видно в превью; на /screen ссылка не нужна.
   */
  videoRef?: RefObject<HTMLVideoElement | null>
  /**
   * Звук появления персонажа: "on" — только панель Мастера. На /screen по
   * умолчанию "off": проектор OBS не должен звучать сам по себе.
   */
  soundRole?: "on" | "off"
}

/**
 * «Резкий» эффект: картинка персонажа крупнее обычного в 3 раза. Выезд снизу
 * общий для обоих эффектов, разница — только в этом масштабе.
 */
export const SHARP_SCALE = 3

/** Стартовый масштаб резкого эффекта: 40% от финального — «выстрел» снизу. */
export const SHARP_START_RATIO = 0.4

/**
 * Одна фигура на сцене: слайд снизу → позиция по горизонтали → масштаб эффекта.
 *
 * Живёт отдельным компонентом, потому что решение «эффект уже сыгран» нужно
 * заморозить на монтировании: `playedAppearanceKeys` обновляется в `useEffect`
 * родителя уже ПОСЛЕ первого рендера фигуры, и реактивное чтение меняло
 * `animate` посреди полёта — Framer Motion retarget-ил sharp-анимацию обратно
 * к `scale: 1` (виден «схлоп»). `useState`-инициализатор выполняется один раз,
 * поэтому здесь снимок стор-состояния на момент mount-а.
 */
function StagedCharacter({
  character,
  index,
  totalCount,
}: {
  character: Character
  index: number
  totalCount: number
}) {
  const activeState = getCharacterActiveState(character)
  const appearance = resolveCharacterAppearance(character, activeState)
  const compositeKey = `${character.id}:${activeState.id}`

  const [skipEffect] = useState(() => {
    const played = useEpisodeStore.getState().playedAppearanceKeys
    return appearance.soundMode === "once" && played.includes(compositeKey)
  })

  const isSharp = appearance.effect === "sharp" && !skipEffect
  const position = characterStagePosition(index, totalCount)
  const fullBodySrc = characterFullBodySrc(character)

  /*
   * Выезд снизу — базовая анимация появления, она играет ВСЕГДА: режим "once"
   * отключает только эффект (масштаб), а не сам слайд.
   */
  const slideProps = {
    initial: { y: "100%" },
    animate: { y: "0%" },
    exit: { y: "100%" },
    transition: { duration: STAGE_SLIDE_MS / 1000, ease: "easeOut" as const },
  }

  /*
   * Масштаб: «sharp» — крупный план (в `SHARP_SCALE` раз больше обычного).
   * Растёт от пола вверх (`origin-bottom`), поэтому видна средняя часть фигуры.
   */
  const scaleProps = isSharp
    ? {
        initial: { scale: SHARP_SCALE * SHARP_START_RATIO },
        animate: { scale: SHARP_SCALE },
        exit: { scale: SHARP_SCALE * SHARP_START_RATIO },
        transition: {
          duration: STAGE_SLIDE_MS / 1000,
          ease: "easeOut" as const,
        },
      }
    : {
        initial: { scale: 1 },
        animate: { scale: 1 },
        exit: { scale: 1 },
      }

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      {...slideProps}
    >
      {/*
        Слот фигуры: квадрат по высоте кадра (80%) — ассеты персонажей обычно
        квадратные PNG, поэтому сторона слота равна его высоте. x: -50%
        центрирует слот на позиции, position — проценты ширины.
      */}
      <motion.div
        className="absolute bottom-0 aspect-square h-[80%] w-auto"
        initial={false}
        animate={{ left: `${position}%`, x: "-50%" }}
        transition={{ duration: STAGE_RELAYOUT_MS / 1000, ease: "easeInOut" }}
      >
        <motion.div className="size-full origin-bottom" {...scaleProps}>
          {fullBodySrc ? (
            <CrossfadeImage
              src={fullBodySrc}
              alt={character.name}
              className="pointer-events-none size-full object-contain object-bottom [image-rendering:high-quality]"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-end rounded-t-full border border-border bg-muted/60 pb-2 text-center">
              <span className="text-xl font-semibold text-muted-foreground">
                {character.initials}
              </span>
              <span className="mt-1 w-full truncate px-2 text-[10px] text-muted-foreground">
                {character.name}
              </span>
            </div>
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

/**
 * Сцена: фон (или сетка карты) → затемнение → до четырёх выезжающих фигур.
 * Кто стоит на сцене, решает стор (`activeCharacterIds`), а вход и уход играет
 * этот компонент: список сравнивается с предыдущим кадром, поэтому анимация
 * работает одинаково в панели Мастера и на /screen (туда список приезжает
 * снапшотом). Так же проигрываются кроссфейды при смене состояния сцены или
 * персонажа — кадр не мигает, прежний просто растворяется.
 */
export function SceneStage({
  className,
  interactive = false,
  diceRole = "master",
  videoRef,
  soundRole = "off",
}: SceneStageProps) {
  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const activeBackgroundId = useEpisodeStore((state) => state.activeBackgroundId)
  const previousBackgroundId = useEpisodeStore(
    (state) => state.previousBackgroundId
  )
  const characters = useEpisodeStore((state) => state.characters)
  const activeCharacterIds = useEpisodeStore((state) => state.activeCharacterIds)
  const lastRoll = useEpisodeStore((state) => state.lastRoll)
  const clearRoll = useEpisodeStore((state) => state.clearRoll)
  const markAppearancePlayed = useEpisodeStore(
    (state) => state.markAppearancePlayed
  )
  const playedAppearanceKeys = useEpisodeStore(
    (state) => state.playedAppearanceKeys
  )

  /*
   * Прошлый кадр сцены: по нему отличаем «персонаж вышел» от «персонаж уже
   * стоял». `null` — компонент только смонтировался, сравнивать не с чем.
   */
  const prevActiveIdsRef = useRef<string[] | null>(null)
  const prevStatesRef = useRef<Record<string, string>>({})
  /*
   * Ключ сцены в эфире (`<id>:<состояние>`): по нему ловим настоящую смену
   * сцены или её состояния. `null` — компонент только смонтировался.
   */
  const prevSceneKeyRef = useRef<string | null>(null)

  const background = backgrounds.find((item) => item.id === activeBackgroundId)

  // Кто стоит на сцене: до четырёх фигур, порядок массива задаёт раскладку.
  const stagedCharacters = activeCharacterIds
    .map((id) => characters.find((item) => item.id === id) ?? null)
    .filter((item): item is Character => item !== null)

  const previousBackground =
    previousBackgroundId && previousBackgroundId !== activeBackgroundId
      ? (backgrounds.find((item) => item.id === previousBackgroundId) ?? null)
      : null

  const isCharacterVisible = stagedCharacters.length > 0

  /**
   * Появление персонажа: сравниваем список сцены с предыдущим кадром. Новый id
   * или смена активного состояния — это «выход», поэтому здесь играет звук
   * (только когда `soundRole === "on"`, то есть в панели Мастера) и ставится
   * отметка «сыграно» для режима "once".
   *
   * Отметку ставим в обоих окнах: если в панели уже играли, на /screen эффект
   * тоже пропускается, и наоборот — «once» ведёт себя одинаково.
   */
  useEffect(() => {
    const isFirstRun = prevActiveIdsRef.current === null
    const prevIds = prevActiveIdsRef.current ?? []
    const prevStates = prevStatesRef.current

    /*
     * Нормализуем id состояния одним правилом: у персонажа без `activeStateId`
     * это «Обычное». Иначе `undefined !== ""` давал ложную «смену состояния» при
     * любом изменении списка сцены — и звук с режимом "always" играл на соседей.
     */
    const activeStateIdOf = (id: string) => {
      const character = characters.find((item) => item.id === id)
      return character?.activeStateId ?? DEFAULT_CHARACTER_STATE_ID
    }

    if (!isFirstRun) {
      const added = activeCharacterIds.filter((id) => !prevIds.includes(id))
      // Смена состояния — тоже появление: «Раненый» выезжает со своим эффектом.
      const stateChanged = activeCharacterIds.filter((id) => {
        const prevState = prevStates[id]
        const current = activeStateIdOf(id)
        return prevState !== undefined && current !== prevState
      })
      const events = new Set([...added, ...stateChanged])

      for (const id of events) {
        const character = characters.find((c) => c.id === id)
        if (!character) continue
        const state = getCharacterActiveState(character)
        const appearance = resolveCharacterAppearance(character, state)
        const key = `${character.id}:${state.id}`
        const hasPlayed = playedAppearanceKeys.includes(key)
        const isOnce = appearance.soundMode === "once"

        // Звук — только в панели Мастера (soundRole === "on").
        if (soundRole === "on" && appearance.soundSrc && (!isOnce || !hasPlayed)) {
          playSfx(appearance.soundSrc)
        }
        if (!hasPlayed) markAppearancePlayed(key)
      }
    }

    prevActiveIdsRef.current = [...activeCharacterIds]
    prevStatesRef.current = Object.fromEntries(
      activeCharacterIds.map((id) => [id, activeStateIdOf(id)])
    )
  }, [
    activeCharacterIds,
    characters,
    soundRole,
    playedAppearanceKeys,
    markAppearancePlayed,
  ])

  /**
   * Появление сцены: сменился эфирный кадр (`activeBackgroundId`) или состояние
   * активной сцены — играем звук и ставим отметку «сыграно».
   *
   * Отличие от персонажей: **первый рендер не звучит**. Уже стоящая сцена при
   * монтировании — это восстановление кадра (F5 на `/screen`, открытие панели),
   * а не появление; иначе каждый перезапуск дёргал бы звук.
   */
  useEffect(() => {
    const current = backgrounds.find((item) => item.id === activeBackgroundId)
    if (!current) return
    const state = getBackgroundActiveState(current)
    const key = `${current.id}:${state.id}`
    const prevKey = prevSceneKeyRef.current
    prevSceneKeyRef.current = key
    if (prevKey === key) return
    if (prevKey === null) return

    const appearance = resolveBackgroundAppearance(current, state)
    const isOnce = appearance.soundMode === "once"
    const hasPlayed = playedAppearanceKeys.includes(key)

    // Звук — только в панели Мастера: на /screen `soundRole` = "off".
    if (soundRole === "on" && appearance.soundSrc && (!isOnce || !hasPlayed)) {
      playSfx(appearance.soundSrc)
    }
    if (!hasPlayed) markAppearancePlayed(key)
  }, [
    activeBackgroundId,
    backgrounds,
    soundRole,
    playedAppearanceKeys,
    markAppearancePlayed,
  ])

  // Слои сцен: уходящая (fade-out) + текущая (fade-in) — тот же приём, что на /screen.
  // Ключ — только id сцены: состояние меняется внутри слоя, чтобы кроссфейд
  // картинки проигрывался на месте, а не через пересоздание слоя.
  const backgroundLayers: { background: Background; leaving: boolean }[] = []
  if (previousBackground) {
    backgroundLayers.push({ background: previousBackground, leaving: true })
  }
  if (background) {
    backgroundLayers.push({ background, leaving: false })
  }

  return (
    <div className={cn("relative overflow-hidden bg-background", className)}>
      {backgroundLayers.map((layer) => (
        <SceneLayer
          key={layer.background.id}
          background={layer.background}
          leaving={layer.leaving}
          showHint={interactive}
          // Ссылку на видео отдаём только активному слою: уходящая сцена в
          // переходе — фон затухания, плеер ею не управляет.
          videoRef={layer.leaving ? undefined : videoRef}
        />
      ))}

      {/* Пустой выпуск: сцен нет — показываем подсказку вместо чёрного поля.
          На /screen её нет: там важна чистая прозрачность для OBS. */}
      {backgroundLayers.length === 0 && interactive ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/40 text-center">
          <ImageOff className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">Сцена не выбрана</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Добавьте сцену в библиотеке слева — она сразу появится в эфире
          </p>
        </div>
      ) : null}

      {/* Затемнение идёт поверх фона И поверх сетки карты */}
      <div
        className={cn(
          "absolute inset-0 bg-black/30 backdrop-brightness-75 transition-all duration-500",
          isCharacterVisible ? "opacity-100" : "opacity-0"
        )}
      />

      {/*
        Фигуры на сцене: каждая на своей позиции в процентах ширины
        (`characterStagePositions`: 1 → 50%, 2 → 35/65%, 3 → 25/50/75%,
        4 → 18/38/62/82%). Позиция едет анимацией, поэтому при добавлении или
        уходе одного героя остальные плавно разъезжаются; вход — выезд снизу,
        уход — задвигание вниз (AnimatePresence держит фигуру до конца анимации).
        initial={false}: при открытии /screen никто не выезжает заново.

        Слой занимает весь кадр (`absolute inset-0`), поэтому высота фигуры в
        процентах считается от высоты СЦЕНЫ, а не от натурального размера
        картинки: без этого высота не разрешалась и иллюстрация вылезала
        гигантской (особенно в маленьком Viewport Мастера).
      */}
      <AnimatePresence initial={false}>
        {stagedCharacters.map((character, index) => (
          <StagedCharacter
            key={character.id}
            character={character}
            index={index}
            totalCount={stagedCharacters.length}
          />
        ))}
      </AnimatePresence>

      {/* 3D-кубики: слой поверх персонажей, а итог броска — на нижней части подложки */}
      {diceRole === "screen" ? <DiceOverlay /> : null}

      {/* Итог показываем только в панели Мастера: кубиков и подложки здесь нет,
          поэтому строка встаёт строго по центру сцены. На /screen итог рисует
          DiceOverlay — крупным кеглем на нижних 20% серой подложки. */}
      {lastRoll && diceRole !== "screen" ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex animate-in items-center justify-center fade-in duration-300">
          <span className={cn(ROLL_RESULT_TEXT, "text-3xl")}>
            {formatRollBreakdown(lastRoll.dice, lastRoll.sum, lastRoll.estimated)}
          </span>
        </div>
      ) : null}

      {lastRoll && interactive ? (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Убрать результат"
          onClick={clearRoll}
          className="absolute top-2 right-2 z-50 opacity-70"
        >
          <X />
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Один слой сцены: карта местности, видео, картинка или подсказка для пустой сцены.
 */
function SceneLayer({
  background,
  leaving,
  showHint,
  videoRef,
}: {
  background: Background
  leaving: boolean
  showHint: boolean
  videoRef?: RefObject<HTMLVideoElement | null>
}) {
  const Icon = backgroundIcon(background.id)
  // Эфир рисует активное состояние сцены: «Обычное» — это базовый src сцены.
  const src = backgroundStateSrc(background)
  const isVideo = isVideoSrc(src)
  // Пауза, повтор и перемотка видео: одно состояние на оба окна. Мастер меняет
  // его из плеера, /screen получает снапшотом — и оба применяют здесь.
  const { isPlaying, isLoop, seekId, seekTime } = useEpisodeStore(
    (state) => state.videoPlayback
  )

  // Своя ссылка на элемент нужна всегда: у /screen плеера нет, а команды из
  // стора обязаны применяться к тому же самому <video>.
  const ownVideoRef = useRef<HTMLVideoElement | null>(null)
  const videoNode = videoRef ?? ownVideoRef

  /**
   * Кроссфейд смены кадра. Подмена `src` у одного и того же <img> мигала бы
   * чёрным, поэтому прежний кадр (картинка или видео) ещё растворяется поверх
   * нового: так переключение состояния сцены — «Обычное» → «Ночь» — идёт плавно.
   */
  const [staleMedia, setStaleMedia] = useState<{
    src: string
    isVideo: boolean
  } | null>(null)
  const previousMedia = useRef({ src, isVideo })
  useEffect(() => {
    const previous = previousMedia.current
    previousMedia.current = { src, isVideo }
    if (!previous.src || previous.src === src) return
    setStaleMedia(previous)
    const timer = setTimeout(() => setStaleMedia(null), CROSSFADE_MS)
    return () => clearTimeout(timer)
  }, [isVideo, src])

  /**
   * Пауза и возобновление. Уходящий слой (переход между сценами) команд не
   * слушает: это фон затухания, дёргать его из плеера незачем.
   */
  useEffect(() => {
    const video = videoNode.current
    if (!video || !isVideo || leaving) return
    if (isPlaying) void video.play().catch(() => {})
    else video.pause()
  }, [isPlaying, isVideo, leaving, src, videoNode])

  /** Повтор: держим свойство элемента в согласии со стором. */
  useEffect(() => {
    const video = videoNode.current
    if (!video || leaving) return
    video.loop = isLoop
  }, [isLoop, leaving, src, videoNode])

  /**
   * Перемотка приходит событием: `seekId` — метка команды, `seekTime` — её
   * значение. Мелкие расхождения (< 0.3 с) игнорируем, чтобы текущий кадр не
   * дёргался на каждой команде паузы.
   */
  useEffect(() => {
    const video = videoNode.current
    if (!video || !isVideo || leaving) return
    if (shouldSeekVideo(video.currentTime, seekTime)) {
      video.currentTime = seekTime
    }
    // Зависимость только от метки: смена времени без нового события — не команда.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekId, leaving])

  return (
    <div
      className={cn(
        "absolute inset-0",
        leaving
          ? "pointer-events-none animate-out fade-out duration-500 fill-mode-forwards"
          : "animate-in fade-in duration-500"
      )}
    >
      {/* Прежний кадр сцены: пока новый проявляется, этот растворяется */}
      {staleMedia ? (
        staleMedia.isVideo ? (
          <video
            key={`stale-${staleMedia.src}`}
            src={staleMedia.src}
            muted
            playsInline
            preload="auto"
            className="pointer-events-none absolute inset-0 size-full animate-out object-cover fade-out fill-mode-forwards"
            style={{ animationDuration: `${CROSSFADE_MS}ms` }}
          />
        ) : (
          <img
            key={`stale-${staleMedia.src}`}
            src={staleMedia.src}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full animate-out object-cover fade-out fill-mode-forwards"
            style={{ animationDuration: `${CROSSFADE_MS}ms` }}
          />
        )
      ) : null}

      {isVideo ? (
        <video
          // Ключ по пути: смена сцены или состояния пересоздаёт элемент, поэтому
          // проявление и автоплей играют заново — на превью и на /screen одинаково.
          key={src}
          ref={videoNode}
          src={src}
          // Автоплей нужен только для первого кадра: состояние из стора
          // применяется эффектами выше (пауза приедет сразу после монтирования).
          autoPlay
          playsInline
          // Фон не перебивает саундтрек: звук у видео-сцены всегда выключен.
          muted
          loop={isLoop}
          className="absolute inset-0 size-full animate-in object-cover fade-in"
          style={{ animationDuration: `${CROSSFADE_MS}ms` }}
        />
      ) : src ? (
        <img
          key={src}
          src={src}
          alt={background.title}
          className="absolute inset-0 size-full animate-in object-cover fade-in"
          style={{ animationDuration: `${CROSSFADE_MS}ms` }}
        />
      ) : showHint ? (
        // Заглушка-подсказка живёт только в панели Мастера. На /screen вместо
        // серой плашки остаётся монолитно чёрное поле: ObsScreen красит сцену
        // и страницу в bg-black, поэтому на проекторе нет светлых пятен.
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/40 text-center">
          {Icon ? (
            <Icon className="size-8 text-muted-foreground" />
          ) : (
            <ImageOff className="size-8 text-muted-foreground" />
          )}
          <p className="text-sm font-medium">
            {background.title || "Пустая сцена"}
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Двойной клик по миниатюре в библиотеке — добавить картинку сцены
          </p>
        </div>
      ) : null}

      {/* Карта местности: сетка рисуется ПОВЕРХ картинки, а не вместо неё.
          Решает активное состояние сцены: «Разрушенная» может быть картой. */}
      {isBackgroundBattlemap(background) ? (
        <BattleMapGrid mapId={background.id} className="absolute inset-0" />
      ) : null}
    </div>
  )
}
