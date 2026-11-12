import { RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { dice } from "@/data/content"
import { buildDiceNotation } from "@/lib/dice"
import { MAX_DICE_PER_TYPE, useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"

/**
 * Кубики в нижней панели: шесть круглых кнопок с иконками из `public/dice/`,
 * компактная зона пула и крупная кнопка броска. Логика прежняя: физику считает
 * `/screen`, здесь только выбор пула и запуск события.
 */
export function DiceTab() {
  const dicePool = useEpisodeStore((state) => state.dicePool)
  const lastRoll = useEpisodeStore((state) => state.lastRoll)
  const isRollPending = useEpisodeStore((state) => state.isRollPending)
  const addDie = useEpisodeStore((state) => state.addDie)
  const removeDie = useEpisodeStore((state) => state.removeDie)
  const clearDicePool = useEpisodeStore((state) => state.clearDicePool)
  const triggerDiceRoll = useEpisodeStore((state) => state.triggerDiceRoll)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="grid shrink-0 grid-cols-6 gap-2">
        {dice.map((die) => {
          const count = dicePool.filter((item) => item === die).length
          const isFull = count >= MAX_DICE_PER_TYPE

          return (
            <button
              key={die}
              type="button"
              title="ЛКМ — добавить кубик, ПКМ — убрать"
              onClick={() => addDie(die)}
              onContextMenu={(event) => {
                event.preventDefault()
                removeDie(die)
              }}
              className={cn(
                "relative flex h-12 items-center justify-center rounded-full border transition-colors select-none",
                count > 0
                  ? "border-ring bg-accent"
                  : "border-border bg-muted/40 hover:bg-accent",
                isFull && "opacity-80"
              )}
            >
              <img
                src={`/dice/d${die}.svg`}
                alt={`d${die}`}
                draggable={false}
                className="size-7 invert"
              />
              {count > 0 ? (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-ring text-[10px] font-semibold text-background">
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
        <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Staging
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {dicePool.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              ЛКМ по кубику — добавить, ПКМ — убрать
            </span>
          ) : (
            dicePool.map((die, index) => (
              <span
                key={`${die}-${index}`}
                className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-[11px] font-semibold"
              >
                d{die}
              </span>
            ))
          )}
        </div>
        <Badge variant="ghost" className="shrink-0">
          {dicePool.length}
        </Badge>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="lg"
          variant="secondary"
          disabled={dicePool.length === 0 || isRollPending}
          onClick={() => triggerDiceRoll(buildDiceNotation(dicePool))}
          className="h-14 flex-1 rounded-lg font-heading text-xl font-bold tracking-wide uppercase"
        >
          {isRollPending ? "Кубики летят…" : "LET'S ROLL"}
        </Button>
        <Button
          size="icon-lg"
          variant="outline"
          aria-label="Очистить пул кубиков"
          title="Очистить пул"
          disabled={dicePool.length === 0 || isRollPending}
          onClick={clearDicePool}
        >
          <RotateCcw />
        </Button>
      </div>

      <div className="flex shrink-0 items-center justify-between text-[10px] text-muted-foreground">
        <span>до {MAX_DICE_PER_TYPE} кубиков каждого типа</span>
        {lastRoll ? <span>Прошлый итог: {lastRoll.sum}</span> : null}
      </div>
    </div>
  )
}
