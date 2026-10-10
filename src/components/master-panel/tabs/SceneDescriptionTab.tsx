import { useState } from "react"
import { FileText, MapPin, Music, Radio, ScrollText, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useEpisodeStore } from "@/store/useEpisodeStore"

/**
 * «Описание сцен». Заметки мастера пишутся на группу сцен (акт), а не на
 * отдельную сцену: акт — единица подготовки выпуска.
 *
 * Слева — узкая колонка со списком актов (строго 5% ширины окна, как и колонка
 * карт в соседней вкладке), справа — редактор заметки выбранного акта: сцены,
 * привязанная музыка и счётчик слов.
 */
export function SceneDescriptionTab() {
  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const sceneGroups = useEpisodeStore((state) => state.sceneGroups)
  const activeBackgroundId = useEpisodeStore((state) => state.activeBackgroundId)
  const groupNotes = useEpisodeStore((state) => state.groupNotes)
  const groupTracks = useEpisodeStore((state) => state.groupTracks)
  const updateGroupNote = useEpisodeStore((state) => state.updateGroupNote)
  const renameSceneGroup = useEpisodeStore((state) => state.renameSceneGroup)

  // Выбранный акт держим валидным: список меняется при переименовании групп.
  const [selectedGroup, setSelectedGroup] = useState(sceneGroups[0] ?? "")
  /** Черновик имени акта: переименование уходит в стор на blur или Enter. */
  const [nameDraft, setNameDraft] = useState<string | null>(null)

  const activeGroup = sceneGroups.includes(selectedGroup)
    ? selectedGroup
    : (sceneGroups[0] ?? "")
  const note = activeGroup ? (groupNotes[activeGroup] ?? "") : ""
  const scenesInGroup = backgrounds.filter(
    (item) => item.actGroup === activeGroup
  )
  // Акт, в котором стоит эфирная сцена: в списке он помечен значком «в эфире».
  const liveGroup =
    backgrounds.find((item) => item.id === activeBackgroundId)?.actGroup ?? ""
  const groupTrack = activeGroup ? (groupTracks[activeGroup] ?? null) : null
  const wordCount = note.trim()
    ? note.trim().split(/\s+/).filter(Boolean).length
    : 0

  function commitGroupName() {
    const next = (nameDraft ?? "").trim()
    setSelectedGroup(next || activeGroup)
    if (nameDraft !== null && next && next !== activeGroup) {
      renameSceneGroup(activeGroup, next)
    }
    setNameDraft(null)
  }

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[5vw_minmax(0,1fr)]">
      <ScrollArea className="h-full min-h-0">
        <div className="flex flex-col gap-1.5 pr-1">
          <span
            className="flex items-center gap-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
            title="Группы сцен (акты)"
          >
            <Users className="size-3 shrink-0" />
            <Badge variant="ghost" className="px-1 text-[10px]">
              {sceneGroups.length}
            </Badge>
          </span>

          {sceneGroups.map((group) => {
            const isSelected = group === activeGroup
            const isLive = group === liveGroup
            const hasNote = Boolean(groupNotes[group]?.trim())
            const hasTrack = Boolean(groupTracks[group])
            const count = backgrounds.filter(
              (item) => item.actGroup === group
            ).length

            return (
              <button
                key={group}
                type="button"
                title={`${group} · сцен: ${count}${hasNote ? " · заметка есть" : ""}${hasTrack ? " · есть музыка" : ""}`}
                onClick={() => setSelectedGroup(group)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-lg border border-border bg-muted/30 px-1.5 py-1.5 text-left transition-colors hover:bg-muted",
                  isSelected && "border-primary bg-muted ring-2 ring-primary"
                )}
              >
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <FileText className="size-3 shrink-0" />
                  {count}
                  {hasTrack ? <Music className="size-3 shrink-0" /> : null}
                  {isLive ? (
                    <Radio className="size-3 shrink-0 text-primary" />
                  ) : null}
                </span>
                <span className="block text-[10px] leading-tight font-medium break-words">
                  {group}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {hasNote ? "заметка есть" : "нет заметки"}
                </span>
              </button>
            )
          })}
        </div>
      </ScrollArea>

      <Card size="sm" className="flex min-h-0 flex-col gap-3">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={nameDraft ?? activeGroup}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitGroupName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  commitGroupName()
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  setNameDraft(null)
                }
              }}
              placeholder="Название акта"
              aria-label="Название группы сцен"
              className="h-8 max-w-72 text-sm font-medium"
            />
            {activeGroup === liveGroup && liveGroup ? (
              <Badge variant="secondary" className="gap-1">
                <Radio className="size-3" />
                В эфире
              </Badge>
            ) : null}
            {groupTrack ? (
              <Badge variant="outline" className="gap-1" title={groupTrack.src}>
                <Music className="size-3" />
                {groupTrack.title}
              </Badge>
            ) : null}
          </div>
          <CardDescription className="flex items-center gap-1.5">
            <MapPin className="size-3.5" />
            {activeGroup
              ? `${activeGroup} · сцен: ${scenesInGroup.length}`
              : "Актов пока нет"}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <Textarea
            value={note}
            onChange={(event) => {
              if (activeGroup) updateGroupNote(activeGroup, event.target.value)
            }}
            disabled={!activeGroup}
            className="min-h-32 flex-1 resize-none"
            placeholder="Заметки мастера по акту: цели, проверки, таймеры, противники…"
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
            Заметка относится ко всему акту: сцены одного акта живут под одной
            записью, а листать акты можно не меняя эфир. Музыку акта привязывают
            на разделителе в библиотеке слева — «+» рядом с названием.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
