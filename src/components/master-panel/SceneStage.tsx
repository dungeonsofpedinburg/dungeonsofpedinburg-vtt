import { ImageOff, X } from "lucide-react"
import { DiceOverlay } from "@/components/dice/DiceOverlay"
import { BattleMapGrid } from "@/components/master-panel/BattleMapGrid"
import { Button } from "@/components/ui/button"
import { backgroundIcons } from "@/data/seed"
import { ROLL_RESULT_TEXT, formatRollBreakdown } from "@/lib/dice"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"
import type { Background, Character } from "@/data/types"

type SceneStageProps = {
  className?: string
  /** В панели мастера можно закрыть результат броска, на /screen — нет. */
  interactive?: boolean
  /**
   * Кто считает 3D-бросок. По умолчанию "master" — кубиков нет: физику ведёт
   * экран OBS ("screen"), а Мастер получает готовый итог для плашки.
   */
  diceRole?: "master" | "screen"
}

/**
 * Сцена: фон или сетка карты → затемнение при персонаже → выезжающий персонаж.
 * Двухфазная смена: старый персонаж уезжает вниз (350 мс), затем новый выезжает снизу.
 * Фазами управляет стор (stagePhase), поэтому рендер остаётся чистым и работает
 * одинаково в панели мастера и на /screen.
 */
