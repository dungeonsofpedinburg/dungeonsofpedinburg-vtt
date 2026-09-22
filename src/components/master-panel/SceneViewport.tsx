import { SceneStage } from "@/components/master-panel/SceneStage"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"

/**
 * Viewport: ничего кроме подписи «Акт • Сцена» и самой сцены.
 * Клик по сцене убирает персонажа с проектора (кнопки в панели токенов тоже работают).
 */
export function SceneViewport() {
  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const activeBackgroundId = useEpisodeStore((state) => state.activeBackgroundId)
  const activeCharacterId = useEpisodeStore((state) => state.activeCharacterId)
  const toggleCharacterOnStage = useEpisodeStore(
    (state) => state.toggleCharacterOnStage
  )

  const background = backgrounds.find((item) => item.id === activeBackgroundId)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {background?.actGroup ?? "Сцена"}
        </span>
        <span className="text-muted-foreground">•</span>
        <span className="truncate text-sm font-medium">
          {background?.title || "Пустая сцена"}
        </span>
      </div>

      <div
        role="presentation"
        title={
          activeCharacterId
            ? "Клик — убрать персонажа со сцены"
            : "Так сцену видят игроки"
        }
        onClick={(event) => {
          // Клик по кнопкам внутри сцены (например, закрыть бросок) не считаем.
          if ((event.target as HTMLElement).closest("button")) return
          if (activeCharacterId) toggleCharacterOnStage(activeCharacterId)
        }}
        className={cn(
          "w-full rounded-lg border border-border bg-muted/40 py-4",
          activeCharacterId ? "cursor-pointer" : "cursor-default"
        )}
      >
        {/* Высота сцены — 20% высоты экрана; по горизонтали центрируется (mx-auto) */}
        <SceneStage
          className="mx-auto aspect-[1440/1080] h-[20vh] rounded-md border border-border"
          interactive
        />
      </div>
    </div>
  )
}
