import { useRef, useState } from "react"
import type { DragEvent, PointerEvent as ReactPointerEvent } from "react"
import { GripVertical, ImagePlus, Pencil, Plus, Tag, Trash2 } from "lucide-react"
import {
  RenameCharacterDialog,
  ReplaceCharacterImageDialog,
} from "@/components/master-panel/CharacterDialog"
import {
  categoryBorders,
  categoryHints,
  categoryLabels,
  tokenStyles,
} from "@/components/master-panel/tokenAppearance"
import { Badge } from "@/components/ui/badge"
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
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"
import type { DragPayload } from "@/hooks/useGridDrop"
import type { TokenCategory } from "@/data/types"

type TokenPanelProps = {
  /** Карта, для которой показывается метка «на карте» (null — метка не нужна) */
  mapId?: string | null
  /**
   * Перетаскивание карточки на игровое поле. Передаётся только во вкладке карт:
   * в левой панели поля нет.
   */
  onDragToField?: (
    payload: DragPayload,
    event: ReactPointerEvent<HTMLElement>
  ) => void
  /** Квадратные иконки без подписей — вариант для левой панели мастера */
  iconOnly?: boolean
  /**
   * Смена категории перетаскиванием между колонками. В левой панели выключено:
   * там категория меняется через ПКМ → «Категория».
   */
  allowCategoryDrag?: boolean
  /** Персонаж, чья карточка считается выбранной (рамка становится яркой) */
  selectedCharacterId?: string | null
  /**
   * Плитка-кнопка «плюс» в конце ряда иконок (левая панель: новый персонаж).
   * В панели карт не нужна — там свои кнопки.
   */
  onCreate?: () => void
  /**
   * Клик по карточке. По умолчанию персонаж выходит на сцену — это поведение
   * левой панели; панель карт подменяет его своим, потому что анимация выхода
   * на сцену разрешена только из левой панели персонажей и предметов.
   */
  onCardClick?: (characterId: string) => void
  className?: string
}

/**
 * Панель токенов из 4 колонок (Герои / NPC / Противники / Предметы).
 * Общая для левой панели мастера и вкладки «Карты местности»: слева — только
 * квадратные иконки без перетаскивания между колонками, на картах — карточки
 * с подписями, драг между колонками и дроп на игровое поле.
 */
export function TokenPanel({
  mapId = null,
  onDragToField,
  iconOnly = false,
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

  return (
    <div
      className={cn(
        iconOnly ? "flex flex-wrap gap-1.5" : "grid grid-cols-4 gap-2",
        className
      )}
    >
      {tokenCategories.map((category) => {
        const items = characters.filter((item) => item.category === category)
        const isOver = overCategory === category

        return (
          <div
            key={category}
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
              // Левая панель: колонок нет — все иконки идут одной линией с переносом.
              iconOnly
                ? "contents"
                : "flex min-h-32 flex-col gap-2 rounded-lg border bg-muted/20 p-2 transition-colors",
              !iconOnly &&
                (allowCategoryDrag
                  ? "border-dashed border-border"
                  : "border-border"),
              !iconOnly && isOver && "border-ring bg-accent/30"
            )}
          >
            {iconOnly ? null : (
              <div className="flex items-center justify-between gap-1">
                <span className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase">
                  <span
                    className={cn(
                      "size-3 shrink-0 rounded-full border-2",
                      categoryBorders[category].selected
                    )}
                  />
                  {categoryLabels[category]}
                </span>
                <Badge variant="ghost" className="text-[10px]">
                  {items.length}
                </Badge>
              </div>
            )}

            <div
              className={cn(iconOnly ? "contents" : "flex flex-col gap-1.5")}
            >
              {!iconOnly && items.length === 0 ? (
                <p className="py-2 text-center text-[10px] text-muted-foreground">
                  {categoryHints[category]}
                </p>
              ) : null}

              {items.map((character) => {
                const placed = tokensOnMap.find(
                  (token) => token.characterId === character.id
                )
                const isSelected = character.id === selectedCharacterId
                return (
                  <ContextMenu key={character.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        draggable={allowCategoryDrag}
                        onDragStart={
                          allowCategoryDrag
                            ? (event) => {
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
                          // Ручка (GripVertical) остаётся нативному драгу для смены
                          // колонки, остальная площадь — pointer-драг токена на сетку.
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
                          if (onCardClick) onCardClick(character.id)
                          else toggleCharacterOnStage(character.id)
                        }}
                        title={
                          onCardClick
                            ? `${character.name} — клик — выбрать токен на карте, ПКМ — правка`
                            : iconOnly
                              ? `${character.name} — клик на сцену, ПКМ — правка`
                              : "Клик — на сцену, ПКМ — правка, ручка — смена категории"
                        }
                        className={cn(
                          "border-2 bg-card select-none",
                          iconOnly
                            ? "size-11 shrink-0 cursor-pointer touch-none overflow-hidden rounded-md transition-colors"
                            : "flex cursor-grab touch-none items-center gap-2 rounded-lg px-1.5 py-1.5 active:cursor-grabbing",
                          categoryBorders[character.category][
                            isSelected ? "selected" : "base"
                          ],
                          draggingId === character.id && "opacity-60",
                          placed && "bg-muted/60"
                        )}
                      >
                    {iconOnly ? (
                      <>
                        {character.avatarSrc ? (
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
                        )}
                      </>
                    ) : (
                      <>
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-[10px] font-semibold",
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

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">
                            {character.name}
                          </span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {character.role}
                            {placed ? " · на карте" : ""}
                          </span>
                        </span>

                        <span
                          data-drag-handle
                          title="Перетащить в другую колонку"
                          className="shrink-0 cursor-grab text-muted-foreground"
                        >
                          <GripVertical className="size-3.5" />
                        </span>
                      </>
                    )}
                      </div>
                    </ContextMenuTrigger>

                    <ContextMenuContent className="w-52">
                      <ContextMenuLabel>{character.name}</ContextMenuLabel>
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
