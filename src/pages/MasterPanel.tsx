import { useCallback, useRef, useState } from "react"
import type { ChangeEvent } from "react"
import {
  ChevronDown,
  Clapperboard,
  Dices,
  Download,
  ExternalLink,
  FolderOpen,
  Grid3x3,
  RotateCcw,
  Upload,
} from "lucide-react"
import { BackgroundLibrary } from "@/components/master-panel/BackgroundLibrary"
import { CreateCharacterDialog } from "@/components/master-panel/CharacterDialog"
import { GlobalAudioSidebar } from "@/components/master-panel/GlobalAudioSidebar"
import { SceneViewport } from "@/components/master-panel/SceneViewport"
import { SoundtrackProvider } from "@/components/master-panel/SoundtrackProvider"
import { TokenPanel } from "@/components/master-panel/TokenPanel"
import { BattleMapTab } from "@/components/master-panel/tabs/BattleMapTab"
import { DiceTab } from "@/components/master-panel/tabs/DiceTab"
import { SceneDescriptionTab } from "@/components/master-panel/tabs/SceneDescriptionTab"
import { SyncStatusDot } from "@/components/sync/SyncStatusDot"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useEpisodeSync } from "@/hooks/useEpisodeSync"
import { useTabNumberShortcuts } from "@/hooks/useTabNumberShortcuts"
import {
  downloadEpisodeFile,
  parseEpisodeFile,
  readEpisodeFile,
} from "@/lib/episode-io"
import { describeAssetIssues } from "@/lib/export-episode"
import { cn } from "@/lib/utils"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { toast } from "sonner"

/** Два режима центральной области: сцена и карта. Клавиши 1–2. */
const VIEW_IDS = ["scene", "map"] as const
type CenterView = (typeof VIEW_IDS)[number]

/** Сколько имён выгруженных файлов показывать в диалоге экспорта. */
const EXPORT_ASSET_LIST_LIMIT = 5

