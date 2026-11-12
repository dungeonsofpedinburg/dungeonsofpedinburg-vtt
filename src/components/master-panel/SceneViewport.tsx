import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { Film, Pause, Play, Repeat, UserMinus, Users } from "lucide-react"
import { SceneStage } from "@/components/master-panel/SceneStage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { formatMediaTime, isVideoSrc } from "@/lib/media"
import {
  MAX_STAGE_CHARACTERS,
  heroCharacters,
  heroesOnStage,
  shouldShowRemoveLabel,
} from "@/lib/stage"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"

/** Задержка между выходом/уходом соседних героев при «Команде»/«Убрать». */
export const HEROES_STAGGER_MS = 500

/** Пределы и старт высоты превью в vh: ширина считается от 4:3. */
const MIN_VIEWPORT_HEIGHT_VH = 5
const MAX_VIEWPORT_HEIGHT_VH = 60
const DEFAULT_VIEWPORT_HEIGHT_VH = 10

/**
 * Viewport: подпись «Акт • Сцена», сама сцена и выезжающий плеер видео.
 * Клик по сцене убирает персонажа с проектора (кнопки в панели токенов тоже
 * работают). Плеер управляет тем же `<video>`, что стоит на сцене, поэтому
 * пауза и перемотка в превью видны сразу.
 */
type SceneViewportProps = {
  /** Стартовая высота кадра в vh: в новой раскладке центр выше прежних 10vh. */
  initialHeightVh?: number
}

