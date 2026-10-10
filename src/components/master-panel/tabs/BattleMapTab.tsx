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
import { ScrollArea } from "@/components/ui/scroll-area"
import { gridGeometry, mapGrid } from "@/data/content"
import { backgroundIcon } from "@/data/seed"
import {
  resolveCellFromPoint,
  useGridDrop,
  type DragPayload,
} from "@/hooks/useGridDrop"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"
import type { Character } from "@/data/types"

/**
 * Вкладка «Карты местности». Слева — узкий список карт (как список сцен в
 * «Описании сцен»), справа — сетка выбранной карты и колонки категорий токенов
 * под ней. Клик по карте в списке переключает редактируемую карту, эфир при этом
 * не меняется: на проекторе остаётся та сцена, что стоит в библиотеке.
 */
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
    <div className="flex h-full min-h-0 gap-3">
      {/*
        Левая колонка — список карт местности. Как и в «Описании сцен», ширина
        строго 5% ширины окна: квадратные плитки-миниатюры, название в одну
        строку и счётчик токенов.
      */}
      <ScrollArea className="h-full w-[5vw] shrink-0">
        <div className="flex flex-col gap-1.5 pr-1">
          <span
            className="flex items-center justify-between gap-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
            title="Карты местности"
          >
            <Grid3x3 className="size-3 shrink-0" />
            <Badge variant="ghost" className="px-1 text-[10px]">
              {battlemaps.length}
            </Badge>
          </span>

          {battlemaps.length === 0 ? (
            <p
              className="rounded-lg border border-dashed border-border bg-muted/20 px-1.5 py-2 text-[10px] leading-tight text-muted-foreground"
              title="Нет карт местности (сделайте фон картой через ПКМ слева)"
            >
              Нет карт местности (сделайте фон картой через ПКМ слева)
            </p>
          ) : (
            battlemaps.map((background) => {
              const isActive = background.id === activeMap?.id
              const Icon = backgroundIcon(background.id)
              const tokensHere = allMapTokens.filter(
                (token) => token.mapId === background.id
              ).length

              return (
                <button
                  key={background.id}
                  type="button"
                  title={`${background.title} · ${tokensHere} на поле`}
                  onClick={() => setActiveMap(background.id)}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-lg border border-border bg-muted/30 p-1 text-left transition-colors hover:bg-muted",
                    isActive && "border-primary bg-muted ring-2 ring-primary"
                  )}
                >
                  <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-background">
                    {background.src ? (
                      <img
                        src={background.src}
                        alt={background.title}
                        draggable={false}
                        className="absolute inset-0 size-full object-cover"
                      />
                    ) : Icon ? (
                      <Icon className="size-4 text-muted-foreground" />
                    ) : (
                      <Grid3x3 className="size-4 text-muted-foreground" />
                    )}
                    {tokensHere > 0 ? (
                      <span className="absolute right-0.5 bottom-0.5 rounded bg-background/85 px-1 text-[9px] tabular-nums text-muted-foreground">
                        {tokensHere}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate px-0.5 text-[10px] leading-tight font-medium">
                    {background.title}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>

      {/* Правая область: сетка выбранной карты, под ней — колонки категорий. */}
      {activeMap ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pl-1">
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
                  {mapTokens.length} на поле · {mapGrid.columns} × {mapGrid.rows}
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
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          Карт местности пока нет. Правый клик по сцене в библиотеке слева →
          «Сделать картой местности» — карта появится в списке.
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
  )
}