export function SceneStage({
  className,
  interactive = false,
  diceRole = "master",
}: SceneStageProps) {
  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const activeBackgroundId = useEpisodeStore((state) => state.activeBackgroundId)
  const previousBackgroundId = useEpisodeStore(
    (state) => state.previousBackgroundId
  )
  const characters = useEpisodeStore((state) => state.characters)
  const activeCharacterId = useEpisodeStore((state) => state.activeCharacterId)
  const stagePhase = useEpisodeStore((state) => state.stagePhase)
  const stageFromCharacterId = useEpisodeStore(
    (state) => state.stageFromCharacterId
  )
  const stageToCharacterId = useEpisodeStore(
    (state) => state.stageToCharacterId
  )
  const lastRoll = useEpisodeStore((state) => state.lastRoll)
  const clearRoll = useEpisodeStore((state) => state.clearRoll)

  const background = backgrounds.find((item) => item.id === activeBackgroundId)
  const findCharacter = (id: string | null) =>
    characters.find((item) => item.id === id) ?? null

  const outgoingCharacter =
    stagePhase === "idle" ? null : findCharacter(stageFromCharacterId)
  const incomingCharacter =
    stagePhase === "leaving"
      ? null
      : findCharacter(
          stagePhase === "entering" ? stageToCharacterId : activeCharacterId
        )

  const previousBackground =
    previousBackgroundId && previousBackgroundId !== activeBackgroundId
      ? (backgrounds.find((item) => item.id === previousBackgroundId) ?? null)
      : null

  const isCharacterVisible =
    Boolean(outgoingCharacter) || Boolean(incomingCharacter)

  // Слои сцен: уходящая (fade-out) + текущая (fade-in) — тот же приём, что на /screen.
  const backgroundLayers: { background: Background; leaving: boolean }[] = []
  if (previousBackground) {
    backgroundLayers.push({ background: previousBackground, leaving: true })
  }
  if (background) {
    backgroundLayers.push({ background, leaving: false })
  }

  // Единый список слоёв с ключом по id: узел старого персонажа не пересоздаётся,
  // поэтому CSS-переход translate-y-0 → translate-y-full реально проигрывается.
  const layers: { character: Character; leaving: boolean }[] = []
  if (outgoingCharacter) {
    layers.push({ character: outgoingCharacter, leaving: true })
  }
  if (incomingCharacter) {
    layers.push({ character: incomingCharacter, leaving: false })
  }

  return (
    <div className={cn("relative overflow-hidden bg-background", className)}>
      {backgroundLayers.map((layer) => (
        <SceneLayer
          key={layer.background.id}
          background={layer.background}
          leaving={layer.leaving}
          showHint={interactive}
        />
      ))}

      {/* Затемнение идёт поверх фона И поверх сетки карты */}
      <div
        className={cn(
          "absolute inset-0 bg-black/30 backdrop-brightness-75 transition-all duration-500",
          isCharacterVisible ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Каждый персонаж — в собственной абсолютной обёртке по центру:
          так уезжающий и выезжающий слои не выталкивают друг друга по горизонтали.
          inset-y-0 нужен, чтобы у обёртки была определённая высота и h-[88%] у картинки работал. */}
      {layers.map(({ character, leaving }) => (
        <div
          key={character.id}
          className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-end justify-center"
        >
          {character.fullBodyPngSrc ? (
            <img
              src={character.fullBodyPngSrc}
              alt={character.name}
              className={cn(
                "h-[88%] w-auto max-w-none object-contain",
                leaving
                  ? "translate-y-full transition-transform duration-[350ms] ease-out"
                  : stagePhase === "entering"
                    ? "animate-in slide-in-from-bottom duration-[350ms] ease-out"
                    : "translate-y-0"
              )}
            />
          ) : (
            <div
              className={cn(
                "flex h-[70%] w-40 flex-col items-center justify-end rounded-t-full border border-border bg-muted/60 pb-6 text-center",
                leaving
                  ? "translate-y-full transition-transform duration-[350ms] ease-out"
                  : stagePhase === "entering"
                    ? "animate-in slide-in-from-bottom duration-[350ms] ease-out"
                    : "translate-y-0"
              )}
            >
              <span className="text-2xl font-semibold text-muted-foreground">
                {character.initials}
              </span>
              <span className="mt-1 px-3 text-xs text-muted-foreground">
                {character.name}
              </span>
            </div>
          )}
        </div>
      ))}

      {/* 3D-кубики: слой поверх персонажей, а итог броска — на нижней части подложки */}
      {diceRole === "screen" ? <DiceOverlay /> : null}

      {/* Итог показываем только в панели Мастера: кубиков и подложки здесь нет,
          поэтому строка встаёт строго по центру сцены. На /screen итог рисует
          DiceOverlay — крупным кеглем на нижних 20% серой подложки. */}
      {lastRoll && diceRole !== "screen" ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex animate-in items-center justify-center fade-in duration-300">
          <span className={cn(ROLL_RESULT_TEXT, "text-3xl")}>
            {formatRollBreakdown(lastRoll.dice, lastRoll.sum, lastRoll.estimated)}
          </span>
        </div>
      ) : null}

      {lastRoll && interactive ? (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Убрать результат"
          onClick={clearRoll}
          className="absolute top-2 right-2 z-50 opacity-70"
        >
          <X />
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Один слой сцены: карта местности, картинка или подсказка для пустой сцены.
 */
function SceneLayer({
  background,
  leaving,
  showHint,
}: {
  background: Background
  leaving: boolean
  showHint: boolean
}) {
  const Icon = backgroundIcons[background.id]

  return (
    <div
      className={cn(
        "absolute inset-0",
        leaving
          ? "pointer-events-none animate-out fade-out duration-500 fill-mode-forwards"
          : "animate-in fade-in duration-500"
      )}
    >
      {background.src ? (
        <img
          src={background.src}
          alt={background.title}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/40 text-center">
          {Icon ? (
            <Icon className="size-8 text-muted-foreground" />
          ) : (
            <ImageOff className="size-8 text-muted-foreground" />
          )}
          <p className="text-sm font-medium">
            {background.title || "Пустая сцена"}
          </p>
          {showHint ? (
            <p className="max-w-xs text-xs text-muted-foreground">
              Двойной клик по миниатюре в библиотеке — добавить картинку сцены
            </p>
          ) : null}
        </div>
      )}

      {/* Карта местности: сетка рисуется ПОВЕРХ картинки, а не вместо неё */}
      {background.isBattlemap ? (
        <BattleMapGrid mapId={background.id} className="absolute inset-0" />
      ) : null}
    </div>
  )
}