export function MasterPanel() {
  // Эта вкладка — источник истины, состояние рассылается на /screen.
  useEpisodeSync("master")

  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const activeBackgroundId = useEpisodeStore((state) => state.activeBackgroundId)
  const activeMapId = useEpisodeStore((state) => state.activeMapId)
  const episodeTitle = useEpisodeStore((state) => state.episodeTitle)
  const episodeSlug = useEpisodeStore((state) => state.episodeSlug)
  const renameEpisode = useEpisodeStore((state) => state.renameEpisode)
  const resetEpisode = useEpisodeStore((state) => state.resetEpisode)
  const importEpisode = useEpisodeStore((state) => state.importEpisode)
  const addCharacter = useEpisodeStore((state) => state.addCharacter)
  const activeCharacterIds = useEpisodeStore((state) => state.activeCharacterIds)

  const [isResetOpen, setIsResetOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [centerView, setCenterView] = useState<CenterView>("scene")
  /**
   * Сообщение о работе с файлом выпуска: ошибка импорта/экспорта или памятка о
   * том, что папку `assets` нужно передать вместе с JSON (тогда она одна на оба
   * окна).
   */
  const [fileDialog, setFileDialog] = useState<{
    title: string
    message: string
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Клавиши 1–2 переключают «Сцена / Карта»: setCenterView стабилен.
  const selectViewByIndex = useCallback((index: number) => {
    setCenterView(VIEW_IDS[index] ?? VIEW_IDS[0])
  }, [])
  useTabNumberShortcuts(selectViewByIndex)

  const liveBackground = backgrounds.find(
    (item) => item.id === activeBackgroundId
  )
  // Метка «на карте» в левой панели: эфирная карта, иначе — редактируемая.
  const tokenPanelMapId = liveBackground?.isBattlemap
    ? liveBackground.id
    : activeMapId

  async function handleImportPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    try {
      const text = await readEpisodeFile(file)
      importEpisode(parseEpisodeFile(text))
      toast.success("Выпуск импортирован", { description: file.name })
    } catch (thrown) {
      const message =
        thrown instanceof Error
          ? thrown.message
          : "Не удалось импортировать выпуск"
      // Ошибка разбора бывает длинной: её видно и тостом, и в диалоге целиком.
      toast.error("Не удалось импортировать выпуск", { description: message })
      setFileDialog({ title: "Не удалось импортировать выпуск", message })
    }
  }

  /**
   * Экспорт выпуска. Картинки и музыка ложатся файлами в папку выпуска
   * `assets/episodes/<slug>/` (их кладёт локальный сервер), поэтому JSON весит
   * килобайты и несёт только относительные пути.
   */
  async function handleExport() {
    try {
      const report = await downloadEpisodeFile()
      toast.success("Выпуск экспортирован", {
        description: `${report.fileName} — ${report.size}. Файлы: assets/episodes/${report.episodeSlug}/`,
      })
      const issues =
        report.issues.length > 0
          ? `\nБез ассета остались: ${describeAssetIssues(report.issues)}.`
          : ""
      if (report.issues.length > 0) {
        toast.warning("Часть ассетов не попала в файл", {
          description: describeAssetIssues(report.issues),
        })
      }
      const shown = report.savedAssets.slice(0, EXPORT_ASSET_LIST_LIMIT)
      const rest = report.savedAssets.length - shown.length
      const saved =
        report.savedAssets.length > 0
          ? `\nВыгружено файлов: ${report.savedAssets.length} — ${shown.join(", ")}${
              rest > 0 ? ` и ещё ${rest}` : ""
            }.`
          : ""
      setFileDialog({
        title: "Выпуск экспортирован",
        message:
          `${report.fileName} — ${report.size}.\n` +
          `1. Файлы сохранены в папку: assets/episodes/${report.episodeSlug}/\n` +
          `2. Для передачи Мастеру сожмите эту папку в ${report.episodeSlug}.zip ` +
          `и отправьте вместе с файлом ${report.fileName}.\n` +
          `3. Мастер распакует архив в assets/episodes/ на своём компьютере.` +
          saved +
          issues,
      })
    } catch (thrown) {
      const message =
        thrown instanceof Error
          ? thrown.message
          : "Не удалось экспортировать выпуск"
      toast.error("Не удалось экспортировать выпуск", { description: message })
      setFileDialog({ title: "Не удалось экспортировать выпуск", message })
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground xl:h-svh xl:min-h-0 xl:overflow-hidden">
      <header className="shrink-0 border-b border-border bg-background">
        {/*
          Боковые отступы компенсируют внутренние `px-2.5` крайних детей шапки,
          чтобы видимый текст начинался на одной вертикали с телом (1vw).
        */}
        <div className="flex w-full items-center gap-3 py-3 pl-[calc(1vw-0.625rem)] pr-[calc(1vw-0.625rem)]">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground">
            <Dices className="size-5" />
          </div>

          <div className="flex min-w-0 flex-col">
            <Input
              value={episodeTitle}
              onChange={(event) => renameEpisode(event.target.value)}
              placeholder="Название выпуска"
              aria-label="Название выпуска"
              className="h-8 w-64 border-transparent bg-transparent px-0 font-heading text-lg font-bold shadow-none dark:bg-transparent"
            />
            <span className="px-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Мастер-панель
            </span>
          </div>

          {/* Куда лягут ассеты выпуска: папку передают Мастеру целиком. */}
          <Badge
            variant="outline"
            className="hidden shrink-0 font-mono md:inline-flex"
            title={`Папка выпуска: assets/episodes/${episodeSlug}/`}
          >
            Папка: {episodeSlug}
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="ml-1">
                <FolderOpen />
                Файл
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onSelect={() => void handleExport()}>
                <Download />
                Экспортировать выпуск
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                <Upload />
                Импортировать выпуск
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setIsResetOpen(true)}
              >
                <RotateCcw />
                Создать новый выпуск
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="hidden text-xs text-muted-foreground xl:inline">
            Приключение
          </span>

          <div className="ml-auto flex items-center gap-2">
            <SyncStatusDot />
            <Button size="sm" variant="outline" asChild>
              <a href="/screen" target="_blank" rel="noreferrer">
                <ExternalLink />
                Зрительский экран
              </a>
            </Button>
          </div>
        </div>
      </header>

      <SoundtrackProvider>
      <main className="flex min-h-0 w-full flex-1 px-[1vw] py-4">
        <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,360px)_minmax(0,1fr)_minmax(300px,360px)] gap-4">
            {/* Левая колонка: библиотека сцен */}
            <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex shrink-0 items-center justify-between">
                <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  Сцены
                </span>
                <Badge variant="outline">{backgrounds.length}</Badge>
              </div>
              <ScrollArea className="min-h-0 flex-1 pr-1">
                <BackgroundLibrary />
              </ScrollArea>
            </section>

            {/* Центр: персонажи, сцена/карта */}
            <section className="flex min-h-0 flex-col gap-3">
              <div className="shrink-0 rounded-lg border border-border bg-card p-2">
                <TokenPanel
                  mapId={tokenPanelMapId}
                  variant="icons"
                  allowCategoryDrag={false}
                  selectedCharacterId={activeCharacterIds.at(-1) ?? null}
                  onCreate={() => setIsCreateOpen(true)}
                  className="w-full"
                />
              </div>

              <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card p-3">
                <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
                    <button
                      type="button"
                      onClick={() => setCenterView("scene")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        centerView === "scene"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Clapperboard className="size-3.5" />
                      Сцена
                    </button>
                    <button
                      type="button"
                      onClick={() => setCenterView("map")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        centerView === "map"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Grid3x3 className="size-3.5" />
                      Карта
                    </button>
                  </div>
                  <span
                    className="min-w-0 truncate text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
                    title={liveBackground?.title}
                  >
                    {liveBackground?.title ?? "Сцена не выбрана"}
                  </span>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  {centerView === "scene" ? (
                    <SceneViewport initialHeightVh={48} />
                  ) : (
                    <BattleMapTab />
                  )}
                </div>
              </div>
            </section>

            {/* Правая колонка: заметки акта */}
            <section className="min-h-0 rounded-lg border border-border bg-card p-3">
              <SceneDescriptionTab />
            </section>
          </div>

          {/* Нижняя строка: звуки, кубики, музыка */}
          <div className="grid h-[240px] shrink-0 grid-cols-[2fr_1fr_2fr] gap-4">
            <section className="min-h-0 rounded-lg border border-border bg-card p-3">
              <GlobalAudioSidebar section="soundpad" />
            </section>
            <section className="min-h-0 rounded-lg border border-border bg-card p-3">
              <DiceTab />
            </section>
            <section className="min-h-0 rounded-lg border border-border bg-card p-3">
              <div className="min-w-[85px] overflow-hidden" style={{ height: "100%" }}>
                <GlobalAudioSidebar section="playlist" />
              </div>
            </section>
          </div>
        </div>
      </main>
      </SoundtrackProvider>

      <CreateCharacterDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreate={(input) => addCharacter(input)}
      />

      <AlertDialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Создать новый выпуск?</AlertDialogTitle>
            <AlertDialogDescription>
              Фоны, персонажи, токены, заметки и плейлист вернутся к стартовому
              состоянию, персонаж уйдёт со сцены. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resetEpisode()
                setIsResetOpen(false)
              }}
            >
              Создать выпуск
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportPicked}
      />

      <AlertDialog
        open={Boolean(fileDialog)}
        onOpenChange={(open) => {
          if (!open) setFileDialog(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fileDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {fileDialog?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setFileDialog(null)}>
              Понятно
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
