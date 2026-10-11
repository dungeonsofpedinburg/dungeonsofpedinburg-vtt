import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DragEvent, PointerEvent as ReactPointerEvent } from "react"
import {
  Check,
  Crosshair,
  Grid3x3,
  Layers,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react"
import { BattleMapGrid } from "@/components/master-panel/BattleMapGrid"
import { AddCharacterStateDialog } from "@/components/master-panel/CharacterDialog"
import { TokenPanel } from "@/components/master-panel/TokenPanel"
import {
  tokenCategoryAtPoint,
  tokenStyles,
} from "@/components/master-panel/tokenAppearance"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { gridGeometry, mapGrid } from "@/data/content"
import { backgroundIcon } from "@/data/seed"
import {
  DEFAULT_CHARACTER_STATE_ID,
  characterAvatarSrc,
  characterStates,
  getCharacterActiveState,
} from "@/lib/character"
import { backgroundStateSrc } from "@/lib/background"
import { isVideoSrc } from "@/lib/media"
import {
  resolveCellFromPoint,
  useGridDrop,
  type DragPayload,
  type FieldRect,
} from "@/hooks/useGridDrop"
import {
  cellCenterFraction,
  cellDistance,
  clusterTargetCells,
  isPointInsideRect,
  normalizeRect,
} from "@/lib/token-cluster"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"
import type { Character } from "@/data/types"

/**
 * Вкладка «Карты местности». Слева — узкий список карт (как список сцен в
 * «Описании сцен»), справа — сетка выбранной карты и колонки категорий токенов
 * под ней. Клик по карте в списке переключает редактируемую карту, эфир при этом
 * не меняется: на проекторе остаётся та сцена, что стоит в библиотеке.
 *
 * Фишки можно выделять рамкой (протяжка по пустому месту) или по одной с
 * Shift/Ctrl и бросать группой: она рассыпается по ближайшим свободным клеткам
 * вокруг цели и прыгает по дуге одновременно (см. src/lib/token-cluster.ts).
 */

/** Ход мыши меньше этого (px) считается кликом, а не протягиванием рамки. */
const MARQUEE_MIN_SIZE = 4

/** Начало протягивания: точка захвата и признак добавления к выделению. */
type MarqueeStart = { startX: number; startY: number; additive: boolean }
/** Рамка выделения: захват плюс текущая точка курсора (в пикселях поля). */
type MarqueeBox = MarqueeStart & { currentX: number; currentY: number }

/** Держим координаты рамки внутри поля, иначе она уезжает за его края. */
function clampToField(value: number, max: number) {
  return Math.min(Math.max(value, 0), max)
}

export function BattleMapTab() {
  const backgrounds = useEpisodeStore((state) => state.backgrounds)
  const activeMapId = useEpisodeStore((state) => state.activeMapId)
  const characters = useEpisodeStore((state) => state.characters)
  const allMapTokens = useEpisodeStore((state) => state.mapTokens)
  const addToken = useEpisodeStore((state) => state.addToken)
  const setTokenPosition = useEpisodeStore((state) => state.setTokenPosition)
  const removeToken = useEpisodeStore((state) => state.removeToken)
  const moveMultipleTokens = useEpisodeStore((state) => state.moveMultipleTokens)
  const setActiveMap = useEpisodeStore((state) => state.setActiveMap)
  const setCharacterCategory = useEpisodeStore(
    (state) => state.setCharacterCategory
  )
  const addCharacterState = useEpisodeStore((state) => state.addCharacterState)
  const setActiveCharacterState = useEpisodeStore(
    (state) => state.setActiveCharacterState
  )
  const removeCharacterState = useEpisodeStore(
    (state) => state.removeCharacterState
  )

  const [activeTokenId, setActiveTokenId] = useState<string | null>(null)
  /** Персонаж, которому добавляют новое состояние внешнего вида. */
  const [stateTargetId, setStateTargetId] = useState<string | null>(null)
  /** Выделенные фишки: рамкой на поле или по одной с Shift/Ctrl. */
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([])
  /** Рамка выделения на экране (пиксели от левого верхнего угла поля). */
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null)
  const marqueeRef = useRef<MarqueeStart | null>(null)

  const stateTarget =
    characters.find((character) => character.id === stateTargetId) ?? null

  const battlemaps = useMemo(
    () => backgrounds.filter((item) => item.isBattlemap),
    [backgrounds]
  )
  // Если карта не выбрана — показываем первую, но стор не трогаем (только чтение).
  const activeMap =
    battlemaps.find((item) => item.id === activeMapId) ?? battlemaps[0] ?? null

  /*
   * Арт локации — кадр АКТИВНОГО состояния карты, а не базовый `src` сцены:
   * картинка (или видео) часто живёт только в состоянии («Ночь»), и поле карты
   * оставалось чёрным. Путь может быть и видео — тогда рисуем <video>.
   */
  const activeMapSrc = activeMap ? backgroundStateSrc(activeMap) : ""

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

  /*
   * Выделение живёт для текущей карты: пропавшие токены отсеиваются сами, а при
   * переключении карты выделение сбрасывает обработчик кнопки в списке карт.
   */
  const selectedTokens = useMemo(
    () => mapTokens.filter((token) => selectedTokenIds.includes(token.id)),
    [mapTokens, selectedTokenIds]
  )

  // Esc снимает выделение: единственный способ «отпустить» группу, не двигая её.
  useEffect(() => {
    if (selectedTokenIds.length === 0) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedTokenIds([])
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedTokenIds.length])

  /** Shift/Ctrl по фишке: добавить или убрать её из выделения. */
  const toggleTokenSelection = useCallback((tokenId: string) => {
    setSelectedTokenIds((current) =>
      current.includes(tokenId)
        ? current.filter((id) => id !== tokenId)
        : [...current, tokenId]
    )
  }, [])

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
   * Групповой бросок выделенных фишек в целевую клетку. Клетки считает
   * кластеризация: цель плюс её ближайшие свободные соседи — в одну клетку
   * фишки не встают, а чужие токены не сдвигаются. Все позиции уходят в стор
   * одним обновлением (`moveMultipleTokens`), поэтому на /screen уезжает один
   * снапшот и вся группа прыгает по дуге одновременно.
   */
  const moveSelectionTo = useCallback(
    (target: { cellX: number; cellY: number }) => {
      if (selectedTokens.length === 0) return
      const moving = new Set(selectedTokens.map((token) => token.id))
      const occupied = mapTokens
        .filter((token) => !moving.has(token.id))
        .map((token) => ({ cellX: token.cellX, cellY: token.cellY }))
      const cells = clusterTargetCells({
        target,
        count: selectedTokens.length,
        occupied,
        columns: mapGrid.columns,
        rows: mapGrid.rows,
      })
      if (cells.length === 0) return
      // Ближайшая к цели фишка встаёт ровно в цель, остальные — вокруг неё.
      const ordered = [...selectedTokens].sort(
        (a, b) => cellDistance(a, target) - cellDistance(b, target)
      )
      moveMultipleTokens(
        ordered.map((token, index) => {
          const cell = cells[index]
          return {
            tokenId: token.id,
            cellX: cell ? cell.cellX : token.cellX,
            cellY: cell ? cell.cellY : token.cellY,
          }
        })
      )
    },
    [mapTokens, moveMultipleTokens, selectedTokens]
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
        const dragged = payload.tokenId
          ? mapTokens.find((token) => token.id === payload.tokenId)
          : undefined
        const isGroupDrag =
          dragged !== undefined &&
          selectedTokens.length > 1 &&
          selectedTokens.some((token) => token.id === dragged.id)
        // Фишку из выделения бросаем всей группой — но только если она реально
        // сменила клетку: клик без движения остаётся простым выбором.
        if (
          isGroupDrag &&
          dragged &&
          (dragged.cellX !== cell.cellX || dragged.cellY !== cell.cellY)
        ) {
          moveSelectionTo(cell)
          return
        }
        placeCharacter(character, cell)
        return
      }
      const category = tokenCategoryAtPoint(point.clientX, point.clientY)
      if (category && category !== character.category) {
        setCharacterCategory(character.id, category)
      }
    },
    [
      characters,
      mapTokens,
      moveSelectionTo,
      placeCharacter,
      selectedTokens,
      setCharacterCategory,
    ]
  )

  const { gridRef, drag, startDrag } = useGridDrop({
    geometry: gridGeometry,
    onDrop: handleGridDrop,
  })

  const ghostCharacter = drag
    ? characters.find((item) => item.id === drag.characterId)
    : undefined

  /**
   * Завершение протягивания рамкой. Ход мыши больше MARQUEE_MIN_SIZE — это
   * выделение: в рамку попадают фишки, чьи центры внутри неё. Меньше — обычный
   * клик: он **снимает выделение целиком**. Двигать группу кликом по клетке
   * больше нельзя — только перетаскиванием её фишки (см. handleGridDrop).
   */
  const finishMarquee = useCallback(
    (event: PointerEvent, rect: FieldRect, start: MarqueeStart) => {
      const endX = clampToField(event.clientX - rect.left, rect.width)
      const endY = clampToField(event.clientY - rect.top, rect.height)
      const dragged =
        Math.max(Math.abs(endX - start.startX), Math.abs(endY - start.startY)) >=
        MARQUEE_MIN_SIZE

      if (dragged) {
        // Рамку и центры фишек считаем в долях поля: выделение не зависит от
        // разрешения карты и размеров окна.
        const band = normalizeRect(
          {
            x: Math.min(start.startX, endX) / rect.width,
            y: Math.min(start.startY, endY) / rect.height,
          },
          {
            x: Math.max(start.startX, endX) / rect.width,
            y: Math.max(start.startY, endY) / rect.height,
          }
        )
        const hits = mapTokens
          .filter((token) =>
            isPointInsideRect(cellCenterFraction(token, gridGeometry), band)
          )
          .map((token) => token.id)
        setSelectedTokenIds((current) =>
          start.additive ? Array.from(new Set([...current, ...hits])) : hits
        )
        return
      }

      // Клик без протяжки снимает выделение со всех фишек. Перемещение группы
      // доступно только перетаскиванием: случайный клик по карте ничего не сдвинет.
      setSelectedTokenIds([])
    },
    [mapTokens]
  )

  /** Текущие габариты поля на экране — нужны и рамке, и клику по клетке. */
  const readFieldRect = useCallback((): FieldRect | null => {
    const element = gridRef.current
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return rect.width > 0 ? rect : null
  }, [gridRef])

  /** ЛКМ по пустому месту поля — начало рамки выделения. */
  function handleFieldPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    // Жесты по фишкам и кнопкам поверх карты — не наше дело.
    if (target.closest("[data-map-token]") || target.closest("button")) return
    const rect = readFieldRect()
    if (!rect) return
    const startX = clampToField(event.clientX - rect.left, rect.width)
    const startY = clampToField(event.clientY - rect.top, rect.height)
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    marqueeRef.current = { startX, startY, additive }
    setMarquee({ startX, startY, currentX: startX, currentY: startY, additive })
  }

  const isMarqueeActive = marquee !== null

  // Пока рамка тянется, слушаем окно: курсор может выйти за пределы поля.
  useEffect(() => {
    if (!isMarqueeActive) return

    function handleMove(event: PointerEvent) {
      const rect = readFieldRect()
      if (!rect) return
      const x = clampToField(event.clientX - rect.left, rect.width)
      const y = clampToField(event.clientY - rect.top, rect.height)
      setMarquee((current) =>
        current ? { ...current, currentX: x, currentY: y } : current
      )
    }

    function handleEnd(event: PointerEvent) {
      const rect = readFieldRect()
      const start = marqueeRef.current
      marqueeRef.current = null
      setMarquee(null)
      if (!rect || !start) return
      finishMarquee(event, rect, start)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleEnd)
    window.addEventListener("pointercancel", handleEnd)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleEnd)
      window.removeEventListener("pointercancel", handleEnd)
    }
  }, [finishMarquee, isMarqueeActive, readFieldRect])

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
        Левая колонка — список карт местности. Ширина строго 5% ширины окна, все
        карточки вписываются в неё по ширине (100%, 4:3) и не распирают фрейм:
        названий в потоке нет — они лежат плашкой поверх нижнего края картинки,
        поэтому длинный текст не ломает высоту карточки. Список листается
        вертикально (ScrollArea на всю высоту колонки).
      */}
      <div className="flex h-full w-[5vw] shrink-0 flex-col gap-2 overflow-hidden p-1">
        <span
          className="flex shrink-0 items-center justify-between gap-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
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
          <ScrollArea className="min-h-0 w-full flex-1">
            <div className="flex w-full min-w-0 flex-col gap-2 pr-1">
              {battlemaps.map((background) => {
                const isActive = background.id === activeMap?.id
                const Icon = backgroundIcon(background.id)
                const tokensHere = allMapTokens.filter(
                  (token) => token.mapId === background.id
                ).length
                // Миниатюра показывает активное состояние карты («Ночь» и т. п.).
                const mapSrc = backgroundStateSrc(background)

                return (
                  <button
                    key={background.id}
                    type="button"
                    title={`${background.title} · ${tokensHere} на поле`}
                    onClick={() => {
                      setActiveMap(background.id)
                      // Выделение живёт в рамках одной карты: при переключении снимаем.
                      setSelectedTokenIds([])
                    }}
                    className={cn(
                      // Строго по ширине колонки: ни min-w, ни фиксированных
                      // пикселей — иначе карточка вылезает за фрейм списка.
                      "relative aspect-[4/3] w-full max-w-full shrink-0 cursor-pointer overflow-hidden rounded-md border border-border bg-muted/30 transition-all hover:border-primary",
                      isActive && "border-primary ring-2 ring-primary"
                    )}
                  >
                    {mapSrc ? (
                      <img
                        src={mapSrc}
                        alt={background.title}
                        draggable={false}
                        className="size-full rounded-md object-cover"
                      />
                    ) : Icon ? (
                      <Icon className="absolute inset-0 m-auto size-4 text-muted-foreground" />
                    ) : (
                      <Grid3x3 className="absolute inset-0 m-auto size-4 text-muted-foreground" />
                    )}

                    {/* Название — плашкой поверх нижнего края: длинный текст
                        обрезается и не увеличивает высоту карточки. */}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-1 py-0.5 text-center text-[10px] text-white">
                      {background.title}
                    </span>

                    {tokensHere > 0 ? (
                      <span className="absolute top-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] tabular-nums text-white">
                        {tokensHere}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Правая область: сетка выбранной карты, под ней — колонки категорий. */}
      {activeMap ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pl-1">
          <div
            className={cn(
              // Поле карты — та же пропорция 4:3, что и сцена: проценты клеток
              // совпадают с эфиром и с Viewport Мастера.
              "relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30",
              isMarqueeActive && "cursor-crosshair"
            )}
            title="Протяните мышь по пустому месту — выделить группу фишек; Shift/Ctrl по фишке — добавить или убрать по одной"
            onPointerDown={handleFieldPointerDown}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleFieldHtmlDrop}
          >
            {/* Арт локации под сеткой: без него поле выглядит чёрным даже у
                карты с картинкой. Клики не перехватывает — жесты живут на поле. */}
            {activeMapSrc ? (
              isVideoSrc(activeMapSrc) ? (
                <video
                  src={activeMapSrc}
                  muted
                  playsInline
                  loop
                  autoPlay
                  className="pointer-events-none absolute inset-0 size-full object-cover"
                />
              ) : (
                <img
                  src={activeMapSrc}
                  alt={activeMap.title}
                  draggable={false}
                  className="pointer-events-none absolute inset-0 size-full object-cover"
                />
              )
            ) : null}
            <BattleMapGrid
              gridRef={gridRef}
              mapId={activeMap.id}
              activeTokenId={activeTokenId}
              selectedTokenIds={selectedTokens.map((token) => token.id)}
              draggingTokenId={drag?.tokenId ?? null}
              targetCell={
                drag?.inside ? { cellX: drag.cellX, cellY: drag.cellY } : null
              }
              onTokenPointerDown={(tokenId, event) => {
                const token = mapTokens.find((item) => item.id === tokenId)
                if (!token) return
                // Shift/Ctrl по фишке — добавить или убрать её из выделения.
                // Перетаскивания в этом случае нет: жест только про выделение.
                if (event.shiftKey || event.ctrlKey || event.metaKey) {
                  event.preventDefault()
                  event.stopPropagation()
                  toggleTokenSelection(tokenId)
                  return
                }
                setActiveTokenId(tokenId)
                // Тянем фишку вне выделения — прежнее выделение снимаем.
                if (!selectedTokenIds.includes(tokenId)) setSelectedTokenIds([])
                startDrag(
                  { tokenId, characterId: token.characterId, fromPanel: false },
                  event
                )
              }}
              // ПКМ по токену: состояние персонажа и уборка фишки с карты.
              tokenMenu={(token, character) => (
                <ContextMenuContent className="w-52">
                  <ContextMenuLabel>{character.name}</ContextMenuLabel>
                  <ContextMenuSeparator />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>
                      <Layers />
                      Состояние
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-56">
                      {characterStates(character).map((state) => {
                        const isStateActive =
                          state.id === getCharacterActiveState(character).id
                        return (
                          <ContextMenuItem
                            key={state.id}
                            onSelect={() =>
                              setActiveCharacterState(character.id, state.id)
                            }
                          >
                            <span className="flex size-4 shrink-0 items-center justify-center">
                              {isStateActive ? (
                                <Check className="size-3.5" />
                              ) : null}
                            </span>
                            <span className="truncate">{state.name}</span>
                          </ContextMenuItem>
                        )
                      })}
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onSelect={() => setStateTargetId(character.id)}
                      >
                        <Plus />
                        Добавить состояние...
                      </ContextMenuItem>
                      {getCharacterActiveState(character).id !==
                      DEFAULT_CHARACTER_STATE_ID ? (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            variant="destructive"
                            onSelect={() =>
                              removeCharacterState(
                                character.id,
                                getCharacterActiveState(character).id
                              )
                            }
                          >
                            <Trash2 />
                            Удалить активное состояние
                          </ContextMenuItem>
                        </>
                      ) : null}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    onSelect={() => {
                      removeToken(token.id)
                      setActiveTokenId((current) =>
                        current === token.id ? null : current
                      )
                      // Фишка ушла с карты — убираем её из выделения.
                      setSelectedTokenIds((current) =>
                        current.filter((id) => id !== token.id)
                      )
                    }}
                  >
                    <Trash2 />
                    Убрать с карты
                  </ContextMenuItem>
                </ContextMenuContent>
              )}
            />

            {/* Рамка выделения: полупрозрачный янтарный бокс поверх карты. */}
            {marquee ? (
              <div
                className="pointer-events-none absolute z-20 border border-amber-400 bg-amber-400/10"
                style={{
                  left: Math.min(marquee.startX, marquee.currentX),
                  top: Math.min(marquee.startY, marquee.currentY),
                  width: Math.abs(marquee.currentX - marquee.startX),
                  height: Math.abs(marquee.currentY - marquee.startY),
                }}
              />
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
              <Badge variant="secondary" className="gap-1">
                <Grid3x3 className="size-3" />
                {activeMap.title}
              </Badge>
              {/* Счётчик и уборка поля — поверх карты: отдельная строка снизу
                  съедала место, которое нужно панели токенов. */}
              <div className="pointer-events-auto flex items-center gap-1.5">
                {selectedTokens.length > 0 ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-400/60 bg-background/80 text-amber-400 backdrop-blur-sm"
                  >
                    <Crosshair className="size-3" />
                    Выделено: {selectedTokens.length}
                  </Badge>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={selectedTokens.length === 0}
                  title="Снять выделение (Esc)"
                  onClick={() => setSelectedTokenIds([])}
                  className="bg-background/80 backdrop-blur-sm"
                >
                  <X />
                  Снять
                </Button>
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
                    setSelectedTokenIds([])
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
            {characterAvatarSrc(ghostCharacter) ? (
              <img
                src={characterAvatarSrc(ghostCharacter)}
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

      {/* Новый вариант внешнего вида: стор сразу делает его активным. */}
      <AddCharacterStateDialog
        key={stateTargetId ?? "map-state-none"}
        open={Boolean(stateTarget)}
        character={stateTarget}
        onOpenChange={(open) => {
          if (!open) setStateTargetId(null)
        }}
        onSubmit={(state) => {
          if (stateTarget) addCharacterState(stateTarget.id, state)
        }}
      />
    </div>
  )
}
