import { useCallback, useRef, useState } from "react"
import type { ChangeEvent, DragEvent } from "react"
import {
  GripVertical,
  ListChecks,
  Music,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react"
import { BatchSelectionBar } from "@/components/master-panel/BatchSelectionBar"
import { TrackDialog } from "@/components/master-panel/TrackDialog"
import { SoundpadPanel } from "@/components/master-panel/SoundpadPanel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { useSoundtrack } from "@/hooks/useSoundtrack"
import { formatDuration, prepareAudioFile } from "@/lib/audio-file"
import { trackToInput } from "@/lib/track"
import { useBatchSelection } from "@/hooks/useBatchSelection"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"

export function SoundtrackTab() {
  const tracks = useEpisodeStore((state) => state.tracks)
  const moveTrack = useEpisodeStore((state) => state.moveTrack)
  const addTrack = useEpisodeStore((state) => state.addTrack)
  const updateTrack = useEpisodeStore((state) => state.updateTrack)
  const removeTrack = useEpisodeStore((state) => state.removeTrack)
  const deleteBatchTracks = useEpisodeStore((state) => state.deleteBatchTracks)

  const mp3InputRef = useRef<HTMLInputElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [notice, setNotice] = useState("")
  const [editTargetId, setEditTargetId] = useState<string | null>(null)

  // Плеер живёт в SoundtrackProvider над вкладками — музыка не глохнет при
  // переключении вкладок. Здесь только UI поверх него.
  const player = useSoundtrack()

  /**
   * Пачечное удаление треков: стор убирает строки, а плеер нужно перевести на
   * первый оставшийся трек, если удалили играющий.
   */
  const deleteTracksBatch = useCallback(
    (ids: string[]) => {
      if (ids.includes(player.currentId)) {
        const remaining = tracks.filter((track) => !ids.includes(track.id))
        player.select(remaining[0]?.id ?? "")
      }
      deleteBatchTracks(ids)
    },
    [deleteBatchTracks, player, tracks]
  )
  const batch = useBatchSelection(deleteTracksBatch)
  const current = player.current
  const editTarget = tracks.find((track) => track.id === editTargetId) ?? null
  const progress = player.duration
    ? [(player.position / player.duration) * 100]
    : [0]
  const volume = [player.volume]

  function handleRemove(trackId: string) {
    removeTrack(trackId)
    // Если убрали играющий трек — плеер встаёт на первый оставшийся.
    if (trackId === player.currentId) {
      const remaining = tracks.filter((track) => track.id !== trackId)
      player.select(remaining[0]?.id ?? "")
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault()
    const sourceId = dragId ?? event.dataTransfer.getData("text/plain")
    setDragId(null)
    setOverId(null)
    if (!sourceId || sourceId === targetId) return
    moveTrack(sourceId, targetId)
  }

  /**
   * Кнопка «Добавить трек» сразу открывает проводник: можно выбрать сразу
   * несколько MP3. Файлы читаются по очереди — так виден прогресс, а название,
   * исполнитель, длительность и обложка берутся из метаданных каждого файла.
   */
  async function handleAddPicked(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (files.length === 0) return

    setIsAdding(true)
    setNotice("")
    const addedIds: string[] = []
    const problems: string[] = []

    for (const [index, file] of files.entries()) {
      setNotice(`Читаю файл ${index + 1} из ${files.length}: ${file.name}`)
      try {
        const prepared = await prepareAudioFile(file)
        addedIds.push(
          addTrack({
            title: prepared.title,
            artist: prepared.artist,
            duration: prepared.duration,
            tag: "Прочее",
            audioSrc: prepared.dataUrl,
            coverSrc: prepared.coverSrc,
          })
        )
        if (prepared.warning) problems.push(prepared.warning)
      } catch (thrown) {
        problems.push(
          `${file.name}: ${thrown instanceof Error ? thrown.message : "не удалось прочитать"}`
        )
      }
      // Отдаём кадр браузеру, иначе прогресс не перерисуется до конца цикла.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    setIsAdding(false)
    // Последний добавленный трек встаёт в плеер, но сам не запускается.
    const lastAddedId = addedIds.at(-1)
    if (lastAddedId) player.select(lastAddedId)
    const summary = `Добавлено треков: ${addedIds.length} из ${files.length}`
    setNotice(
      problems.length > 0 ? `${summary} · ${problems.slice(0, 2).join("; ")}` : summary
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/*
        Саундпад — над плейлистом и без серой подложки. Звуки играет модуль
        `@/lib/sfx-player`, поэтому переход на «Карты» или «Кубики» их не
        обрывает, а музыка при запуске эффекта не глохнет.
      */}
      <SoundpadPanel />
      <Separator />

      {batch.isSelecting ? (
        <BatchSelectionBar
          count={batch.count}
          itemsLabel="Треки"
          onDelete={batch.deleteSelected}
          onCancel={batch.cancel}
        />
      ) : null}

      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Плейлист · {tracks.length}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={isAdding}
          onClick={() => mp3InputRef.current?.click()}
        >
          <Plus />
          {isAdding ? "Читаю файлы…" : "Добавить треки"}
        </Button>
        {/* Кнопка сразу открывает проводник с MP3 — можно выбрать несколько. */}
        <input
          ref={mp3InputRef}
          type="file"
          accept=".mp3,audio/mpeg"
          multiple
          className="hidden"
          onChange={handleAddPicked}
        />
      </div>

      {notice ? (
        <p className="shrink-0 text-xs text-muted-foreground">{notice}</p>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col pr-3">
          {tracks.map((track) => {
            const isCurrent = track.id === player.currentId
            const isDragging = track.id === dragId
            const isOver = track.id === overId
            const isSelected = batch.isSelected(track.id)

            return (
              <ContextMenu key={track.id}>
                <ContextMenuTrigger asChild>
                  <div
                    draggable={!batch.isSelecting}
                    onClick={() => {
                      // В режиме выделения клик по строке отмечает трек, а не
                      // запускает воспроизведение.
                      if (batch.isSelecting) batch.toggle(track.id)
                    }}
                    onDragStart={(event) => {
                      if (batch.isSelecting) return
                      setDragId(track.id)
                      event.dataTransfer.effectAllowed = "move"
                      event.dataTransfer.setData("text/plain", track.id)
                    }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      if (track.id !== dragId) setOverId(track.id)
                    }}
                    onDragLeave={() =>
                      setOverId((value) => (value === track.id ? null : value))
                    }
                    onDrop={(event) => handleDrop(event, track.id)}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverId(null)
                    }}
                    className={cn(
                      "flex items-center gap-3 border-b border-border/60 px-2 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/60",
                      isCurrent && "bg-muted",
                      isDragging && "opacity-60",
                      isOver && "ring-2 ring-ring",
                      batch.isSelecting && "cursor-pointer",
                      isSelected && "bg-accent/40"
                    )}
                  >
                    {batch.isSelecting ? (
                      <Checkbox
                        checked={isSelected}
                        aria-label={`Отметить трек «${track.title}»`}
                        className="pointer-events-none shrink-0"
                      />
                    ) : (
                      <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
                    )}
                    {/* Обложка из метаданных MP3: запуск трека — только по ней.
                        В режиме выделения это просто картинка: клик должен
                        доходить до строки и отмечать трек. */}
                    {batch.isSelecting ? (
                      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
                        {track.coverSrc ? (
                          <img
                            src={track.coverSrc}
                            alt=""
                            draggable={false}
                            className="size-full object-cover"
                          />
                        ) : (
                          <Music className="size-4" />
                        )}
                      </span>
                    ) : (
                    <button
                      type="button"
                      disabled={!track.audioSrc}
                      aria-label={
                        isCurrent && player.isPlaying
                          ? `Пауза: ${track.title}`
                          : `Воспроизвести: ${track.title}`
                      }
                      title={
                        track.audioSrc
                          ? isCurrent && player.isPlaying
                            ? "Пауза"
                            : "Воспроизвести"
                          : "Аудиофайл не загружен"
                      }
                      onClick={() => player.play(track.id)}
                      className="group relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {track.coverSrc ? (
                        <img
                          src={track.coverSrc}
                          alt=""
                          draggable={false}
                          className="size-full object-cover"
                        />
                      ) : (
                        <Music className="size-4" />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity group-hover:opacity-100 group-disabled:opacity-0">
                        {isCurrent && player.isPlaying ? (
                          <Pause className="size-4" />
                        ) : (
                          <Play className="size-4" />
                        )}
                      </span>
                    </button>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {track.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {track.artist}
                      </span>
                    </span>
                    {track.audioSrc ? (
                      <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">
                        файл
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      {track.tag}
                    </Badge>
                    <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                      {track.duration}
                    </span>
                  </div>
                </ContextMenuTrigger>

                <ContextMenuContent className="w-52">
                  <ContextMenuLabel>{track.title}</ContextMenuLabel>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => batch.start(track.id)}>
                    <ListChecks />
                    Выделить несколько
                  </ContextMenuItem>
                  {batch.isSelecting && isSelected ? (
                    <ContextMenuItem
                      variant="destructive"
                      onSelect={batch.deleteSelected}
                    >
                      <Trash2 />
                      Удалить выбранные ({batch.count})
                    </ContextMenuItem>
                  ) : null}
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => setEditTargetId(track.id)}>
                    <Pencil />
                    Редактировать
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    onSelect={() => handleRemove(track.id)}
                  >
                    <Trash2 />
                    Удалить
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })}
        </div>
      </ScrollArea>

      <Card size="sm" className="mt-auto shrink-0 gap-2">
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Предыдущий трек"
              disabled={tracks.length === 0}
              onClick={player.previous}
            >
              <SkipBack />
            </Button>
            <Button
              size="icon-lg"
              onClick={player.toggle}
              aria-label={player.isPlaying ? "Пауза" : "Воспроизвести"}
            >
              {player.isPlaying ? <Pause /> : <Play />}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Следующий трек"
              disabled={tracks.length === 0}
              onClick={player.next}
            >
              <SkipForward />
            </Button>
          </div>

          <div className="min-w-40 flex-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium">
                {current?.title ?? "Плейлист пуст"}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {formatDuration(player.position)} /{" "}
                {player.duration
                  ? formatDuration(player.duration)
                  : current?.duration || "0:00"}
              </span>
            </div>
            <Slider
              value={progress}
              onValueChange={(value) => player.seek(value[0] / 100)}
              max={100}
              step={1}
              aria-label="Позиция трека"
              className="mt-1.5"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={player.repeatLabel}
              title={player.repeatLabel}
              onClick={player.cycleRepeat}
              className={cn(player.repeatMode !== "off" && "text-foreground")}
            >
              {player.repeatMode === "one" ? <Repeat1 /> : <Repeat />}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={player.isMuted ? "Включить звук" : "Выключить звук"}
              onClick={player.toggleMute}
            >
              {player.isMuted ? <VolumeX /> : <Volume2 />}
            </Button>
            <Slider
              value={volume}
              onValueChange={(value) => player.setVolumePercent(value[0])}
              max={100}
              step={1}
              aria-label="Громкость"
              className="w-24"
            />
            <Badge variant="ghost" className="w-10 justify-end">
              {volume[0]}%
            </Badge>
          </div>
        </CardContent>

        <CardFooter className="justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Music className="size-3.5" />
            {current?.audioSrc
              ? "Аудиофайл загружен"
              : "Без аудиофайла — звук не играет"}
          </span>
          <span>
            {player.isPlaying ? "Воспроизведение" : "Пауза"} · кроссфейд 5 с
          </span>
        </CardFooter>
      </Card>

      <TrackDialog
        key={editTargetId ?? "track-edit-none"}
        open={Boolean(editTarget)}
        initial={editTarget ? trackToInput(editTarget) : undefined}
        onOpenChange={(open) => {
          if (!open) setEditTargetId(null)
        }}
        onSubmit={(input) => {
          if (editTarget) updateTrack(editTarget.id, input)
        }}
      />
    </div>
  )
}
