import { useCallback, useMemo, useState } from "react"
import type { DragEvent } from "react"
import { Grid3x3, Trash2, Users } from "lucide-react"
import { BattleMapGrid } from "@/components/master-panel/BattleMapGrid"
import { TokenPanel } from "@/components/master-panel/TokenPanel"
import {
  tokenCategoryAtPoint,
  tokenStyles,
} from "@/components/master-panel/tokenAppearance"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { gridGeometry, mapGrid } from "@/data/content"
import { backgroundIcons } from "@/data/seed"
import {
  resolveCellFromPoint,
  useGridDrop,
  type DragPayload,
} from "@/hooks/useGridDrop"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"
import type { Character } from "@/data/types"

export function BattleMapTab() {
  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const activeMapId = useEpisodeStore((state) => state.activeMapId)
  const characters = useEpisodeStore((state) => state.characters)
  const allMapTokens = useEpisodeStore((state) => state.mapTokens)
  const addToken = useEpisodeStore((state) => state.addToken)
  const setTokenPosition = useEpisodeStore((state) => state.setTokenPosition)
  const removeToken = useEpisodeStore((state) => state.removeToken)
  const setActiveMap = useEpisodeStore((state) => state.setActiveMap)
  const setCharacterCategory = useEpisodeStore(
    (state) => state.setCharacterCategory
  )
  const toggleBattlemapMode = useEpisodeStore(
    (state) => state.toggleBattlemapMode
  )

  const [activeTokenId, setActiveTokenId] = useState<string | null>(null)

  const battlemaps = useMemo(
    () => backgrounds.filter((item) => item.isBattlemap),
    [backgrounds]
  )
  // Если карта не выбрана — показываем первую, но стор не трогаем (только чтение).
  const activeMap =
    battlemaps.find((item) => item.id === activeMapId) ?? battlemaps[0] ?? null

  // У каждой карты своя раскладка — работаем только с токенами активной карты.
  const mapTokens = useMemo(
    () =>
      activeMap
        ? allMapTokens.filter((token) => token.mapId === activeMap.id)
        : [],
    [activeMap, allMapTokens]
  )

  // «Выбранный» токен карты — последний кликнутый или перетаскиваемый:
  // его карточка в колонках подсвечивается яркой рамкой.
  const activeTokenCharacterId =
    mapTokens.find((token) => token.id === activeTokenId)?.characterId ?? null

  const placeCharacter = useCallback(
    (character: Character, cell: { cellX: number; cellY: number } | null) => {
      if (!cell || !activeMap) return
      const existing = mapTokens.find(
        (token) => token.characterId === character.id
      )
      if (existing) {
        // Обмен местами с занятой клеткой выполняет стор (внутри одной карты).
        setTokenPosition(existing.id, cell.cellX, cell.cellY)
        setActiveTokenId(existing.id)
        return
      }
      const occupied = mapTokens.some(
        (token) => token.cellX === cell.cellX && token.cellY === cell.cellY
      )
      if (occupied) return
      // Стор возвращает id — новый токен сразу становится выбранным.
      const created = addToken(character.id, cell.cellX, cell.cellY, activeMap.id)
      if (created) setActiveTokenId(created)
    },
    [activeMap, addToken, mapTokens, setTokenPosition]
  )

  /**
   * Один жест — два результата: отпустили над сеткой — ставим токен на клетку,
   * отпустили над колонкой категорий — переносим персонажа в другую категорию.
   * Отдельные ручки перетаскивания внутри токенов для этого не нужны.
   */
  const handleGridDrop = useCallback(
    (
      payload: DragPayload,
      cell: { cellX: number; cellY: number } | null,
      point: { clientX: number; clientY: number }
    ) => {
      const character = characters.find(
        (item) => item.id === payload.characterId
      )
      if (!character) return
      if (cell) {
        placeCharacter(character, cell)
        return
      }
      const category = tokenCategoryAtPoint(point.clientX, point.clientY)
      if (category && category !== character.category) {
        setCharacterCategory(character.id, category)
      }
    },
    [characters, placeCharacter, setCharacterCategory]
  )

  const { gridRef, drag, startDrag } = useGridDrop({
    geometry: gridGeometry,
    onDrop: handleGridDrop,
  })

  const ghostCharacter = drag
    ? characters.find((item) => item.id === drag.characterId)
    : undefined

  /** HTML5-дроп карточки из колонки на поле (в дополнение к pointer-драгу). */
  function handleFieldHtmlDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const character = characters.find(
      (item) => item.id === event.dataTransfer.getData("text/plain")
    )
    if (!character) return
    const hit = resolveCellFromPoint(
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY,
      gridGeometry
    )
    placeCharacter(character, hit && hit.inside ? hit : null)
  }

  return (
    <ScrollArea className="h-full pr-1">
      <div className="flex flex-col gap-3 pr-3">
      <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/20 p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <Grid3x3 className="size-3.5" />
            Карты местности
          </span>
          <Badge variant="outline">
            {mapTokens.length} токенов · {mapGrid.columns} × {mapGrid.rows}
          </Badge>
        </div>

        {battlemaps.length === 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Карт пока нет — назначьте сцену картой:
            </span>
            {backgrounds.slice(0, 4).map((background) => (
              <Button
                key={background.id}
                size="sm"
                variant="outline"
                onClick={() => toggleBattlemapMode(background.id)}
              >
                <Grid3x3 />
                {background.title}
              </Button>
            ))}
          </div>
        ) : (
          <ScrollArea className="w-full">
            <div className="flex items-center gap-2 pb-3">
              {battlemaps.map((background) => {
                const isActive = background.id === activeMap?.id
                const Icon = backgroundIcons[background.id]

                return (
                  <button
                    key={background.id}
                    type="button"
                    title="Открыть карту для расстановки (эфир не меняется)"
                    onClick={() => setActiveMap(background.id)}
                    className={cn(
                      "flex w-32 shrink-0 flex-col gap-1 rounded-lg border border-border bg-muted/40 p-1 text-left transition-colors hover:bg-muted",
                      isActive && "border-ring ring-2 ring-ring/40"
                    )}
                  >
                    <span className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-background">
                      {background.src ? (
                        <img
                          src={background.src}
                          alt={background.title}
                          draggable={false}
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : Icon ? (
                        <Icon className="size-5 text-muted-foreground" />
                      ) : null}
                      {isActive ? (
                        <Badge
                          variant="secondary"
                          className="absolute top-1 left-1"
                        >
                          Открыта
                        </Badge>
                      ) : null}
                    </span>
                    <span className="truncate px-0.5 text-[11px] font-medium">
                      {background.title}
                    </span>
                  </button>
                )
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </div>

      {activeMap ? (
        <>
          <div
            className="relative aspect-[1440/1080] w-full shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleFieldHtmlDrop}
          >
            {activeMap.src ? (
              <img
                src={activeMap.src}
                alt={activeMap.title}
                draggable={false}
                className="absolute inset-0 size-full object-cover"
              />
            ) : null}
            <BattleMapGrid
              gridRef={gridRef}
              mapId={activeMap.id}
              activeTokenId={activeTokenId}
              draggingTokenId={drag?.tokenId ?? null}
              targetCell={
                drag?.inside ? { cellX: drag.cellX, cellY: drag.cellY } : null
              }
              onTokenPointerDown={(tokenId, event) => {
                const token = mapTokens.find((item) => item.id === tokenId)
                if (!token) return
                setActiveTokenId(tokenId)
                startDrag(
                  { tokenId, characterId: token.characterId, fromPanel: false },
                  event
                )
              }}
              onTokenContextMenu={(tokenId) => {
                removeToken(tokenId)
                setActiveTokenId((current) =>
                  current === tokenId ? null : current
                )
              }}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
              <Badge variant="secondary" className="gap-1">
                <Grid3x3 className="size-3" />
                {activeMap.title}
              </Badge>
              {/* Счётчик и уборка поля — поверх карты: отдельная строка снизу
                  съедала место, которое нужно панели токенов. */}
              <div className="pointer-events-auto flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="gap-1 bg-background/80 backdrop-blur-sm"
                >
                  <Users className="size-3" />
                  {mapTokens.length} на поле
                </Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={mapTokens.length === 0}
                  title="Убрать с карты все токены"
                  onClick={() => {
                    mapTokens.forEach((token) => removeToken(token.id))
                    setActiveTokenId(null)
                  }}
                  className="bg-background/80 backdrop-blur-sm"
                >
                  <Trash2 />
                  Убрать все
                </Button>
              </div>
            </div>
          </div>

          {/*
            Панель токенов: четыре колонки в ряд с тонкими вертикальными
            дивайдерами, внутри — компактные круглые аватары без имён и ручек.
            Рамки/подложки убраны: место нужно самой карте.
          */}
          <TokenPanel
            variant="compact"
            mapId={activeMap.id}
            selectedCharacterId={activeTokenCharacterId}
            // Анимация выхода на сцену — только из левой панели: здесь клик по
            // токену просто выбирает персонажа на карте.
            onCardClick={(characterId) => {
              const token = mapTokens.find(
                (item) => item.characterId === characterId
              )
              if (token) setActiveTokenId(token.id)
            }}
            onDragToField={(payload, event) => {
              if (payload.tokenId) setActiveTokenId(payload.tokenId)
              startDrag(payload, event)
            }}
          />
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          Карт местности нет. Назначьте сцену картой кнопками выше или через ПКМ
          в библиотеке фонов.
        </div>
      )}

      {drag && ghostCharacter ? (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
          style={{ left: drag.pointerX, top: drag.pointerY }}
        >
          <span
            className={cn(
              "flex size-8 items-center justify-center overflow-hidden rounded-full border-2 text-[11px] font-semibold shadow-lg",
              tokenStyles[ghostCharacter.category]
            )}
          >
            {ghostCharacter.avatarSrc ? (
              <img
                src={ghostCharacter.avatarSrc}
                alt={ghostCharacter.name}
                draggable={false}
                className="size-full object-cover object-top"
              />
            ) : (
              ghostCharacter.initials
            )}
          </span>
        </span>
      ) : null}
      </div>
    </ScrollArea>
  )
}
