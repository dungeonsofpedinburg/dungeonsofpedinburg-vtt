import { useRef, useState } from "react"
import type { DragEvent, PointerEvent as ReactPointerEvent } from "react"
import { ImagePlus, ListChecks, Pencil, Plus, Tag, Trash2 } from "lucide-react"
import { BatchSelectionBar } from "@/components/master-panel/BatchSelectionBar"
import {
  RenameCharacterDialog,
  ReplaceCharacterImageDialog,
} from "@/components/master-panel/CharacterDialog"
import {
  categoryBorders,
  categoryLabels,
  compactTokenBorders,
  TOKEN_COLUMN_ATTRIBUTE,
  tokenStyles,
} from "@/components/master-panel/tokenAppearance"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { tokenCategories } from "@/data/content"
import { useBatchSelection } from "@/hooks/useBatchSelection"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"
import type { DragPayload } from "@/hooks/useGridDrop"
import type { TokenCategory } from "@/data/types"

/** Вид панели: ряд иконок (левая панель) или колонки под картой местности. */
export type TokenPanelVariant = "icons" | "compact"

type TokenPanelProps = {
  /** Карта, для которой показывается метка «на карте» (null — метка не нужна) */
  mapId?: string | null
  /**
   * Перетаскивание токена на игровое поле. Передаётся только во вкладке карт:
   * в левой панели поля нет.
   */
  onDragToField?: (
    payload: DragPayload,
    event: ReactPointerEvent<HTMLElement>
  ) => void
  /**
   * `icons` — квадратные иконки одной строкой с переносом (левая панель);
   * `compact` — четыре колонки категорий с тонкими вертикальными дивайдерами
   * и круглыми аватарами без имён и ручек (вкладка «Карты местности»).
   */
  variant?: TokenPanelVariant
  /**
   * Смена категории перетаскиванием между колонками. В левой панели выключено:
   * там категория меняется через ПКМ → «Категория».
   */
  allowCategoryDrag?: boolean
  /** Персонаж, чей токен считается выбранным (кольцо вокруг аватара) */
  selectedCharacterId?: string | null
  /**
   * Плитка-кнопка «плюс» в конце ряда иконок (левая панель: новый персонаж).
   * В панели карт не нужна — там свои кнопки.
   */
  onCreate?: () => void
  /**
   * Клик по токену. По умолчанию персонаж выходит на сцену — это поведение
   * левой панели; панель карт подменяет его своим, потому что анимация выхода
   * на сцену разрешена только из левой панели персонажей и предметов.
   */
  onCardClick?: (characterId: string) => void
  className?: string
}

/**
 * Панель токенов из 4 колонок (Герои / NPC / Противники / Предметы).
 * Общая для левой панели мастера и вкладки «Карты местности». В компактном
 * виде колонки разделены тонкими вертикальными чертами, а персонаж — это
 * круглый аватар с рамкой своей категории: ни имён, ни ручек перетаскивания.
 * Перетаскивание между колонками меняет категорию, на поле — ставит на клетку.
 */
