import { useMemo, useRef, useState } from "react"
import type { ChangeEvent, DragEvent } from "react"
import {
  Copy,
  Grid3x3,
  GripVertical,
  ImagePlus,
  Pencil,
  Plus,
  ScrollText,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Separator } from "@/components/ui/separator"
import { backgroundIcons } from "@/data/seed"
import { prepareImageFile } from "@/lib/image-file"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn, fileNameWithoutExtension } from "@/lib/utils"

/** MIME перетаскиваемого разделителя: сцены едут обычным text/plain. */
const SCENE_GROUP_MIME = "application/x-pedinburg-scene-group"

export function BackgroundLibrary() {
  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const sceneGroups = useEpisodeStore((state) => state.sceneGroups)
  const activeBackgroundId = useEpisodeStore((state) => state.activeBackgroundId)
  const sceneNotes = useEpisodeStore((state) => state.sceneNotes)
  const setActiveBackground = useEpisodeStore((state) => state.setActiveBackground)
  const toggleBattlemapMode = useEpisodeStore(
    (state) => state.toggleBattlemapMode
  )
  const moveBackground = useEpisodeStore((state) => state.moveBackground)
  const moveBackgroundToGroup = useEpisodeStore(
    (state) => state.moveBackgroundToGroup
  )
  const addBackground = useEpisodeStore((state) => state.addBackground)
  const duplicateBackground = useEpisodeStore(
    (state) => state.duplicateBackground
  )
  const removeBackground = useEpisodeStore((state) => state.removeBackground)
  const renameBackground = useEpisodeStore((state) => state.renameBackground)
  const updateBackgroundImage = useEpisodeStore(
    (state) => state.updateBackgroundImage
  )
  const addSceneGroup = useEpisodeStore((state) => state.addSceneGroup)
  const renameSceneGroup = useEpisodeStore((state) => state.renameSceneGroup)
  const removeSceneGroup = useEpisodeStore((state) => state.removeSceneGroup)
  const moveSceneGroup = useEpisodeStore((state) => state.moveSceneGroup)

  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [dragGroup, setDragGroup] = useState<string | null>(null)
  const [overGroup, setOverGroup] = useState<string | null>(null)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [groupDraft, setGroupDraft] = useState("")
  const [renameTarget, setRenameTarget] = useState<{
    id: string
    title: string
  } | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [imageTargetId, setImageTargetId] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [sceneNotice, setSceneNotice] = useState("")
  const [isImportingScenes, setIsImportingScenes] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const groupImagesInputRef = useRef<HTMLInputElement>(null)
  /** Сцена, созданная кнопкой «+»: её занимает первый файл пакетного импорта. */
  const pendingSceneRef = useRef<{ id: string; group: string } | null>(null)

  function pickSceneImage(backgroundId: string) {
    setImageTargetId(backgroundId)
    fileInputRef.current?.click()
  }

  async function handleSceneImagePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    const backgroundId = imageTargetId
    setImageTargetId(null)
    if (!file || !backgroundId) return
    try {
      // Сцена уезжает на проектор 1920×880 — режем до 1920 px, а не до 1024.
      const prepared = await prepareImageFile(file, { maxSide: 1920 })
      updateBackgroundImage(backgroundId, prepared.dataUrl)
    } catch (thrown) {
      setImageError(
        thrown instanceof Error ? thrown.message : "Не удалось обработать файл"
      )
    }
  }

  /**
   * Кнопка «+»: пустая сцена создаётся сразу (как и раньше), а затем открывается
   * выбор картинок — можно выделить сразу несколько. Отмена выбора оставляет
   * пустую сцену, то есть привычное поведение кнопки сохраняется.
   */
  function addScenesToGroup(groupName: string) {
    pendingSceneRef.current = { id: addBackground(groupName), group: groupName }
    groupImagesInputRef.current?.click()
  }

  /**
   * Пакетный импорт сцен: файлы читаются по очереди, чтобы был виден прогресс.
   * Первый файл занимает сцену из «+», остальные добавляются следом и не
   * переводят эфир на себя.
   */
  async function handleGroupImagesPicked(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    const pending = pendingSceneRef.current
    pendingSceneRef.current = null
    if (!pending || files.length === 0) return

    setIsImportingScenes(true)
    setSceneNotice("")
    const problems: string[] = []
    let imported = 0

    for (const [index, file] of files.entries()) {
      setSceneNotice(
        `Импорт сцен: ${index + 1} из ${files.length} — ${file.name}`
      )
      try {
        const prepared = await prepareImageFile(file, { maxSide: 1920 })
        const title = fileNameWithoutExtension(file.name)
        if (index === 0) {
          // Первый файл занимает сцену кнопки «+» — она уже стоит в эфире.
          updateBackgroundImage(pending.id, prepared.dataUrl)
          renameBackground(pending.id, title)
        } else {
          addBackground(pending.group, {
            title,
            src: prepared.dataUrl,
            activate: false,
          })
        }
        imported += 1
        if (prepared.warning) problems.push(`${file.name}: ${prepared.warning}`)
      } catch (thrown) {
        problems.push(
          `${file.name}: ${thrown instanceof Error ? thrown.message : "не удалось обработать"}`
        )
      }
      // Отдаём кадр браузеру, иначе прогресс не перерисуется до конца цикла.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    setIsImportingScenes(false)
    setSceneNotice(`Добавлено сцен: ${imported} из ${files.length}`)
    if (problems.length > 0) setImageError(problems.join("; "))
  }

  // Порядок полностью ручной: разделители живут в сторе, карты не всплывают.
  const groups = useMemo(
    () =>
      sceneGroups.map((title) => ({
        title,
        items: backgrounds.filter(
          (background) => background.actGroup === title
        ),
      })),
    [backgrounds, sceneGroups]
  )

  function handleDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault()
    // Пока тащат разделитель, сцены на наведение не реагируют.
    if (dragGroup) return
    const sourceId = dragId ?? event.dataTransfer.getData("text/plain")
    setDragId(null)
    setOverId(null)
    if (!sourceId || sourceId === targetId) return
    moveBackground(sourceId, targetId)
  }

  /** Бросок на заголовок: переставляем разделитель либо переносим в него сцену. */
  function handleGroupDrop(event: DragEvent<HTMLElement>, groupName: string) {
    event.preventDefault()
    setOverGroup(null)
    const sourceGroup = event.dataTransfer.getData(SCENE_GROUP_MIME)
    if (sourceGroup) {
      moveSceneGroup(sourceGroup, groupName)
      setDragGroup(null)
      return
    }
    const sourceId = dragId ?? event.dataTransfer.getData("text/plain")
    setDragId(null)
    setOverId(null)
    if (!sourceId) return
    const background = backgrounds.find((item) => item.id === sourceId)
    // Сцена уже здесь: порядок внутри разделителя меняют броском на сцену.
    if (!background || background.actGroup === groupName) return
    moveBackgroundToGroup(sourceId, groupName)
  }

  function startGroupRename(name: string) {
    setEditingGroup(name)
    setGroupDraft(name)
  }

  /** Enter/blur сохраняют имя, Escape возвращает прежнее (стор пропустит no-op). */
  function commitGroupRename() {
    if (editingGroup) renameSceneGroup(editingGroup, groupDraft)
    setEditingGroup(null)
  }

  function saveRename() {
    if (renameTarget) {
      renameBackground(renameTarget.id, renameValue)
    }
    setRenameTarget(null)
  }

  return (
    <div className="flex shrink-0 flex-col gap-4">
        {sceneNotice ? (
          <p className="text-xs text-muted-foreground">{sceneNotice}</p>
        ) : null}

        {groups.map((group) => {
          const isGroupOver = group.title === overGroup
          const isGroupDragging = group.title === dragGroup

          return (
          <section key={group.title} className="space-y-2">
            <div
              onDragOver={(event) => {
                event.preventDefault()
                setOverGroup(group.title)
              }}
              onDragLeave={() =>
                setOverGroup((value) => (value === group.title ? null : value))
              }
              onDrop={(event) => handleGroupDrop(event, group.title)}
              className={cn(
                "group/divider flex items-center gap-2 rounded-md border border-transparent px-1 py-0.5 transition-colors",
                isGroupOver && "border-ring bg-accent/40",
                isGroupDragging && "opacity-60"
              )}
            >
              <span
                draggable={editingGroup !== group.title}
                onDragStart={(event) => {
                  setDragGroup(group.title)
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData(SCENE_GROUP_MIME, group.title)
                }}
                onDragEnd={() => {
                  setDragGroup(null)
                  setOverGroup(null)
                }}
                title="Перетащить разделитель вместе со сценами"
                aria-hidden
                className="cursor-grab text-muted-foreground opacity-40 transition-opacity group-hover/divider:opacity-100"
              >
                <GripVertical className="size-3.5" />
              </span>

              {editingGroup === group.title ? (
                <Input
                  autoFocus
                  value={groupDraft}
                  onChange={(event) => setGroupDraft(event.target.value)}
                  onBlur={commitGroupRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      commitGroupRename()
                    }
                    if (event.key === "Escape") {
                      event.preventDefault()
                      setGroupDraft(group.title)
                      setEditingGroup(null)
                    }
                  }}
                  aria-label="Название разделителя"
                  className="h-6 w-full max-w-56 px-1.5 text-[11px] font-medium tracking-wide uppercase"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startGroupRename(group.title)}
                  title="Клик — переименовать разделитель"
                  className="max-w-56 truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground"
                >
                  {group.title}
                </button>
              )}

              <Separator className="flex-1" />

              <Badge
                variant="ghost"
                className="text-[10px] transition-opacity group-hover/divider:opacity-0"
              >
                {group.items.length}
              </Badge>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Удалить разделитель «${group.title}»`}
                title={
                  sceneGroups.length <= 1
                    ? "Последний разделитель удалить нельзя"
                    : "Удалить разделитель: сцены переедут в соседний"
                }
                disabled={sceneGroups.length <= 1 || isImportingScenes}
                onClick={() => removeSceneGroup(group.title)}
                className="pointer-events-none opacity-0 transition-opacity group-hover/divider:pointer-events-auto group-hover/divider:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
              {group.items.map((background) => {
                const Icon = backgroundIcons[background.id]
                const isActive = background.id === activeBackgroundId
                const hasNote = Boolean(sceneNotes[background.id]?.trim())
                const isDragging = background.id === dragId
                const isOver = background.id === overId

                return (
                  <ContextMenu key={background.id}>
                    <ContextMenuTrigger asChild>
                      <button
                        type="button"
                        draggable
                        onClick={() => setActiveBackground(background.id)}
                        onDoubleClick={() => pickSceneImage(background.id)}
                        title="Двойной клик — добавить или заменить картинку сцены"
                        onDragStart={(event) => {
                          setDragId(background.id)
                          event.dataTransfer.effectAllowed = "move"
                          event.dataTransfer.setData(
                            "text/plain",
                            background.id
                          )
                        }}
                        onDragOver={(event) => {
                          event.preventDefault()
                          if (!dragGroup && background.id !== dragId) {
                            setOverId(background.id)
                          }
                        }}
                        onDragLeave={() =>
                          setOverId((value) =>
                            value === background.id ? null : value
                          )
                        }
                        onDrop={(event) => handleDrop(event, background.id)}
                        onDragEnd={() => {
                          setDragId(null)
                          setOverId(null)
                          setOverGroup(null)
                        }}
                        className={cn(
                          "group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/40 transition-colors hover:bg-muted",
                          isActive
                            ? "border-ring ring-2 ring-ring/40"
                            : "border-border",
                          isDragging && "opacity-60",
                          isOver && !dragGroup && "ring-2 ring-ring"
                        )}
                      >
                        {background.src ? (
                          <img
                            src={background.src}
                            alt={background.title}
                            draggable={false}
                            className="absolute inset-0 size-full object-cover"
                          />
                        ) : Icon ? (
                          <Icon className="size-6 text-muted-foreground transition-colors group-hover:text-foreground" />
                        ) : (
                          <ImagePlus className="size-6 text-muted-foreground" />
                        )}

                        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-background/80 px-1.5 py-1 backdrop-blur-sm">
                          <span className="min-w-0 flex-1 truncate text-left text-[11px]">
                            {background.title}
                          </span>
                          <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground" />
                        </span>

                        {background.isBattlemap ? (
                          <Badge
                            variant="secondary"
                            className="absolute top-1 left-1 gap-1"
                          >
                            <Grid3x3 />
                            Карта
                          </Badge>
                        ) : null}

                        {hasNote ? (
                          <Badge
                            variant="outline"
                            className="absolute top-1 right-1 bg-background/80 backdrop-blur-sm"
                          >
                            <ScrollText />
                          </Badge>
                        ) : null}
                      </button>
                    </ContextMenuTrigger>

                    <ContextMenuContent className="w-64">
                      <ContextMenuLabel>{background.title}</ContextMenuLabel>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onSelect={() => pickSceneImage(background.id)}
                      >
                        <ImagePlus />
                        {background.src ? "Заменить сцену" : "Добавить сцену"}
                      </ContextMenuItem>
                      <ContextMenuItem
                        onSelect={() => toggleBattlemapMode(background.id)}
                      >
                        <Grid3x3 />
                        {background.isBattlemap
                          ? "Убрать статус карты"
                          : "Сделать картой местности"}
                      </ContextMenuItem>
                      <ContextMenuItem
                        onSelect={() => {
                          setRenameTarget({
                            id: background.id,
                            title: background.title,
                          })
                          setRenameValue(background.title)
                        }}
                      >
                        <Pencil />
                        Переименовать
                      </ContextMenuItem>
                      <ContextMenuItem
                        onSelect={() => duplicateBackground(background.id)}
                      >
                        <Copy />
                        Дублировать
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        disabled={backgrounds.length <= 1}
                        title={
                          backgrounds.length <= 1
                            ? "Последнюю сцену выпуска удалить нельзя"
                            : "Удалить сцену вместе с её раскладкой"
                        }
                        onSelect={() => removeBackground(background.id)}
                      >
                        <Trash2 />
                        Удалить
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}

              <button
                type="button"
                disabled={isImportingScenes}
                onClick={() => addScenesToGroup(group.title)}
                title={`Добавить сцены в «${group.title}»: одна картинка сразу встанет в эфир`}
                aria-label={`Добавить сцены в «${group.title}»`}
                className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                <Plus className="size-8" />
              </button>
            </div>
          </section>
          )
        })}

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={() => startGroupRename(addSceneGroup())}
        >
          <Plus />
          Новый разделитель
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleSceneImagePicked}
        />

        {/* Пакетный импорт сцен: несколько картинок сразу в один разделитель. */}
        <input
          ref={groupImagesInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleGroupImagesPicked}
        />

        <Dialog
          open={Boolean(imageError)}
          onOpenChange={(open) => {
            if (!open) setImageError(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Не удалось загрузить картинку сцены</DialogTitle>
              <DialogDescription>{imageError}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setImageError(null)}>Понятно</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(renameTarget)}
          onOpenChange={(open) => {
            if (!open) setRenameTarget(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Переименовать сцену</DialogTitle>
              <DialogDescription>
                Название видно в библиотеке фонов, в заметках и в бейдже
                «В эфире».
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="scene-title">Название сцены</Label>
              <Input
                id="scene-title"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                placeholder="Например: Порт в тумане"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameTarget(null)}>
                Отмена
              </Button>
              <Button disabled={!renameValue.trim()} onClick={saveRename}>
                Сохранить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
