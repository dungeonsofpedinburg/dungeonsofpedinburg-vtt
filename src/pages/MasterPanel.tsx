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
  Music,
  RotateCcw,
  ScrollText,
  Upload,
} from "lucide-react"
import { BackgroundLibrary } from "@/components/master-panel/BackgroundLibrary"
import { CreateCharacterDialog } from "@/components/master-panel/CharacterDialog"
import { SceneViewport } from "@/components/master-panel/SceneViewport"
import { SoundtrackProvider } from "@/components/master-panel/SoundtrackProvider"
import { TokenPanel } from "@/components/master-panel/TokenPanel"
import { BattleMapTab } from "@/components/master-panel/tabs/BattleMapTab"
import { DiceTab } from "@/components/master-panel/tabs/DiceTab"
import { SceneDescriptionTab } from "@/components/master-panel/tabs/SceneDescriptionTab"
import { SoundtrackTab } from "@/components/master-panel/tabs/SoundtrackTab"
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
import { useEpisodeStore } from "@/store/useEpisodeStore"

/** Вкладки правой панели: этот же порядок соответствует клавишам 1–4. */
const TAB_IDS = ["scenes", "sound", "map", "dice"]

export function MasterPanel() {
  // Эта вкладка — источник истины, состояние рассылается на /screen.
  useEpisodeSync("master")

  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const activeBackgroundId = useEpisodeStore((state) => state.activeBackgroundId)
  const activeMapId = useEpisodeStore((state) => state.activeMapId)
  const episodeTitle = useEpisodeStore((state) => state.episodeTitle)
  const renameEpisode = useEpisodeStore((state) => state.renameEpisode)
  const resetEpisode = useEpisodeStore((state) => state.resetEpisode)
  const importEpisode = useEpisodeStore((state) => state.importEpisode)
  const addCharacter = useEpisodeStore((state) => state.addCharacter)
  const activeCharacterId = useEpisodeStore((state) => state.activeCharacterId)

  const [isResetOpen, setIsResetOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(TAB_IDS[0])
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Клавиши 1–4 переключают вкладки: setActiveTab стабилен, слушатель один.
  const selectTabByIndex = useCallback((index: number) => {
    setActiveTab(TAB_IDS[index] ?? TAB_IDS[0])
  }, [])
  useTabNumberShortcuts(selectTabByIndex)

  // Пропорция панелей запоминается в localStorage между перезагрузками.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "pedinburg-master-split",
    panelIds: ["left", "right"],
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
      setImportError(
        thrown instanceof Error
          ? thrown.message
          : "Не удалось импортировать выпуск"
      )
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground xl:h-svh xl:min-h-0 xl:overflow-hidden">
      <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center gap-2 px-4 py-3">
          <Input
            value={episodeTitle}
            onChange={(event) => renameEpisode(event.target.value)}
            placeholder="Название выпуска"
            aria-label="Название выпуска"
            className="h-8 w-72 border-transparent bg-transparent text-sm font-medium shadow-none dark:bg-transparent"
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="ml-1">
                <FolderOpen />
                Файл
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onSelect={downloadEpisodeFile}>
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
      <main className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 p-4">
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="min-h-0"
        >
        {/* Левая панель: закреплён только viewport, токены скроллятся вместе с библиотекой */}
        <ResizablePanel
          id="left"
          defaultSize="50%"
          minSize="22%"
          maxSize="78%"
          className="flex min-h-0 flex-col gap-4"
        >
          <div className="shrink-0">
            <SceneViewport />
          </div>

          {/* Панель персонажей закреплена: скроллится только библиотека сцен */}
          <div className="shrink-0">
            <TokenPanel
              mapId={tokenPanelMapId}
              iconOnly
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

        {/* Правая панель: у каждой вкладки свой внутренний скролл */}
        <ResizablePanel
          id="right"
          defaultSize="50%"
          minSize="22%"
          maxSize="78%"
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
                <TabsTrigger value="sound" title="Клавиша 2">
                  <Music />
                  <span className="hidden md:inline">Саундтрек</span>
                </TabsTrigger>
                <TabsTrigger value="map" title="Клавиша 3">
                  <Grid3x3 />
                  <span className="hidden md:inline">Карты местности</span>
                </TabsTrigger>
                <TabsTrigger value="dice" title="Клавиша 4">
                  <Dices />
                  <span className="hidden md:inline">Кубики</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="scenes" className="min-h-0">
                <SceneDescriptionTab />
              </TabsContent>
              <TabsContent value="sound" className="min-h-0">
                <SoundtrackTab />
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
        open={Boolean(importError)}
        onOpenChange={(open) => {
          if (!open) setImportError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Не удалось импортировать выпуск</AlertDialogTitle>
            <AlertDialogDescription>{importError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setImportError(null)}>
              Понятно
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
