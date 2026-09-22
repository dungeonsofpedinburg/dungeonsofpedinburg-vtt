import { useEffect, useRef, useState } from "react"
import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react"
import { BatchSelectionBar } from "@/components/master-panel/BatchSelectionBar"
import { SoundpadSlotDialog } from "@/components/master-panel/SoundpadSlotDialog"
import { soundpadIcon } from "@/components/master-panel/soundpadIcons"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useBatchSelection } from "@/hooks/useBatchSelection"
import { playSfx } from "@/lib/sfx-player"
import { cn } from "@/lib/utils"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import type { SoundpadSlot } from "@/data/types"

/** Сколько держится подсветка плитки после нажатия, мс. */
const SLOT_FLASH_MS = 320

/**
 * Саундпад: ряд плиток с одноразовыми звуковыми эффектами. Панель стоит над
 * списком треков и отделена от него дивайдером (см. SoundtrackTab).
 *
 * Воспроизведение живёт в модуле `@/lib/sfx-player`, а не в этом компоненте:
 * Radix размонтирует неактивные вкладки, поэтому звук, запущенный из вкладки
 * «Саундтрек», обязан звучать дальше при переходе на «Карты» или «Кубики».
 * Музыку эффекты не глушат — у них свои `<audio>` и своя громкость.
 */
export function SoundpadPanel() {
  const soundpad = useEpisodeStore((state) => state.soundpad)
  const addSoundpadSlot = useEpisodeStore((state) => state.addSoundpadSlot)
  const updateSoundpadSlot = useEpisodeStore((state) => state.updateSoundpadSlot)
  const removeSoundpadSlot = useEpisodeStore((state) => state.removeSoundpadSlot)
  const deleteBatchSoundpadSlots = useEpisodeStore(
    (state) => state.deleteBatchSoundpadSlots
  )

  // Выделение звуков живёт в компоненте: в стор уезжает только удаление.
  const batch = useBatchSelection(deleteBatchSoundpadSlots)

  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Таймер подсветки живёт дольше нажатия: снимаем его при уходе со вкладки.
  useEffect(
    () => () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    },
    []
  )

  const editingSlot = soundpad.find((slot) => slot.id === editingId) ?? null

  /** Клик по плитке: звук уходит в глобальный плеер, плитка коротко вспыхивает. */
  function handlePlay(slot: SoundpadSlot) {
    if (!playSfx(slot.src)) return
    setFlashId(slot.id)
    if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => {
      flashTimer.current = null
      setFlashId(null)
    }, SLOT_FLASH_MS)
  }

  const tileClass =
    "flex aspect-square w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-border px-1 text-muted-foreground transition-[background-color,color,transform,box-shadow] duration-150 hover:bg-accent hover:text-foreground active:scale-95"

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Саундпад · {soundpad.length}
      </span>

      {batch.isSelecting ? (
        <BatchSelectionBar
          count={batch.count}
          itemsLabel="Звуки"
          onDelete={batch.deleteSelected}
          onCancel={batch.cancel}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {soundpad.map((slot) => {
          const Icon = soundpadIcon(slot.icon)
          const isFlash = flashId === slot.id
          const isSelected = batch.isSelected(slot.id)
          const hint = batch.isSelecting
            ? `${slot.title} — клик отмечает звук`
            : slot.src
              ? `${slot.title} — клик: играть, ПКМ: правка`
              : `${slot.title} — файл не выбран, ПКМ → Редактировать`

          return (
            <ContextMenu key={slot.id}>
              <ContextMenuTrigger asChild>
                <div className="relative">
                <button
                  type="button"
                  title={hint}
                  aria-label={hint}
                  onClick={() =>
                    batch.isSelecting
                      ? batch.toggle(slot.id)
                      : handlePlay(slot)
                  }
                  className={cn(
                    tileClass,
                    isFlash &&
                      "border-ring bg-accent text-foreground ring-2 ring-ring/50",
                    !slot.src && "opacity-50",
                    isSelected &&
                      "ring-2 ring-ring ring-offset-2 ring-offset-background"
                  )}
                >
                  <Icon className="size-6" />
                  <span className="line-clamp-2 w-full text-center text-[10px] leading-tight">
                    {slot.title}
                  </span>
                </button>

                {/* Чекбокс вне кнопки: внутри неё он был бы невалидной вёрсткой. */}
                {batch.isSelecting ? (
                  <Checkbox
                    checked={isSelected}
                    aria-label={`Отметить звук «${slot.title}»`}
                    className="pointer-events-none absolute top-1 left-1 z-10 bg-background/90"
                  />
                ) : null}
                </div>
              </ContextMenuTrigger>

              <ContextMenuContent className="w-44">
                <ContextMenuLabel className="truncate">
                  {slot.title}
                </ContextMenuLabel>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => batch.start(slot.id)}>
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
                <ContextMenuItem onSelect={() => setEditingId(slot.id)}>
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

        {/* Пустой слот: та же плитка, но с плюсом — открывает диалог звука. */}
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          title="Добавить звук"
          aria-label="Добавить звук"
          className={cn(tileClass, "border-2 border-dashed")}
        >
          <Plus className="size-5" />
        </button>
      </div>

      {/* Диалоги пересоздаются при смене слота: поля не «переезжают» между ними. */}
      <SoundpadSlotDialog
        key={isCreating ? "sfx-create" : "sfx-create-idle"}
        open={isCreating}
        onOpenChange={setIsCreating}
        onSubmit={(input) => addSoundpadSlot(input)}
      />
      <SoundpadSlotDialog
        key={editingId ?? "sfx-edit-none"}
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
          if (!open) setEditingId(null)
        }}
        onSubmit={(input) => {
          if (editingSlot) updateSoundpadSlot(editingSlot.id, input)
        }}
      />
    </div>
  )
}
