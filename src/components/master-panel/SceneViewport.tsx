import { useCallback, useEffect, useRef, useState } from "react"
import { Film, Pause, Play, Repeat } from "lucide-react"
import { SceneStage } from "@/components/master-panel/SceneStage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { formatMediaTime, isVideoSrc } from "@/lib/media"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"

/**
 * Viewport: подпись «Акт • Сцена», сама сцена и выезжающий плеер видео.
 * Клик по сцене убирает персонажа с проектора (кнопки в панели токенов тоже
 * работают). Плеер управляет тем же `<video>`, что стоит на сцене, поэтому
 * пауза и перемотка в превью видны сразу.
 */
export function SceneViewport() {
  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const activeBackgroundId = useEpisodeStore((state) => state.activeBackgroundId)
  const activeCharacterIds = useEpisodeStore((state) => state.activeCharacterIds)
  const clearStage = useEpisodeStore((state) => state.clearStage)
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

  const background = backgrounds.find((item) => item.id === activeBackgroundId)
  const isVideo = isVideoSrc(background?.src)
  const isPlaying = videoPlayback.isPlaying
  const isLoop = videoPlayback.isLoop

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
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {background?.actGroup ?? "Сцена"}
        </span>
        <span className="text-muted-foreground">•</span>
        <span className="truncate text-sm font-medium">
          {background?.title || "Пустая сцена"}
        </span>
        {isVideo ? (
          <Badge variant="secondary" className="ml-auto shrink-0 gap-1">
            <Film />
            видео
          </Badge>
        ) : null}
      </div>

      <div
        role="presentation"
        title={
          activeCharacterIds.length > 0
            ? "Клик — убрать всех персонажей со сцены"
            : "Так сцену видят игроки"
        }
        onClick={(event) => {
          // Клик по кнопкам и плееру не считаем: это управление видео, а не
          // «убрать персонажей со сцены».
          if (
            (event.target as HTMLElement).closest("button, [data-scene-player]")
          ) {
            return
          }
          if (activeCharacterIds.length > 0) clearStage()
        }}
        className={cn(
          "group flex w-full flex-col items-center gap-2 rounded-lg border border-border bg-muted/40 py-2",
          activeCharacterIds.length > 0 ? "cursor-pointer" : "cursor-default"
        )}
      >
        {/*
          Сцена: компактный кадр 4:3 — ровно 10% высоты экрана (`h-[10vh]`), ширина
          считается по пропорции (`w-auto`). Так превью не съедает место у рельса
          персонажей и библиотеки сцен, а фигуры масштабируются от высоты этого
          блока: в маленьком Viewport они выглядят так же, как на /screen.
        */}
        <div className="relative mx-auto aspect-[4/3] h-[10vh] w-auto max-w-full overflow-hidden rounded-lg bg-black">
          <SceneStage className="size-full" interactive videoRef={videoRef} />
        </div>

        {/*
          Плеер видео: узкая полоса ПОД кадром. Внутри 10vh-превью контролы не
          помещаются (ползунок и таймкод шире самой сцены), а под ним есть вся
          ширина колонки. Полоса видна только когда в эфире видео-сцена.
        */}
        {isVideo && background ? (
          <div
            data-scene-player
            className="flex w-full items-center gap-2 rounded-md border border-border bg-background/90 px-2 py-1"
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