export function TokenPanel({
  mapId = null,
  onDragToField,
  variant = "icons",
  allowCategoryDrag = true,
  selectedCharacterId = null,
  onCreate,
  onCardClick,
  className,
}: TokenPanelProps) {
  const characters = useEpisodeStore((state) => state.characters)
  const mapTokens = useEpisodeStore((state) => state.mapTokens)
  const setCharacterCategory = useEpisodeStore(
    (state) => state.setCharacterCategory
  )
  const toggleCharacterOnStage = useEpisodeStore(
    (state) => state.toggleCharacterOnStage
  )
  const renameCharacter = useEpisodeStore((state) => state.renameCharacter)
  const updateCharacterImage = useEpisodeStore(
    (state) => state.updateCharacterImage
  )
  const removeCharacter = useEpisodeStore((state) => state.removeCharacter)
  const deleteBatchCharacters = useEpisodeStore(
    (state) => state.deleteBatchCharacters
  )

  // Выделение персонажей живёт в панели: в стор уезжает только удаление.
  const batch = useBatchSelection(deleteBatchCharacters)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overCategory, setOverCategory] = useState<TokenCategory | null>(null)
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null)
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null)
  // Точка нажатия: если указатель уехал больше 4 px — это драг, а не клик.
  const pressRef = useRef<{ x: number; y: number } | null>(null)

  const renameTarget =
    characters.find((character) => character.id === renameTargetId) ?? null
  const replaceTarget =
    characters.find((character) => character.id === replaceTargetId) ?? null

  const tokensOnMap = mapId
    ? mapTokens.filter((token) => token.mapId === mapId)
    : []

  function handleColumnDrop(
    event: DragEvent<HTMLDivElement>,
    category: TokenCategory
  ) {
    event.preventDefault()
    const characterId = draggingId ?? event.dataTransfer.getData("text/plain")
    setDraggingId(null)
    setOverCategory(null)
    if (!characterId) return
    setCharacterCategory(characterId, category)
  }

  const isIcons = variant === "icons"

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {batch.isSelecting ? (
        <BatchSelectionBar
          count={batch.count}
          itemsLabel="Персонажи"
          onDelete={batch.deleteSelected}
          onCancel={batch.cancel}
        />
      ) : null}

      <div
        className={cn(
          isIcons ? "flex flex-wrap gap-1.5" : "grid grid-cols-4"
        )}
      >
      {tokenCategories.map((category, index) => {
        const items = characters.filter((item) => item.category === category)
        const isOver = overCategory === category

        return (
          <div
            key={category}
            // Колонку находит жест «перетащил и отпустил»: см. tokenCategoryAtPoint.
            {...(isIcons ? {} : { [TOKEN_COLUMN_ATTRIBUTE]: category })}
            onDragOver={(event) => {
              if (!allowCategoryDrag) return
              event.preventDefault()
              if (overCategory !== category) setOverCategory(category)
            }}
            onDragLeave={() => {
              if (!allowCategoryDrag) return
              setOverCategory((value) => (value === category ? null : value))
            }}
            onDrop={(event) => {
              if (!allowCategoryDrag) return
              handleColumnDrop(event, category)
            }}
            className={cn(
              // Левая панель: колонок нет — иконки идут одной линией с переносом.
              isIcons
                ? "contents"
                : cn(
                    "min-w-0 px-2 first:pl-0 last:pr-0",
                    // Соседние колонки разделяет тонкая вертикальная черта:
                    // никаких рамок и серых подложек, только структура.
                    index < tokenCategories.length - 1 &&
                      "border-r border-border",
                    isOver && "bg-accent/20"
                  )
            )}
          >
            {isIcons ? null : (
              <span className="mb-1 block truncate text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                {categoryLabels[category]}
              </span>
            )}

            <div
              className={cn(
                isIcons
                  ? "contents"
                  : "flex min-h-10 flex-wrap content-start gap-1.5"
              )}
            >
              {items.map((character) => {
                const placed = tokensOnMap.find(
                  (token) => token.characterId === character.id
                )
                const isSelected = character.id === selectedCharacterId
                const batchSelected = batch.isSelected(character.id)
                return (
                  <ContextMenu key={character.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        draggable={allowCategoryDrag && !batch.isSelecting}
                        onDragStart={
                          allowCategoryDrag
                            ? (event) => {
                                if (batch.isSelecting) return
                                setDraggingId(character.id)
                                event.dataTransfer.effectAllowed = "move"
                                event.dataTransfer.setData(
                                  "text/plain",
                                  character.id
                                )
                              }
                            : undefined
                        }
                        onDragEnd={
                          allowCategoryDrag
                            ? () => {
                                setDraggingId(null)
                                setOverCategory(null)
                              }
                            : undefined
                        }
                        onPointerDown={(event) => {
                          pressRef.current = {
                            x: event.clientX,
                            y: event.clientY,
                          }
                          // В режиме выделения токен не таскаем: клик только отмечает.
                          if (batch.isSelecting) return
                          if (!onDragToField) return
                          const target = event.target as HTMLElement
                          if (target.closest("[data-drag-handle]")) return
                          onDragToField(
                            {
                              tokenId: placed ? placed.id : null,
                              characterId: character.id,
                              fromPanel: true,
                            },
                            event
                          )
                        }}
                        onClick={(event) => {
                          const press = pressRef.current
                          pressRef.current = null
                          // После короткого перетаскивания тоже приходит click — отсекаем.
                          if (
                            press &&
                            Math.hypot(
                              event.clientX - press.x,
                              event.clientY - press.y
                            ) > 4
                          ) {
                            return
                          }
                          if (batch.isSelecting) {
                            batch.toggle(character.id)
                            return
                          }
                          if (onCardClick) onCardClick(character.id)
                          else toggleCharacterOnStage(character.id)
                        }}
                        title={
                          batch.isSelecting
                            ? `${character.name} — клик отмечает персонажа`
                            : onCardClick
                              ? `${character.name} — клик: выбрать токен; перетащите на поле или в другую колонку`
                              : `${character.name} — клик: на сцену, ПКМ — правка`
                        }
                        className={cn(
                          "border-2 select-none touch-none",
                          isIcons
                            ? cn(
                                "relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-md bg-card transition-colors",
                                categoryBorders[character.category][
                                  isSelected ? "selected" : "base"
                                ]
                              )
                            : cn(
                                // Круглый компактный токен: рамка всегда показывает
                                // категорию, а выбор — внешнее кольцо вокруг него.
                                "relative flex size-10 shrink-0 cursor-grab items-center justify-center rounded-full text-[10px] font-semibold active:cursor-grabbing",
                                compactTokenBorders[character.category],
                                isSelected &&
                                  "ring-2 ring-ring ring-offset-2 ring-offset-background"
                              ),
                          draggingId === character.id && "opacity-60",
                          // Отметка в режиме множественного выделения.
                          batchSelected &&
                            "ring-2 ring-ring ring-offset-2 ring-offset-background"
                        )}
                      >
                    {isIcons ? (
                      character.avatarSrc ? (
                        <img
                          src={character.avatarSrc}
                          alt={character.name}
                          draggable={false}
                          className="size-full object-cover object-top"
                        />
                      ) : (
                        <span
                          className={cn(
                            "flex size-full items-center justify-center text-[11px] font-semibold",
                            tokenStyles[character.category]
                          )}
                        >
                          {character.initials}
                        </span>
                      )
                    ) : (
                      <>
                        <span
                          className={cn(
                            "flex size-full items-center justify-center overflow-hidden rounded-full",
                            tokenStyles[character.category]
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
                            character.initials
                          )}
                        </span>

                        {/* Токен уже стоит на карте: точка у плеча аватара. */}
                        {placed ? (
                          <span
                            aria-hidden
                            className="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-background bg-foreground"
                          />
                        ) : null}
                      </>
                    )}

                    {batch.isSelecting ? (
                      <Checkbox
                        checked={batchSelected}
                        aria-label={`Отметить «${character.name}»`}
                        className="pointer-events-none absolute top-0.5 left-0.5 z-10 bg-background/90"
                      />
                    ) : null}
                      </div>
                    </ContextMenuTrigger>

                    <ContextMenuContent className="w-52">
                      <ContextMenuLabel>{character.name}</ContextMenuLabel>
                      <ContextMenuSeparator />
                      <ContextMenuItem onSelect={() => batch.start(character.id)}>
                        <ListChecks />
                        Выделить несколько
                      </ContextMenuItem>
                      {batch.isSelecting && batchSelected ? (
                        <ContextMenuItem
                          variant="destructive"
                          onSelect={batch.deleteSelected}
                        >
                          <Trash2 />
                          Удалить выбранные ({batch.count})
                        </ContextMenuItem>
                      ) : null}
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onSelect={() => setRenameTargetId(character.id)}
                      >
                        <Pencil />
                        Переименовать
                      </ContextMenuItem>
                      {allowCategoryDrag ? null : (
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>
                            <Tag />
                            Категория
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent>
                            {tokenCategories.map((option) => (
                              <ContextMenuItem
                                key={option}
                                onSelect={() =>
                                  setCharacterCategory(character.id, option)
                                }
                              >
                                <span
                                  className={cn(
                                    "size-3 shrink-0 rounded-full border-2",
                                    categoryBorders[option].selected
                                  )}
                                />
                                {categoryLabels[option]}
                              </ContextMenuItem>
                            ))}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                      )}
                      <ContextMenuItem
                        onSelect={() => setReplaceTargetId(character.id)}
                      >
                        <ImagePlus />
                        Заменить
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() => removeCharacter(character.id)}
                      >
                        <Trash2 />
                        Удалить
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}
            </div>
          </div>
        )
      })}

        {/* Левая панель: последняя плитка ряда — «новый персонаж» вместо кнопки в шапке */}
        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            title="Добавить персонажа или предмет"
            aria-label="Добавить персонажа или предмет"
            className="flex size-11 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-border bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-5" />
          </button>
        ) : null}
      </div>

      <RenameCharacterDialog
        key={renameTargetId ?? "rename-none"}
        open={Boolean(renameTarget)}
        initialName={renameTarget?.name ?? ""}
        onOpenChange={(open) => {
          if (!open) setRenameTargetId(null)
        }}
        onRename={(name) => {
          if (renameTarget) renameCharacter(renameTarget.id, name)
        }}
      />
      <ReplaceCharacterImageDialog
        key={replaceTargetId ?? "replace-none"}
        open={Boolean(replaceTarget)}
        character={replaceTarget}
        onOpenChange={(open) => {
          if (!open) setReplaceTargetId(null)
        }}
        onReplace={(patch) => {
          if (replaceTarget) updateCharacterImage(replaceTarget.id, patch)
        }}
      />
    </div>
  )
}
