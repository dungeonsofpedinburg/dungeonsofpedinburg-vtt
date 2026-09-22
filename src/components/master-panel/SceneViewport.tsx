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
  const activeCharacterId = useEpisodeStore((state) => state.activeCharacterId)
  const toggleCharacterOnStage = useEpisodeStore(
    (state) => state.toggleCharacterOnStage
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
          activeCharacterId
            ? "Клик — убрать персонажа со сцены"
            : "Так сцену видят игроки"
        }
        onClick={(event) => {
          // Клик по кнопкам и плееру не считаем: это управление видео, а не
          // «убрать персонажа со сцены».
          if (
            (event.target as HTMLElement).closest("button, [data-scene-player]")
          ) {
            return
          }
          if (activeCharacterId) toggleCharacterOnStage(activeCharacterId)
        }}
        className={cn(
          "group w-full rounded-lg border border-border bg-muted/40 py-4",
          activeCharacterId ? "cursor-pointer" : "cursor-default"
        )}
      >
        {/* Сцена по горизонтали центрируется (mx-auto), плеер прижат к её низу */}
        <div className="relative mx-auto w-fit">
          <SceneStage
            className="aspect-[1440/1080] h-[20vh] rounded-md border border-border"
            interactive
            videoRef={videoRef}
          />

          {isVideo && background ? (
            <div
              data-scene-player
              className={cn(
                "absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 rounded-md border border-border bg-background/90 px-2 py-1 shadow-lg backdrop-blur transition-all duration-300",
                // Спрятан ниже края сцены и не ловит клики; при наведении на
                // Viewport (или фокусе внутри) плавно выезжает вверх.
                "pointer-events-none translate-y-full opacity-0",
                "group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100",
                "focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100"
              )}
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
                className="min-w-24 flex-1"
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

              <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
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
    </div>
  )
}
