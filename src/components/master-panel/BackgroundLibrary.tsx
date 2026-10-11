import { useMemo, useRef, useState } from "react"
import type { ChangeEvent, DragEvent } from "react"
import {
  Check,
  Copy,
  Grid3x3,
  GripVertical,
  ImagePlus,
  Layers,
  ListChecks,
  Music,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Trash2,
} from "lucide-react"
import { AddBackgroundStateDialog } from "@/components/master-panel/BackgroundStateDialog"
import { BatchSelectionBar } from "@/components/master-panel/BatchSelectionBar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Separator } from "@/components/ui/separator"
import { backgroundIcon } from "@/data/seed"
import { useBatchSelection } from "@/hooks/useBatchSelection"
import {
  DEFAULT_BACKGROUND_STATE_ID,
  backgroundStateSrc,
  backgroundStates,
  getBackgroundActiveState,
  hasCustomBackgroundStates,
  isBackgroundBattlemap,
} from "@/lib/background"
import {
  assetFileName,
  episodeAssetFolder,
  extensionFromDataUrl,
} from "@/lib/asset-url"
import { prepareAudioFile } from "@/lib/audio-file"
import { saveAssetToLibrary } from "@/lib/asset-upload"
import { prepareImageFile } from "@/lib/image-file"
import { isVideoFile, isVideoSrc } from "@/lib/media"
import { prepareVideoFile } from "@/lib/video-file"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn, fileNameWithoutExtension } from "@/lib/utils"
import { toast } from "sonner"

/** MIME перетаскиваемого разделителя: сцены едут обычным text/plain. */
const SCENE_GROUP_MIME = "application/x-pedinburg-scene-group"

/**
 * id тоста пакетного импорта сцен: по нему прогресс («2 из 5») заменяется
 * итогом, а не копится столбиком уведомлений.
 */
const SCENE_IMPORT_TOAST_ID = "scene-import"

/** Что принимает проводник для сцены: картинка или видео-фон. */
const SCENE_FILE_ACCEPT = "image/*,video/mp4,video/webm"