export function SceneViewport({
  initialHeightVh = DEFAULT_VIEWPORT_HEIGHT_VH,
}: SceneViewportProps) {
  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const activeBackgroundId = useEpisodeStore((state) => state.activeBackgroundId)
  const characters = useEpisodeStore((state) => state.characters)
  const activeCharacterIds = useEpisodeStore((state) => state.activeCharacterIds)
  const clearStage = useEpisodeStore((state) => state.clearStage)
  const addCharacterToStage = useEpisodeStore(
    (state) => state.addCharacterToStage
  )
  const removeCharacterFromStage = useEpisodeStore(
    (state) => state.removeCharacterFromStage
  )
  // Пауза, повтор и перемотка живут в сторе: те же команды применяет /screen.
  const videoPlayback = useEpisodeStore((state) => state.videoPlayback)
  const toggleVideoPlaying = useEpisodeStore(
    (state) => state.toggleVideoPlaying
  )
  const setVideoLoop = useEpisodeStore((state) => state.setVideoLoop)
  const seekVideo = useEpisodeStore((state) => state.seekVideo)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  // Пока идёт пачка выходов/уходов с шагом, кнопка выключена: иначе второй клик
  // наложит новые таймеры поверх старых и герои начнут прыгать туда-обратно.
  const [isAnimatingHeroes, setIsAnimatingHeroes] = useState(false)
  const animatingRef = useRef(false)
  /*
   * Высота превью — локальное состояние панели: /screen о ней не знает, в
   * снапшот она не уходит. Меряем не `getBoundingClientRect()` (сцена на
   * /screen масштабируется transform-ом), а храним целевую высоту в vh.
   */
  const [viewportHeightVh, setViewportHeightVh] = useState(initialHeightVh)
  const startYRef = useRef(0)
  const startHeightRef = useRef(initialHeightVh)
  const [isResizing, setIsResizing] = useState(false)

  const background = backgrounds.find((item) => item.id === activeBackgroundId)
  const isVideo = isVideoSrc(background?.src)
  const isPlaying = videoPlayback.isPlaying
  const isLoop = videoPlayback.isLoop

  // Герои шоу и герои на сцене: NPC, противники и предметы лейбл не двигают,
  // хотя слоты сцены занимают наравне с героями.
  const heroes = heroCharacters(characters)
  const heroesOnStageIds = heroesOnStage(activeCharacterIds, characters)
  const showRemoveLabel = shouldShowRemoveLabel({
    heroesOnStageCount: heroesOnStageIds.length,
    totalHeroes: heroes.length,
  })
  const canShowCommandButton = heroes.length > 0

  // Слушатели навешиваем на конкретный элемент: при смене сцены React пересоздаёт
  // `<video>` (ключ по пути), поэтому эффект следит ещё и за src. Состояние
  // воспроизведения берём из стора, а здесь нужны только таймкод и длительность —
  // их синхронизировать на /screen не нужно.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const syncTime = () => setPosition(video.currentTime || 0)
    const syncDuration = () =>
      setDuration(Number.isFinite(video.duration) ? video.duration : 0)

    video.addEventListener("timeupdate", syncTime)
    video.addEventListener("seeked", syncTime)
    video.addEventListener("loadedmetadata", syncDuration)
    video.addEventListener("durationchange", syncDuration)
    // Новую сцену открываем с нуля: таймкод берём сразу после монтирования.
    syncTime()
    syncDuration()

    return () => {
      video.removeEventListener("timeupdate", syncTime)
      video.removeEventListener("seeked", syncTime)
      video.removeEventListener("loadedmetadata", syncDuration)
      video.removeEventListener("durationchange", syncDuration)
    }
  }, [isVideo, background?.src])

  /** Перемотка: ползунок двигает превью, а команда уходит в стор на отпускании. */
  const previewSeek = useCallback(
    (ratio: number) => {
      if (duration <= 0) return
      setPosition(ratio * duration)
    },
    [duration]
  )

  const commitSeek = useCallback(
    (ratio: number) => {
      if (duration <= 0) return
      const time = ratio * duration
      setPosition(time)
      seekVideo(time)
    },
    [duration, seekVideo]
  )
  /*
   * Drag ручки ресайза — тот же приём, что в `useGridDrop`: старт по
   * `pointerdown` (кнопка мыши, `setPointerCapture`), дальше `pointermove` и
   * `pointerup` слушаются на `window`, поэтому курсор может уйти за пределы
   * ручки, и жест всё равно корректно завершится.
   */
  function handleResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    startYRef.current = event.clientY
    startHeightRef.current = viewportHeightVh
    setIsResizing(true)
  }

  useEffect(() => {
    if (!isResizing) return
    const previousCursor = document.body.style.cursor
    const previousSelect = document.body.style.userSelect
    document.body.style.cursor = "ns-resize"
    document.body.style.userSelect = "none"

    function handleMove(event: PointerEvent) {
      // Дельту переводим в vh от высоты окна: ровно та же единица, что в style.
      const deltaVh =
        ((event.clientY - startYRef.current) / window.innerHeight) * 100
      const next = Math.min(
        Math.max(startHeightRef.current + deltaVh, MIN_VIEWPORT_HEIGHT_VH),
        MAX_VIEWPORT_HEIGHT_VH
      )
      setViewportHeightVh(Math.round(next * 10) / 10) // шаг 0.1 vh
    }

    function handleEnd() {
      setIsResizing(false)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleEnd)
    window.addEventListener("pointercancel", handleEnd)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleEnd)
      window.removeEventListener("pointercancel", handleEnd)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousSelect
    }
  }, [isResizing])

  /**
   * «Команда»: выводим героев по одному с шагом в полсекунды — SceneStage видит
   * каждое изменение `activeCharacterIds` и проигрывает выезд для каждого.
   * Один общий `set` всем массивом сломал бы эту прогрессию.
   */
  function handleAddHeroes() {
    if (animatingRef.current) return
    // Сколько слотов свободно: текущий состав сцены может содержать не-героев.
    const freeSlots = MAX_STAGE_CHARACTERS - activeCharacterIds.length
    if (freeSlots <= 0) return
    const heroesToAdd = heroes.filter(
      (hero) => !activeCharacterIds.includes(hero.id)
    )
    const adding = heroesToAdd.slice(0, freeSlots)
    if (adding.length === 0) return

    animatingRef.current = true
    setIsAnimatingHeroes(true)
    adding.forEach((hero, index) => {
      window.setTimeout(
        () => addCharacterToStage(hero.id),
        index * HEROES_STAGGER_MS
      )
    })
    window.setTimeout(() => {
      animatingRef.current = false
      setIsAnimatingHeroes(false)
    }, adding.length * HEROES_STAGGER_MS)
  }

  /** «Убрать»: последний вышедший герой уходит первым — обратный порядок. */
  function handleRemoveHeroes() {
    if (animatingRef.current) return
    const current = heroesOnStage(activeCharacterIds, characters)
    // Обратный порядок: последний вышедший уходит первым.
    const removing = [...current].reverse()
    if (removing.length === 0) return

    animatingRef.current = true
    setIsAnimatingHeroes(true)
    removing.forEach((id, index) => {
      window.setTimeout(
        () => removeCharacterFromStage(id),
        index * HEROES_STAGGER_MS
      )
    })
    window.setTimeout(() => {
      animatingRef.current = false
      setIsAnimatingHeroes(false)
    }, removing.length * HEROES_STAGGER_MS)
  }

  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex min-w-0 items-center gap-2 px-1">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {background?.actGroup ?? "Сцена"}
        </span>
        <span className="text-muted-foreground">•</span>
        <span className="truncate text-sm font-medium">
          {background?.title || "Пустая сцена"}
        </span>
        {/*
          Правая группа фиксированной ширины: бейдж «видео» и кнопка «Команда» /
          «Убрать» не сжимают название сцены — оно уходит в троеточие.
        */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {isVideo ? (
            <Badge variant="secondary" className="gap-1">
              <Film />
              видео
            </Badge>
          ) : null}
          {canShowCommandButton ? (
            <Button
              size="sm"
              variant={showRemoveLabel ? "outline" : "ghost"}
              data-command-button
              disabled={isAnimatingHeroes}
              title={
                showRemoveLabel
                  ? "Убрать всех героев со сцены"
                  : "Вывести всех героев на сцену"
              }
              onClick={showRemoveLabel ? handleRemoveHeroes : handleAddHeroes}
            >
              {showRemoveLabel ? <UserMinus /> : <Users />}
              {showRemoveLabel ? "Убрать" : "Команда"}
            </Button>
          ) : null}
        </div>
      </div>

      <div
        role="presentation"
        title={
          activeCharacterIds.length > 0
            ? "Клик — убрать всех персонажей со сцены"
            : "Так сцену видят игроки"
        }
        onClick={(event) => {
          // Клик по кнопкам, плееру и ручке ресайза не считаем: это управление
          // видео и высотой превью, а не «убрать персонажей со сцены».
          if (
            (event.target as HTMLElement).closest(
              "button, [data-scene-player], [data-viewport-resize]"
            )
          ) {
            return
          }
          if (activeCharacterIds.length > 0) clearStage()
        }}
        className={cn(
          "group flex w-full flex-col items-center gap-2",
          activeCharacterIds.length > 0 ? "cursor-pointer" : "cursor-default"
        )}
      >
        {/*
          Сцена: кадр 4:3, высоту которого задаёт ручка ресайза внизу (в style,
          в vh), ширина считается по пропорции (`w-auto`). Так превью не съедает
          место у рельса персонажей и библиотеки сцен, а фигуры масштабируются от
          высоты этого блока: в маленьком Viewport они выглядят так же, как на
          /screen.
        */}
        <div
          className="relative mx-auto aspect-[4/3] w-auto max-w-full overflow-hidden rounded-lg bg-black"
          style={{ height: `${viewportHeightVh}vh` }}
        >
          <SceneStage className="size-full" interactive videoRef={videoRef} soundRole="on" />

          {/*
            Ручка ресайза сидит ровно на нижней границе серой подложки превью
            (последний ребёнок — поверх SceneStage). `touch-none` нужен, чтобы на
            тач-устройствах жест не перехватил скролл страницы.
          */}
          <div
            data-viewport-resize
            role="separator"
            aria-orientation="horizontal"
            aria-label="Растянуть превью по высоте"
            title="Потяните, чтобы изменить высоту превью"
            onPointerDown={handleResizePointerDown}
            onClick={(event) => event.stopPropagation()}
            className="absolute inset-x-0 bottom-0 z-20 flex h-3 cursor-ns-resize items-end justify-center pb-0.5 touch-none"
          >
            <span
              aria-hidden
              className={cn(
                "pointer-events-none h-1 w-10 rounded-full bg-foreground/40 transition-colors",
                isResizing ? "bg-foreground" : "group-hover:bg-foreground/70"
              )}
            />
          </div>
        </div>

        {/*
          Плеер видео: узкая полоса ПОД кадром. Внутри самого превью контролы не
          помещаются (ползунок и таймкод шире самой сцены), а под ним есть вся
          ширина колонки. Полоса видна только когда в эфире видео-сцена.
        */}
        {isVideo && background ? (
          <div
            data-scene-player
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2 py-1"
          >
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={isPlaying ? "Пауза видео" : "Воспроизвести видео"}
              title={
                isPlaying
                  ? "Пауза (остановит видео и на экране OBS)"
                  : "Воспроизвести (возобновит видео и на экране OBS)"
              }
              onClick={toggleVideoPlaying}
            >
              {isPlaying ? <Pause /> : <Play />}
            </Button>

            <Slider
              className="min-w-0 flex-1"
              value={[duration > 0 ? (position / duration) * 100 : 0]}
              // Во время перетаскивания двигаем только превью, а команда
              // перемотки уходит в стор на отпускании: так /screen не получает
              // поток снапшотов на каждый пиксель ползунка.
              onValueChange={(value) => previewSeek(value[0] / 100)}
              onValueCommit={(value) => commitSeek(value[0] / 100)}
              max={100}
              step={0.1}
              aria-label="Перемотка видео"
            />

            <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {formatMediaTime(position)} / {formatMediaTime(duration)}
            </span>

            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={
                isLoop ? "Выключить повтор видео" : "Включить повтор видео"
              }
              title={
                isLoop
                  ? "Повтор включён — видео идёт по кругу (и на экране OBS)"
                  : "Повтор выключен — видео остановится в конце (и на экране OBS)"
              }
              onClick={() => setVideoLoop(!isLoop)}
              className={cn(isLoop && "text-amber-400 hover:text-amber-300")}
            >
              <Repeat />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
