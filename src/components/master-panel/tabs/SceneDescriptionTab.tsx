import { useMemo, useState } from "react"
import { FileText, MapPin, Radio, ScrollText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"

export function SceneDescriptionTab() {
  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const sceneGroups = useEpisodeStore((state) => state.sceneGroups)
  const activeBackgroundId = useEpisodeStore((state) => state.activeBackgroundId)
  const sceneNotes = useEpisodeStore((state) => state.sceneNotes)
  const updateSceneNote = useEpisodeStore((state) => state.updateSceneNote)
  const renameBackground = useEpisodeStore((state) => state.renameBackground)

  // Локальный выбор: заметки листаются независимо от того, что сейчас в эфире.
  const [selectedNoteSceneId, setSelectedNoteSceneId] =
    useState(activeBackgroundId)

  const selectedBackground =
    backgrounds.find((item) => item.id === selectedNoteSceneId) ?? backgrounds[0]
  const note = selectedBackground
    ? (sceneNotes[selectedBackground.id] ?? "")
    : ""
  const wordCount = note.trim().split(/\s+/).filter(Boolean).length

  // Разделители те же, что в библиотеке сцен: свои, переименованные, пустые не нужны.
  const groups = useMemo(
    () =>
      sceneGroups
        .map((title) => ({
          title,
          items: backgrounds.filter(
            (background) => background.actGroup === title
          ),
        }))
        .filter((group) => group.items.length > 0),
    [backgrounds, sceneGroups]
  )

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[190px_minmax(0,1fr)]">
      <ScrollArea className="h-full min-h-0">
        <div className="flex flex-col gap-3 pr-3">
          {groups.map((group) => (
            <div key={group.title} className="space-y-1.5">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                {group.title}
              </span>

              {group.items.map((background) => {
                const isSelected = background.id === selectedNoteSceneId
                const isLive = background.id === activeBackgroundId
                const hasNote = Boolean(sceneNotes[background.id]?.trim())

                return (
                  <button
                    key={background.id}
                    type="button"
                    onClick={() => setSelectedNoteSceneId(background.id)}
                    className={cn(
                      "w-full rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-left transition-colors hover:bg-muted",
                      isSelected && "border-ring bg-muted ring-2 ring-ring/40"
                    )}
                  >
                    <span className="flex items-center justify-between gap-1.5 text-[10px] font-medium text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <FileText className="size-3.5" />
                        {background.actGroup}
                      </span>
                      {isLive ? (
                        <Radio className="size-3.5 text-primary" />
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-sm font-medium">
                      {background.title}
                    </span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      {hasNote ? "заметка есть" : "нет заметки"}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </ScrollArea>

      <Card size="sm" className="flex min-h-0 flex-col gap-3">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={selectedBackground?.title ?? ""}
              onChange={(event) => {
                if (selectedBackground) {
                  renameBackground(selectedBackground.id, event.target.value)
                }
              }}
              placeholder="Название сцены"
              aria-label="Название сцены"
              className="h-8 max-w-72 text-sm font-medium"
            />
            {selectedBackground?.id === activeBackgroundId ? (
              <Badge variant="secondary" className="gap-1">
                <Radio className="size-3" />
                В эфире
              </Badge>
            ) : null}
          </div>
          <CardDescription className="flex items-center gap-1.5">
            <MapPin className="size-3.5" />
            {selectedBackground
              ? `${selectedBackground.actGroup}${selectedBackground.isBattlemap ? " · карта местности" : ""}`
              : "—"}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <Textarea
            value={note}
            onChange={(event) => {
              if (selectedBackground) {
                updateSceneNote(selectedBackground.id, event.target.value)
              }
            }}
            className="min-h-32 flex-1 resize-none"
            placeholder="Заметки мастера по сцене: цели, проверки, таймеры, противники…"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="gap-1">
              <ScrollText className="size-3" />
              Markdown
            </Badge>
            <Badge variant="outline">{wordCount} слов</Badge>
            <Badge variant="ghost">Автосохранение</Badge>
          </div>

          <Separator />

          <p className="text-xs text-muted-foreground">
            Листать заметки можно не меняя эфир: в Viewport и на /screen остаётся
            сцена, выбранная в левой панели.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
