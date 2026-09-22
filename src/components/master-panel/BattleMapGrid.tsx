import type { PointerEvent as ReactPointerEvent, RefObject } from "react"
import {
  GRID_COLUMNS,
  GRID_ROWS,
  TOKEN_CELL_RATIO,
  gridOffsetPercent,
} from "@/data/content"
import { categoryLabels, tokenStyles } from "@/components/master-panel/tokenAppearance"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"

type BattleMapGridProps = {
  /** Карта, чья раскладка токенов отображается */
  mapId: string
  className?: string
  gridRef?: RefObject<HTMLDivElement | null>
  /** Токен, который сейчас перетаскивают — оригинал скрывается до дропа */
  draggingTokenId?: string | null
  /** Клетка-цель, подсвечивается во время перетаскивания */
  targetCell?: { cellX: number; cellY: number } | null
  activeTokenId?: string | null
  onTokenPointerDown?: (
    tokenId: string,
    event: ReactPointerEvent<HTMLElement>
  ) => void
  onTokenContextMenu?: (tokenId: string) => void
}

/**
 * Сетка боя: ровные квадраты со стороной 6.7% ширины экрана. Целое число таких
 * квадратов не укладывается ни по ширине, ни по высоте, поэтому «сдача»
 * (остаток) делится пополам и остаётся по краям — токены ставятся только в
 * ровные клетки. Один компонент используется в панели мастера, в Viewport и на
 * /screen, а размеры заданы в процентах, поэтому пропорции везде одинаковые.
 */
export function BattleMapGrid({
  mapId,
  className,
  gridRef,
  draggingTokenId = null,
  targetCell = null,
  activeTokenId = null,
  onTokenPointerDown,
  onTokenContextMenu,
}: BattleMapGridProps) {
  const mapTokens = useEpisodeStore((state) => state.mapTokens)
  const characters = useEpisodeStore((state) => state.characters)

  const tokenByCell = new Map<string, { id: string; characterId: string }>()
  // Каждая карта показывает только свою раскладку.
  mapTokens
    .filter((token) => token.mapId === mapId)
    .forEach((token) => {
      tokenByCell.set(`${token.cellX},${token.cellY}`, {
        id: token.id,
        characterId: token.characterId,
      })
    })

  return (
    <div ref={gridRef} className={cn("relative size-full", className)}>
      {/* Ровные клетки; «сдача» остаётся в краевых полосах за границами сетки */}
      <div
        className="absolute grid border-r border-b border-black/60"
        style={{
          left: `${gridOffsetPercent.x}%`,
          right: `${gridOffsetPercent.x}%`,
          top: `${gridOffsetPercent.y}%`,
          bottom: `${gridOffsetPercent.y}%`,
          gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: GRID_COLUMNS * GRID_ROWS }, (_, index) => {
          const cellX = index % GRID_COLUMNS
          const cellY = Math.floor(index / GRID_COLUMNS)
          const token = tokenByCell.get(`${cellX},${cellY}`)
          const character = token
            ? characters.find((item) => item.id === token.characterId)
            : undefined
          const isTarget =
            targetCell?.cellX === cellX && targetCell?.cellY === cellY
          const isDragged = token !== undefined && token.id === draggingTokenId

          return (
            <div
              key={`${cellX}-${cellY}`}
              className={cn(
                // Линии сетки — чёрные с прозрачностью 60%: видны и на светлых картах.
                "relative border-t border-l border-black/60",
                isTarget && "bg-accent/50"
              )}
            >
              {token && character ? (
                <span
                  role="button"
                  tabIndex={0}
                  title={`${character.name} · ${categoryLabels[character.category]}`}
                  // Токен занимает 92% клетки и по ширине, и по высоте.
                  style={{
                    width: `${TOKEN_CELL_RATIO * 100}%`,
                    height: `${TOKEN_CELL_RATIO * 100}%`,
                  }}
                  onPointerDown={
                    onTokenPointerDown
                      ? (event) => onTokenPointerDown(token.id, event)
                      : undefined
                  }
                  onContextMenu={
                    onTokenContextMenu
                      ? (event) => {
                          event.preventDefault()
                          onTokenContextMenu(token.id)
                        }
                      : undefined
                  }
                  className={cn(
                    "absolute inset-0 m-auto flex touch-none items-center justify-center overflow-hidden rounded-full border-2 select-none [container-type:inline-size]",
                    tokenStyles[character.category],
                    token.id === activeTokenId && "ring-2 ring-ring/60",
                    isDragged && "opacity-40",
                    onTokenPointerDown && "cursor-grab active:cursor-grabbing"
                  )}
                >
                  {character.avatarSrc ? (
                    <img
                      src={character.avatarSrc}
                      alt={character.name}
                      draggable={false}
                      className="size-full object-cover object-top"
                    />
                  ) : (
                    // Инициалы масштабируются вместе с токеном (34% его ширины).
                    <span className="text-[34cqw] leading-none">
                      {character.initials}
                    </span>
                  )}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
