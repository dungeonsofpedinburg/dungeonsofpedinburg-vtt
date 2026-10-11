import { useEffect, useRef } from "react"
import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react"
import { motion, useAnimationControls } from "framer-motion"
import {
  GRID_COLUMNS,
  GRID_ROWS,
  TOKEN_CELL_RATIO,
  gridCellPercent,
  gridOffsetPercent,
} from "@/data/content"
import { categoryLabels, tokenStyles } from "@/components/master-panel/tokenAppearance"
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { characterAvatarSrc } from "@/lib/character"
import {
  TOKEN_JUMP_DURATION,
  TOKEN_JUMP_KEYFRAMES,
  TOKEN_JUMP_TIMES,
  TOKEN_MOVE_DURATION,
} from "@/lib/token-motion"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"
import type { Character, MapToken } from "@/data/types"

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
  /** Выделенные рамкой токены: рисуются с золотой обводкой */
  selectedTokenIds?: string[]
  onTokenPointerDown?: (
    tokenId: string,
    event: ReactPointerEvent<HTMLElement>
  ) => void
  /**
   * Содержимое контекстного меню токена. Панель Мастера передаёт здесь меню со
   * сменой состояния и уборкой фишки, а `/screen` — ничего: на проекторе меню не
   * нужно, поэтому системное меню браузера там просто гасится.
   */
  tokenMenu?: (token: MapToken, character: Character) => ReactNode
}

type BattleMapTokenProps = {
  token: MapToken
  character: Character
  isDragged: boolean
  isActive: boolean
  isSelected: boolean
  onPointerDown?: (
    tokenId: string,
    event: ReactPointerEvent<HTMLElement>
  ) => void
  tokenMenu?: (token: MapToken, character: Character) => ReactNode
}

/**
 * Одна фишка на карте — три слоя друг над другом:
 *
 * 1. **Координаты клетки** (внешний `motion.div`). Сдвиг задан в процентах от
 *    размера самой фишки, а он всегда равен клетке, поэтому `100%` — ровно шаг
 *    на одну клетку: перелёт не зависит от пикселей поля. Плавно, easeInOut.
 * 2. **Высота прыжка** (вложенный `motion.div` + `useAnimationControls`). Кадры
 *    отрыва и приземления запускаются в момент смены клетки, одновременно с
 *    началом перелёта: фишка взлетает над траекторией, растёт и садится с
 *    микроотскоком.
 * 3. **Сам токен** — круг с картинкой активного состояния персонажа.
 *
 * Прыжок нужен и на /screen: там фишка едет по той же сетке и той же логике
 * координат, а состояние приходит снапшотом от Мастера — анимация совпадает.
 */
