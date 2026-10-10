import { useCallback, useRef, useState } from "react"
import type { ChangeEvent } from "react"
import { useDefaultLayout } from "react-resizable-panels"
import {
  ChevronDown,
  Dices,
  Download,
  ExternalLink,
  FolderOpen,
  Grid3x3,
  RotateCcw,
  ScrollText,
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
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useEpisodeSync } from "@/hooks/useEpisodeSync"
import { useTabNumberShortcuts } from "@/hooks/useTabNumberShortcuts"
import {
  downloadEpisodeFile,
  parseEpisodeFile,
  readEpisodeFile,
} from "@/lib/episode-io"
import { describeAssetIssues } from "@/lib/export-episode"
import { useEpisodeStore } from "@/store/useEpisodeStore"

/** Вкладки правой панели: этот же порядок соответствует клавишам 1–3. */
const TAB_IDS = ["scenes", "map", "dice"]

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
  const activeCharacterId = useEpisodeStore((state) => state.activeCharacterId)

  const [isResetOpen, setIsResetOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(TAB_IDS[0])
  /**
   * Сообщение о работе с файлом выпуска: ошибка импорта/экспорта или памятка о
   * том, что папку `assets` нужно передать вместе с JSON (тогда она одна на оба окна).
   */
  const [fileDialog, setFileDialog] = useState<{
    title: string
    message: string
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Клавиши 1–4 переключают вкладки: setActiveTab стабилен, слушатель один.
  const selectTabByIndex = useCallback((index: number) => {
    setActiveTab(TAB_IDS[index] ?? TAB_IDS[0])
  }, [])
  useTabNumberShortcuts(selectTabByIndex)

  // Пропорция панелей запоминается в localStorage между перезагрузками.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "pedinburg-master-split",
    panelIds: ["left", "center", "audio"],
    onlySaveAfterUserInteractions: true,
  })

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
    } catch (thrown) {
      setFileDialog({
        title: "Не удалось импортировать выпуск",
        message:
          thrown instanceof Error
            ? thrown.message
            : "Не удалось импортировать выпуск",
      })
    }
  }

  /**
   * Экспорт выпуска. Картинки и музыка ложатся файлами в папку выпуска
   * `assets/episodes/<slug>/` (их кладёт локальный сервер), поэтому JSON весит
   * килобайты и несёт только относительные пути. Папку архивируют целиком и
   * передают Мастеру вместе с этим JSON.
   */
  async function handleExport() {
    try {
      const report = await downloadEpisodeFile()
      const issues =
        report.issues.length > 0
          ? `\nБез ассета остались: ${describeAssetIssues(report.issues)}.`
          : ""
      // Имён файлов может быть много: в диалоге показываем первые пять.
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
      setFileDialog({
        title: "Не удалось экспортировать выпуск",
        message:
          thrown instanceof Error
            ? thrown.message
            : "Не удалось экспортировать выпуск",
      })
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground xl:h-svh xl:min-h-0 xl:overflow-hidden">
      <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex w-full items-center gap-2 px-[1vw] py-3">
          <Input
            value={episodeTitle}
            onChange={(event) => renameEpisode(event.target.value)}
            placeholder="Название выпуска"
            aria-label="Название выпуска"
            className="h-8 w-72 border-transparent bg-transparent text-sm font-medium shadow-none dark:bg-transparent"
          />

          {/* Куда лягут ассеты выпуска: папку передают Мастеру целиком. */}
          <Badge
            variant="outline"
            className="shrink-0 font-mono"
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

          <div className="ml-auto flex items-center gap-1.5">
            <SyncStatusDot />
            <Button size="sm" variant="outline" asChild>
              <a href="/screen" target="_blank" rel="noreferrer">
                <ExternalLink />
                Экран OBS
              </a>
            </Button>
          </div>
        </div>
      </header>

      <SoundtrackProvider>
      <main className="flex min-h-0 w-full flex-1 px-[1vw] py-4">
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="min-h-0"
        >
        {/* Левая панель (35%): закреплён только viewport, токены скроллятся вместе с библиотекой */}
        <ResizablePanel
          id="left"
          defaultSize="35%"
          minSize="20%"
          maxSize="70%"
          className="flex min-h-0 flex-col gap-4"
        >
          <div className="shrink-0">
            <SceneViewport />
          </div>

          {/* Панель персонажей закреплена: скроллится только библиотека сцен */}
          <div className="shrink-0">
            <TokenPanel
              mapId={tokenPanelMapId}
              variant="icons"
              allowCategoryDrag={false}
              selectedCharacterId={activeCharacterId}
              onCreate={() => setIsCreateOpen(true)}
            />
          </div>

          <ScrollArea className="min-h-0 flex-1 pr-1">
            <div className="pr-3">
              <BackgroundLibrary />
            </div>
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle withHandle className="mx-2" />

        {/* Центральная панель (57%): у каждой вкладки свой внутренний скролл */}
        <ResizablePanel
          id="center"
          defaultSize="57%"
          minSize="25%"
          maxSize="90%"
          className="flex min-h-0 flex-col"
        >
          <Card className="flex min-h-0 flex-1 flex-col gap-3 px-(--card-spacing)">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="min-h-0 flex-1 gap-3"
            >
              <TabsList className="w-full shrink-0">
                <TabsTrigger value="scenes" title="Клавиша 1">
                  <ScrollText />
                  <span className="hidden md:inline">Описание сцен</span>
                </TabsTrigger>
                <TabsTrigger value="map" title="Клавиша 2">
                  <Grid3x3 />
                  <span className="hidden md:inline">Карты местности</span>
                </TabsTrigger>
                <TabsTrigger value="dice" title="Клавиша 3">
                  <Dices />
                  <span className="hidden md:inline">Кубики</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="scenes" className="min-h-0">
                <SceneDescriptionTab />
              </TabsContent>
              <TabsContent value="map" className="min-h-0">
                <BattleMapTab />
              </TabsContent>
              <TabsContent value="dice" className="min-h-0">
                <DiceTab />
              </TabsContent>
            </Tabs>
          </Card>
        </ResizablePanel>

        <ResizableHandle withHandle className="mx-2" />

        {/*
          Правая панель (8%): глобальная аудио-панель. Она видна при любой
          вкладке, поэтому музыка и эффекты всегда под рукой. min-w-[85px] держит
          квадратные плитки читаемыми на узких экранах.
        */}
        <ResizablePanel
          id="audio"
          defaultSize="8%"
          minSize="5%"
          maxSize="20%"
          className="min-w-[85px]"
        >
          <GlobalAudioSidebar />
        </ResizablePanel>
        </ResizablePanelGroup>
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
            {/* whitespace-pre-line: памятка по экспорту — нумерованный список. */}
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
