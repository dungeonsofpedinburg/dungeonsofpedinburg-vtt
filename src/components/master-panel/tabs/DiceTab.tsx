import { Dices, RotateCcw, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { dice } from "@/data/content"
import { buildDiceNotation } from "@/lib/dice"
import { MAX_DICE_PER_TYPE, useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"

export function DiceTab() {
  const dicePool = useEpisodeStore((state) => state.dicePool)
  const lastRoll = useEpisodeStore((state) => state.lastRoll)
  const isRollPending = useEpisodeStore((state) => state.isRollPending)
  const addDie = useEpisodeStore((state) => state.addDie)
  const removeDie = useEpisodeStore((state) => state.removeDie)
  const clearDicePool = useEpisodeStore((state) => state.clearDicePool)
  const triggerDiceRoll = useEpisodeStore((state) => state.triggerDiceRoll)
  // Идёт бросок: ждём физику с /screen (флаг сбрасывает стор).
  const isRolling = isRollPending

  return (
    <ScrollArea className="h-full pr-1">
      <div className="flex flex-col gap-3 pr-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {dice.map((die) => {
          const count = dicePool.filter((item) => item === die).length
          const isFull = count >= MAX_DICE_PER_TYPE

          return (
            <Button
              key={die}
              size="lg"
              variant={count > 0 ? "default" : "secondary"}
              title="ЛКМ — добавить кубик, ПКМ — убрать"
              className={cn(
                "relative h-12 text-sm font-semibold select-none",
                isFull && "opacity-80"
              )}
              onClick={() => addDie(die)}
              onContextMenu={(event) => {
                event.preventDefault()
                removeDie(die)
              }}
            >
              d{die}
              {count > 0 ? (
                <Badge
                  variant="secondary"
                  className="absolute -top-1.5 -right-1.5"
                >
                  {count}
                </Badge>
              ) : null}
            </Button>
          )
        })}
      </div>

      <div className="min-h-28 rounded-lg border border-dashed border-border bg-muted/20 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5" />
            Staging area
          </span>
          <Badge variant="ghost">{dicePool.length} кубиков</Badge>
        </div>

        {dicePool.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Зона пуста. ЛКМ по кубику — добавить, ПКМ — убрать.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {dicePool.map((die, index) => (
              <span
                key={`${die}-${index}`}
                className="flex size-10 items-center justify-center rounded-md border border-border bg-card text-xs font-semibold"
              >
                d{die}
              </span>
            ))}
          </div>
        )}
      </div>

      <Card size="sm" className="mt-auto shrink-0 gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dices className="size-4 text-muted-foreground" />
            Бросок{dicePool.length > 0 ? ` · ${dicePool.length} кубиков` : ""}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Кубики летят на экране OBS, итог возвращается в плашку
            </span>
            {lastRoll ? (
              <Badge variant="outline">Прошлый итог: {lastRoll.sum}</Badge>
            ) : null}
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="lg"
              className="h-12 flex-1 gap-2 text-sm font-semibold tracking-wide uppercase"
              disabled={dicePool.length === 0 || isRolling}
              onClick={() => triggerDiceRoll(buildDiceNotation(dicePool))}
            >
              <Dices className="size-5" />
              {isRolling ? "Кубики летят…" : "LET'S ROLL"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12"
              disabled={dicePool.length === 0}
              onClick={clearDicePool}
            >
              <RotateCcw />
              Очистить
            </Button>
          </div>
        </CardContent>

        <CardFooter className="justify-between gap-2 text-xs text-muted-foreground">
          <span>Физику считает /screen — числа совпадают у Мастера и в OBS.</span>
          <span>до {MAX_DICE_PER_TYPE} кубиков каждого типа</span>
        </CardFooter>
      </Card>
      </div>
    </ScrollArea>
  )
}