function BattleMapToken({
  token,
  character,
  isDragged,
  isActive,
  isSelected,
  onPointerDown,
  tokenMenu,
}: BattleMapTokenProps) {
  const jump = useAnimationControls()
  const previousCell = useRef<string | null>(null)
  const avatarSrc = characterAvatarSrc(character)

  useEffect(() => {
    const cellKey = `${token.cellX},${token.cellY}`
    const previous = previousCell.current
    previousCell.current = cellKey
    // Первое появление фишки на карте (и снапшот без смены клетки) — без прыжка:
    // иначе при загрузке /screen все токены подпрыгивали бы разом.
    if (previous === null || previous === cellKey) return
    void jump.start({
      ...TOKEN_JUMP_KEYFRAMES,
      transition: {
        duration: TOKEN_JUMP_DURATION,
        times: TOKEN_JUMP_TIMES,
        // Лёгкая пружинная доводка при приземлении: backOut даёт микроотскок.
        ease: ["easeOut", "backOut"],
      },
    })
  }, [jump, token.cellX, token.cellY])

  const tokenNode = (
    <span
      role="button"
      tabIndex={0}
      // Атрибут нужен рамке выделения: по нему ясно, что жест пришёлся по фишке,
      // а не по пустому месту карты.
      data-map-token={token.id}
      title={`${character.name} · ${categoryLabels[character.category]}`}
      // Токен занимает 92% клетки и по ширине, и по высоте.
      style={{
        width: `${TOKEN_CELL_RATIO * 100}%`,
        height: `${TOKEN_CELL_RATIO * 100}%`,
      }}
      onPointerDown={
        onPointerDown ? (event) => onPointerDown(token.id, event) : undefined
      }
      onContextMenu={
        tokenMenu ? undefined : (event) => event.preventDefault()
      }
      className={cn(
        "absolute inset-0 m-auto flex touch-none items-center justify-center overflow-hidden rounded-full border-2 select-none [container-type:inline-size]",
        tokenStyles[character.category],
        // Выделение группы важнее выбора: золотая обводка с отступом.
        isSelected
          ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-background"
          : isActive && "ring-2 ring-ring/60",
        isDragged && "opacity-40",
        onPointerDown && "cursor-grab active:cursor-grabbing"
      )}
    >
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt={character.name}
          draggable={false}
          className="size-full object-cover object-top"
        />
      ) : (
        // Инициалы масштабируются вместе с токеном (34% его ширины).
        <span className="text-[34cqw] leading-none">{character.initials}</span>
      )}
    </span>
  )

  return (
    <motion.div
      className="absolute touch-none"
      style={{
        left: `${gridOffsetPercent.x}%`,
        top: `${gridOffsetPercent.y}%`,
        width: `${gridCellPercent.width}%`,
        height: `${gridCellPercent.height}%`,
      }}
      initial={false}
      animate={{ x: `${token.cellX * 100}%`, y: `${token.cellY * 100}%` }}
      transition={{ duration: TOKEN_MOVE_DURATION, ease: "easeInOut" }}
    >
      <motion.div
        className="flex size-full items-center justify-center"
        initial={{ y: 0, scale: 1, filter: TOKEN_JUMP_KEYFRAMES.filter[0] }}
        animate={jump}
      >
        {tokenMenu ? (
          <ContextMenu>
            <ContextMenuTrigger asChild>{tokenNode}</ContextMenuTrigger>
            {tokenMenu(token, character)}
          </ContextMenu>
        ) : (
          tokenNode
        )}
      </motion.div>
    </motion.div>
  )
}

/**
 * Сетка боя: ровные квадраты со стороной 6.7% ширины экрана. Целое число таких
 * квадратов не укладывается ни по ширине, ни по высоте, поэтому «сдача»
 * (остаток) делится пополам и остаётся по краям — токены ставятся только в
 * ровные клетки. Один компонент используется в панели мастера, в Viewport и на
 * /screen, а размеры заданы в процентах, поэтому пропорции везде одинаковые.
 *
 * Фишки живут отдельным слоем поверх клеток: позиция считается по номеру клетки,
 * а не по DOM-ячейке сетки, — поэтому переезд анимируется дугой (см. BattleMapToken),
 * а не «телепортируется» вместе с разметкой.
 */
export function BattleMapGrid({
  mapId,
  className,
  gridRef,
  draggingTokenId = null,
  targetCell = null,
  activeTokenId = null,
  selectedTokenIds,
  onTokenPointerDown,
  tokenMenu,
}: BattleMapGridProps) {
  const mapTokens = useEpisodeStore((state) => state.mapTokens)
  const characters = useEpisodeStore((state) => state.characters)

  // Каждая карта показывает только свою раскладку.
  const tokensOnMap = mapTokens.filter((token) => token.mapId === mapId)
  const selectedIds = new Set(selectedTokenIds ?? [])

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
          const isTarget =
            targetCell?.cellX === cellX && targetCell?.cellY === cellY

          return (
            <div
              key={`${cellX}-${cellY}`}
              className={cn(
                // Линии сетки — чёрные с прозрачностью 60%: видны и на светлых картах.
                "relative border-t border-l border-black/60",
                isTarget && "bg-accent/50"
              )}
            />
          )
        })}
      </div>

      {/* Слой фишек: позиция считается по номеру клетки (а не по DOM-ячейке),
          поэтому переезд можно анимировать — перелёт плюс прыжок по дуге. */}
      {tokensOnMap.map((token) => {
        const character = characters.find(
          (item) => item.id === token.characterId
        )
        if (!character) return null
        return (
          <BattleMapToken
            key={token.id}
            token={token}
            character={character}
            isDragged={token.id === draggingTokenId}
            isActive={token.id === activeTokenId}
            isSelected={selectedIds.has(token.id)}
            onPointerDown={onTokenPointerDown}
            tokenMenu={tokenMenu}
          />
        )
      })}
    </div>
  )
}
