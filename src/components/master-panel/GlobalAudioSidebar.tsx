import { useEffect, useRef, useState } from "react"
import type { ChangeEvent, DragEvent } from "react"
import {
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
import { SoundpadSlotDialog } from "@/components/master-panel/SoundpadSlotDialog"
import { TrackDialog } from "@/components/master-panel/TrackDialog"
import { soundpadIcon } from "@/components/master-panel/soundpadIcons"
import { Button } from "@/components/ui/button"
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
import { prepareAudioFile } from "@/lib/audio-file"
import { trackToInput } from "@/lib/track"
import { playSfx } from "@/lib/sfx-player"
import { cn } from "@/lib/utils"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import type { SoundpadSlot, Track } from "@/data/types"

/** Сколько держится подсветка плитки эффекта после нажатия, мс. */
const SLOT_FLASH_MS = 320

/**
 * Общие классы квадратной плитки: звуки саундпада и треки выглядят одинаково —
 * узкая колонка требует одинаковых квадратов, иначе ничего не помещается.
 */
const TILE_CLASS =
  "flex aspect-square w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-border bg-card px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"

/**
 * Глобальная аудио-панель: закреплена справа и видна при любой открытой вкладке.
 * Сверху — саундпад (одноразовые эффекты поверх музыки), ниже — плейлист с
 * обложками, внизу — компактный транспорт.
 *
 * Плеер живёт в `SoundtrackProvider` над панелями, поэтому музыка не глохнет при
 * переключении вкладок; эффекты играет модуль `@/lib/sfx-player` — у него свои
 * `<audio>`, и звук не перебивает саундтрек.
 */
export function GlobalAudioSidebar() {
  const tracks = useEpisodeStore((state) => state.tracks)
  const soundpad = useEpisodeStore((state) => state.soundpad)
  const addSoundpadSlot = useEpisodeStore((state) => state.addSoundpadSlot)
  const updateSoundpadSlot = useEpisodeStore(
    (state) => state.updateSoundpadSlot
  )
  const removeSoundpadSlot = useEpisodeStore(
    (state) => state.removeSoundpadSlot
  )
  const moveTrack = useEpisodeStore((state) => state.moveTrack)
  const addTrack = useEpisodeStore((state) => state.addTrack)
  const updateTrack = useEpisodeStore((state) => state.updateTrack)
  const removeTrack = useEpisodeStore((state) => state.removeTrack)

  const player = useSoundtrack()

  const [isCreatingSfx, setIsCreatingSfx] = useState(false)
  const [editingSfxId, setEditingSfxId] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [isAddingTracks, setIsAddingTracks] = useState(false)
  const [notice, setNotice] = useState("")
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)
  const [dragTrackId, setDragTrackId] = useState<string | null>(null)
  const [overTrackId, setOverTrackId] = useState<string | null>(null)

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mp3InputRef = useRef<HTMLInputElement>(null)

  // Таймер подсветки живёт дольше нажатия — снимаем его при уходе со страницы.
  useEffect(
    () => () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    },
    []
  )

  const editingSlot = soundpad.find((slot) => slot.id === editingSfxId) ?? null
  const editingTrack =
    tracks.find((track) => track.id === editingTrackId) ?? null

  /** Клик по плитке эффекта: звук уходит в глобальный плеер, плитка вспыхивает. */
  function handlePlaySfx(slot: SoundpadSlot) {
    if (!playSfx(slot.src)) return
    setFlashId(slot.id)
    if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => {
      flashTimer.current = null
      setFlashId(null)
    }, SLOT_FLASH_MS)
  }

  /** Клик по треку: играющий встаёт на паузу, любой другой включается с кроссфейдом. */
  function handlePlayTrack(track: Track) {
    if (track.id === player.currentId) {
      player.toggle()
      return
    }
    player.select(track.id)
  }

  /** Удаление трека: если убрали играющий, плеер встаёт на первый оставшийся. */
  function handleRemoveTrack(trackId: string) {
    removeTrack(trackId)
    if (trackId === player.currentId) {
      const remaining = tracks.filter((track) => track.id !== trackId)
      player.select(remaining[0]?.id ?? "")
    }
  }

  /** Сортировка перетаскиванием: порядок плейлиста хранит стор. */
  function handleTrackDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault()
    const sourceId = dragTrackId ?? event.dataTransfer.getData("text/plain")
    setDragTrackId(null)
    setOverTrackId(null)
    if (!sourceId || sourceId === targetId) return
    moveTrack(sourceId, targetId)
  }

  /**
   * Кнопка «+» сразу открывает проводник: можно выбрать несколько MP3. Файлы
   * читаются по очереди — так виден прогресс, а название, исполнитель,
   * длительность и обложка берутся из метаданных каждого файла.
   */
  async function handleTracksPicked(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (files.length === 0) return

    setIsAddingTracks(true)
    setNotice("")
    const addedIds: string[] = []
    const problems: string[] = []

    for (const [index, file] of files.entries()) {
      setNotice(`Читаю ${index + 1} из ${files.length}`)
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

    setIsAddingTracks(false)
    // Последний добавленный трек встаёт в плеер, но сам не запускается.
    const lastAddedId = addedIds.at(-1)
    if (lastAddedId) player.select(lastAddedId)
    setNotice(
      problems.length > 0
        ? `Добавлено: ${addedIds.length} из ${files.length} · ${problems[0]}`
        : `Добавлено: ${addedIds.length} из ${files.length}`
    )
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border pr-0.5 pl-2">
      {/* --- Саундпад: одноразовые эффекты --- */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <span className="flex items-center gap-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          <Volume2 className="size-3" />
          Звуки
        </span>

        <ScrollArea className="max-h-[32vh]">
          <div className="flex flex-col gap-1.5 pr-1">
            {soundpad.map((slot) => {
              const Icon = soundpadIcon(slot.icon)
              const isFlashing = slot.id === flashId

              return (
                <ContextMenu key={slot.id}>
                  <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      title={slot.title}
                      onClick={() => handlePlaySfx(slot)}
                      className={cn(
                        TILE_CLASS,
                        isFlashing &&
                          "border-primary bg-accent text-foreground ring-2 ring-primary"
                      )}
                    >
                      <Icon className="size-5 shrink-0" />
                      <span className="w-full truncate px-1 text-center text-[11px] text-muted-foreground">
                        {slot.title}
                      </span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuLabel className="truncate">
                      {slot.title}
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => setEditingSfxId(slot.id)}>
                      <Pencil />
                      Редактировать
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      onSelect={() => removeSoundpadSlot(slot.id)}
                    >
                      <Trash2 />
                      Удалить
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}

            {/* Пустая плитка: открывает диалог звука (иконка + файл). */}
            <button
              type="button"
              onClick={() => setIsCreatingSfx(true)}
              title="Добавить звук"
              aria-label="Добавить звук"
              className={cn(TILE_CLASS, "border-2 border-dashed")}
            >
              <Plus className="size-5" />
            </button>
          </div>
        </ScrollArea>
      </div>

      <Separator className="my-3" />

      {/* --- Плейлист: треки выглядят так же, как плитки звуков --- */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          <Music className="size-3" />
          Музыка
        </span>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1.5 pr-1">
            {tracks.map((track) => {
              const isCurrent = track.id === player.currentId
              const isOver = track.id === overTrackId

              return (
                <ContextMenu key={track.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      draggable
                      onDragStart={(event) => {
                        setDragTrackId(track.id)
                        event.dataTransfer.effectAllowed = "move"
                        event.dataTransfer.setData("text/plain", track.id)
                      }}
                      onDragOver={(event) => {
                        event.preventDefault()
                        if (track.id !== dragTrackId) setOverTrackId(track.id)
                      }}
                      onDragLeave={() =>
                        setOverTrackId((value) =>
                          value === track.id ? null : value
                        )
                      }
                      onDrop={(event) => handleTrackDrop(event, track.id)}
                      onDragEnd={() => {
                        setDragTrackId(null)
                        setOverTrackId(null)
                      }}
                      className={cn("cursor-grab", isOver && "ring-2 ring-ring")}
                    >
                      <button
                        type="button"
                        title={track.title}
                        onClick={() => handlePlayTrack(track)}
                        className={cn(
                          TILE_CLASS,
                          // Играющий трек подсвечен и мягко пульсирует рамкой.
                          isCurrent &&
                            player.isPlaying &&
                            "animate-pulse border-primary text-foreground ring-2 ring-primary",
                          isCurrent &&
                            !player.isPlaying &&
                            "border-primary text-foreground"
                        )}
                      >
                        {track.coverSrc ? (
                          <img
                            src={track.coverSrc}
                            alt={track.title}
                            draggable={false}
                            className="size-8 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <Music className="size-5 shrink-0" />
                        )}
                        <span className="w-full truncate px-1 text-center text-[11px] text-muted-foreground">
                          {track.title}
                        </span>
                      </button>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuLabel className="truncate">
                      {track.title}
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onSelect={() => setEditingTrackId(track.id)}
                    >
                      <Pencil />
                      Редактировать
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      onSelect={() => handleRemoveTrack(track.id)}
                    >
                      <Trash2 />
                      Удалить
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}

            {/* «+» сразу открывает проводник: можно выбрать несколько MP3. */}
            <button
              type="button"
              disabled={isAddingTracks}
              onClick={() => mp3InputRef.current?.click()}
              title="Добавить треки"
              aria-label="Добавить треки"
              className={cn(
                TILE_CLASS,
                "border-2 border-dashed disabled:opacity-60"
              )}
            >
              <Plus className="size-5" />
            </button>

            {notice ? (
              <p className="px-1 text-[10px] text-muted-foreground">{notice}</p>
            ) : null}
          </div>
        </ScrollArea>
      </div>

      <input
        ref={mp3InputRef}
        type="file"
        accept=".mp3,audio/mpeg"
        multiple
        className="hidden"
        onChange={handleTracksPicked}
      />

      <Separator className="my-3" />

      {/* --- Транспорт: плеер живёт над панелями, здесь только команды --- */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-1.5">
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
            size="icon-sm"
            variant="ghost"
            aria-label={player.isPlaying ? "Пауза" : "Воспроизвести"}
            disabled={tracks.length === 0}
            onClick={player.toggle}
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
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={player.isMuted ? "Включить звук" : "Выключить звук"}
            onClick={player.toggleMute}
          >
            {player.isMuted ? <VolumeX /> : <Volume2 />}
          </Button>
          <Slider
            value={[player.volume]}
            onValueChange={(value) => player.setVolumePercent(value[0])}
            max={100}
            step={1}
            aria-label="Громкость"
            className="min-w-8 flex-1"
          />
        </div>

        <span
          className="truncate text-[10px] text-muted-foreground"
          title={player.current?.title}
        >
          {player.current?.title ?? "Плейлист пуст"}
        </span>
      </div>

      {/* Диалоги пересоздаются при смене записи: поля не «переезжают» между ними. */}
      <SoundpadSlotDialog
        key={isCreatingSfx ? "sfx-create" : "sfx-create-idle"}
        open={isCreatingSfx}
        onOpenChange={setIsCreatingSfx}
        onSubmit={(input) => addSoundpadSlot(input)}
      />
      <SoundpadSlotDialog
        key={editingSfxId ?? "sfx-edit-none"}
        open={Boolean(editingSlot)}
        initial={
          editingSlot
            ? {
                title: editingSlot.title,
                icon: editingSlot.icon,
                src: editingSlot.src,
              }
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) setEditingSfxId(null)
        }}
        onSubmit={(input) => {
          if (editingSlot) updateSoundpadSlot(editingSlot.id, input)
        }}
      />
      <TrackDialog
        key={editingTrackId ?? "track-edit-none"}
        open={Boolean(editingTrack)}
        initial={editingTrack ? trackToInput(editingTrack) : undefined}
        onOpenChange={(open) => {
          if (!open) setEditingTrackId(null)
        }}
        onSubmit={(input) => {
          if (editingTrack) updateTrack(editingTrack.id, input)
        }}
      />
    </aside>
  )
}