export function BackgroundLibrary() {
  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const sceneGroups = useEpisodeStore((state) => state.sceneGroups)
  const activeBackgroundId = useEpisodeStore((state) => state.activeBackgroundId)
  // Заметки и музыка живут на группах сцен (актах), а не на отдельных сценах.
  const groupNotes = useEpisodeStore((state) => state.groupNotes)
  const groupTracks = useEpisodeStore((state) => state.groupTracks)
  const setGroupTrack = useEpisodeStore((state) => state.setGroupTrack)
  const removeGroupTrack = useEpisodeStore((state) => state.removeGroupTrack)
  // Видео грузится на диск сразу, поэтому ему нужен slug: файл ложится в папку
  // своего выпуска (`assets/episodes/<slug>/videos`), а не в общий кэш.
  const episodeSlug = useEpisodeStore((state) => state.episodeSlug)
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
  const addBackgroundState = useEpisodeStore(
    (state) => state.addBackgroundState
  )
  const setActiveBackgroundState = useEpisodeStore(
    (state) => state.setActiveBackgroundState
  )
  const removeBackgroundState = useEpisodeStore(
    (state) => state.removeBackgroundState
  )
  const addSceneGroup = useEpisodeStore((state) => state.addSceneGroup)
  const renameSceneGroup = useEpisodeStore((state) => state.renameSceneGroup)
  const removeSceneGroup = useEpisodeStore((state) => state.removeSceneGroup)
  const moveSceneGroup = useEpisodeStore((state) => state.moveSceneGroup)
  const deleteBatchBackgrounds = useEpisodeStore(
    (state) => state.deleteBatchBackgrounds
  )

  // Выделение сцен живёт в компоненте: в стор уезжает только само удаление.
  const batch = useBatchSelection(deleteBatchBackgrounds)

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
  /** Сцена, которой добавляют новое состояние фона («Ночь», «Пожар»). */
  const [stateTargetId, setStateTargetId] = useState<string | null>(null)
  const [isImportingScenes, setIsImportingScenes] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const groupImagesInputRef = useRef<HTMLInputElement>(null)
  /** Группа, для которой сейчас выбирают трек (кнопка «+» у разделителя). */
  const [trackTarget, setTrackTarget] = useState<string | null>(null)
  const [isUploadingTrack, setIsUploadingTrack] = useState(false)
  const groupTrackInputRef = useRef<HTMLInputElement>(null)
  /** Сцена, созданная кнопкой «+»: её занимает первый файл пакетного импорта. */
  const pendingSceneRef = useRef<{ id: string; group: string } | null>(null)

  /** Сцена, для которой сейчас правят состояния (сравнивается с null). */
  const stateTarget =
    backgrounds.find((item) => item.id === stateTargetId) ?? null

  function pickSceneImage(backgroundId: string) {
    setImageTargetId(backgroundId)
    fileInputRef.current?.click()
  }

  /** Кнопка «+» у разделителя: выбираем аудиофайл для музыки акта. */
  function pickGroupTrack(groupName: string) {
    setTrackTarget(groupName)
    groupTrackInputRef.current?.click()
  }

  /**
   * Привязка трека к акту: файл сразу уезжает в папку выпуска
   * (`assets/episodes/<slug>/music/`), а в стор ложится путь — как у остальных
   * ассетов. Дальше движок сам играет его зацикленно на сценах этого акта.
   */
  async function handleGroupTrackPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    const group = trackTarget
    setTrackTarget(null)
    if (!file || !group) return

    setIsUploadingTrack(true)
    try {
      const prepared = await prepareAudioFile(file)
      const fileName = assetFileName(
        group,
        prepared.title,
        extensionFromDataUrl(prepared.dataUrl)
      )
      const upload = await saveAssetToLibrary(
        episodeAssetFolder(episodeSlug, "music"),
        fileName,
        prepared.dataUrl
      )
      if (!upload.ok) {
        toast.error("Трек не выложился", { description: upload.error })
        return
      }
      setGroupTrack(group, {
        id: fileName,
        title: prepared.title,
        src: upload.url,
      })
      toast.success(`Музыка акта «${group}»`, {
        description: `${prepared.title}${
          prepared.warning ? ` · ${prepared.warning}` : ""
        }`,
      })
    } catch (thrown) {
      toast.error(
        thrown instanceof Error ? thrown.message : "Не удалось прочитать файл"
      )
    } finally {
      setIsUploadingTrack(false)
    }
  }

  /**
   * Готовит выбранный файл к хранению в сторе. Картинка сжимается в data-URL (как
   * и раньше) и уезжает на диск при экспорте, а видео ложится файлом сразу в
   * папку выпуска `assets/episodes/<slug>/videos`: data-URL видео в снапшот для
   * /screen не влезет, а сервер отдаёт его с Range-запросами, то есть плеер умеет
   * перематывать.
   */
  async function prepareSceneMedia(
    file: File,
    options: { id: string; label: string }
  ) {
    if (isVideoFile(file)) {
      const prepared = await prepareVideoFile(file, { ...options, episodeSlug })
      return { src: prepared.src, warning: prepared.warning }
    }
    // Сцена — 1440×1080 (4:3), проектор может быть 4K: держим запас до 1920 px,
    // чтобы кадр не превращался в мыло при растягивании масштабом.
    const prepared = await prepareImageFile(file, { maxSide: 1920 })
    return { src: prepared.dataUrl, warning: prepared.warning }
  }

  async function handleSceneImagePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    const backgroundId = imageTargetId
    setImageTargetId(null)
    if (!file || !backgroundId) return
    try {
      const prepared = await prepareSceneMedia(file, {
        id: backgroundId,
        label: fileNameWithoutExtension(file.name),
      })
      updateBackgroundImage(backgroundId, prepared.src)
      toast.success("Картинка сцены обновлена", {
        description: prepared.warning,
      })
    } catch (thrown) {
      toast.error(
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
    const problems: string[] = []
    let imported = 0

    for (const [index, file] of files.entries()) {
      // Прогресс живёт в том же тосте: id задан, поэтому сообщения заменяют друг друга.
      toast.info(`Импорт сцен: ${index + 1} из ${files.length} — ${file.name}`, {
        id: SCENE_IMPORT_TOAST_ID,
      })
      try {
        const prepared = await prepareSceneMedia(file, {
          // Имя файла ассета: у первой сцены — её id (файл перезаписывается при
          // повторной замене), у остальных — собственное имя файла.
          id: index === 0 ? pending.id : "scene",
          label: fileNameWithoutExtension(file.name),
        })
        const title = fileNameWithoutExtension(file.name)
        if (index === 0) {
          // Первый файл занимает сцену кнопки «+» — она уже стоит в эфире.
          updateBackgroundImage(pending.id, prepared.src)
          renameBackground(pending.id, title)
        } else {
          addBackground(pending.group, {
            title,
            src: prepared.src,
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
    // Прогресс и итог — один и тот же тост: sonner заменяет его по id.
    toast.success(`Добавлено сцен: ${imported} из ${files.length}`, {
      id: SCENE_IMPORT_TOAST_ID,
    })
    if (problems.length > 0) {
      toast.error("Часть сцен не добавилась", {
        description: problems.join("; "),
        duration: 6000,
      })
    }
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
        {/* Пустой выпуск: подсказываем, с чего начать, вместо пустого списка. */}
        {backgrounds.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Выпуск пока пуст: сцен нет. Нажмите «+» в разделе — первая картинка
            сразу встанет в эфир.
          </p>
        ) : null}

        {batch.isSelecting ? (
          <BatchSelectionBar
            count={batch.count}
            itemsLabel="Сцены"
            onDelete={batch.deleteSelected}
            onCancel={batch.cancel}
          />
        ) : null}

        {groups.map((group) => {
          const isGroupOver = group.title === overGroup
          const isGroupDragging = group.title === dragGroup
          const groupTrack = groupTracks[group.title] ?? null

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

              {/* Музыка акта: «+» привязывает трек, ПКМ — замена и удаление. */}
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={isUploadingTrack}
                    aria-label={
                      groupTrack
                        ? `Музыка акта «${group.title}»: ${groupTrack.title}`
                        : `Привязать музыку к акту «${group.title}»`
                    }
                    title={
                      groupTrack
                        ? `Музыка акта: ${groupTrack.title} (ПКМ — заменить или удалить)`
                        : "Привязать трек к акту (играет зацикленно)"
                    }
                    onClick={() => pickGroupTrack(group.title)}
                    className={cn(groupTrack && "text-primary")}
                  >
                    <Music className="size-3.5" />
                  </Button>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuLabel className="truncate">
                    {groupTrack
                      ? `Акт «${group.title}»: ${groupTrack.title}`
                      : `Акт «${group.title}» — музыки нет`}
                  </ContextMenuLabel>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => pickGroupTrack(group.title)}>
                    {groupTrack ? <RefreshCw /> : <Plus />}
                    {groupTrack ? "Заменить трек" : "Привязать трек"}
                  </ContextMenuItem>
                  {groupTrack ? (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() => removeGroupTrack(group.title)}
                      >
                        <Trash2 />
                        Удалить трек
                      </ContextMenuItem>
                    </>
                  ) : null}
                </ContextMenuContent>
              </ContextMenu>

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
                const Icon = backgroundIcon(background.id)
                const isActive = background.id === activeBackgroundId
                const hasNote = Boolean(groupNotes[background.actGroup]?.trim())
                const isDragging = background.id === dragId
                const isOver = background.id === overId
                const isSelected = batch.isSelected(background.id)
                // Миниатюра и статус карты — по активному состоянию сцены.
                const stateSrc = backgroundStateSrc(background)
                const activeState = getBackgroundActiveState(background)
                const hasStates = hasCustomBackgroundStates(background)

                return (
                  <ContextMenu key={background.id}>
                    <ContextMenuTrigger asChild>
                      <div className="relative">
                      <button
                        type="button"
                        // В режиме выделения сцены не таскаем: клик только отмечает.
                        draggable={!batch.isSelecting}
                        onClick={() =>
                          batch.isSelecting
                            ? batch.toggle(background.id)
                            : setActiveBackground(background.id)
                        }
                        onDoubleClick={() => {
                          if (batch.isSelecting) return
                          pickSceneImage(background.id)
                        }}
                        title={
                          batch.isSelecting
                            ? `${background.title} — клик отмечает сцену`
                            : "Двойной клик — добавить картинку или видео сцены"
                        }
                        onDragStart={(event) => {
                          if (batch.isSelecting) return
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
                          isOver && !dragGroup && "ring-2 ring-ring",
                          isSelected &&
                            "ring-2 ring-ring ring-offset-2 ring-offset-background"
                        )}
                      >
                        {stateSrc ? (
                          isVideoSrc(stateSrc) ? (
                            // Кадр видео-сцены: без звука и без автоплея — только превью.
                            <video
                              src={stateSrc}
                              muted
                              playsInline
                              preload="metadata"
                              className="absolute inset-0 size-full object-cover"
                            />
                          ) : (
                            <img
                              src={stateSrc}
                              alt={background.title}
                              draggable={false}
                              className="absolute inset-0 size-full object-cover"
                            />
                          )
                        ) : Icon ? (
                          <Icon className="size-6 text-muted-foreground transition-colors group-hover:text-foreground" />
                        ) : (
                          <ImagePlus className="size-6 text-muted-foreground" />
                        )}

                        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-background/80 px-1.5 py-1 backdrop-blur-sm">
                          <span className="min-w-0 flex-1 truncate text-left text-[11px]">
                            {background.title}
                          </span>
                          {batch.isSelecting ? null : (
                            <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground" />
                          )}
                        </span>

                        {/* Место в углу занято чекбоксом режима выделения. */}
                        {isBackgroundBattlemap(background) && !batch.isSelecting ? (
                          <Badge
                            variant="secondary"
                            className="absolute top-1 left-1 gap-1"
                          >
                            <Grid3x3 />
                            Карта
                          </Badge>
                        ) : null}

                        {/* Активное состояние видно на миниатюре: «Ночь», «Пожар». */}
                        {hasStates && !batch.isSelecting ? (
                          <Badge
                            variant="outline"
                            className="absolute top-1 left-1 gap-1 bg-background/80 backdrop-blur-sm"
                            style={
                              isBackgroundBattlemap(background)
                                ? { top: "1.75rem" }
                                : undefined
                            }
                          >
                            <Layers />
                            {activeState.name}
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

                      {/* Чекбокс вне кнопки: внутри неё он был бы невалидной вёрсткой. */}
                      {batch.isSelecting ? (
                        <Checkbox
                          checked={isSelected}
                          aria-label={`Отметить сцену «${background.title}»`}
                          className="pointer-events-none absolute top-1 left-1 z-10 bg-background/90"
                        />
                      ) : null}
                      </div>
                    </ContextMenuTrigger>

                    <ContextMenuContent className="w-64">
                      <ContextMenuLabel>{background.title}</ContextMenuLabel>
                      <ContextMenuSeparator />
                      <ContextMenuItem onSelect={() => batch.start(background.id)}>
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
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <Layers />
                          Состояние
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-56">
                          {backgroundStates(background).map((state) => {
                            const isStateActive =
                              state.id === activeState.id
                            return (
                              <ContextMenuItem
                                key={state.id}
                                onSelect={() =>
                                  setActiveBackgroundState(
                                    background.id,
                                    state.id
                                  )
                                }
                              >
                                <span className="flex size-4 shrink-0 items-center justify-center">
                                  {isStateActive ? (
                                    <Check className="size-3.5" />
                                  ) : null}
                                </span>
                                <span className="truncate">{state.name}</span>
                              </ContextMenuItem>
                            )
                          })}
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onSelect={() => setStateTargetId(background.id)}
                          >
                            <Plus />
                            Добавить состояние...
                          </ContextMenuItem>
                          {activeState.id !== DEFAULT_BACKGROUND_STATE_ID ? (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                variant="destructive"
                                onSelect={() =>
                                  removeBackgroundState(
                                    background.id,
                                    activeState.id
                                  )
                                }
                              >
                                <Trash2 />
                                Удалить активное состояние
                              </ContextMenuItem>
                            </>
                          ) : null}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
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
          accept={SCENE_FILE_ACCEPT}
          className="hidden"
          onChange={handleSceneImagePicked}
        />

        {/* Музыка акта: выбранный файл сразу уезжает в папку выпуска. */}
        <input
          ref={groupTrackInputRef}
          type="file"
          accept="audio/*,.mp3,.ogg,.wav,.m4a,.flac"
          className="hidden"
          onChange={handleGroupTrackPicked}
        />

        {/* Пакетный импорт сцен: несколько картинок или видео сразу в один разделитель. */}
        <input
          ref={groupImagesInputRef}
          type="file"
          accept={SCENE_FILE_ACCEPT}
          multiple
          className="hidden"
          onChange={handleGroupImagesPicked}
        />

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

        {/* Новое состояние сцены: стор сразу делает его активным, поэтому эфир
            и миниатюра переключаются на «Ночь» или «Пожар» через кроссфейд. */}
        <AddBackgroundStateDialog
          key={stateTargetId ?? "scene-state-none"}
          open={Boolean(stateTarget)}
          background={stateTarget}
          prepareMedia={prepareSceneMedia}
          onOpenChange={(open) => {
            if (!open) setStateTargetId(null)
          }}
          onSubmit={(state) => {
            if (stateTarget) addBackgroundState(stateTarget.id, state)
          }}
        />
    </div>
  )
}
