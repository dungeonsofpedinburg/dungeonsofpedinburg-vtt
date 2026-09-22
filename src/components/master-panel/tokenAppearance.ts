import { tokenCategories } from "@/data/content"
import type { TokenCategory } from "@/data/types"

/**
 * Стили токенов на игровом поле: токен считают «выставленным», поэтому
 * рамка всегда яркая (та же, что у выбранной карточки в колонках).
 */
export const tokenStyles: Record<TokenCategory, string> = {
  hero: "border-zinc-100 bg-primary/25 text-foreground",
  npc: "border-zinc-400 bg-muted text-muted-foreground",
  enemy: "border-red-500 bg-destructive/20 text-destructive",
  item: "border-amber-400 bg-secondary text-secondary-foreground",
}

/**
 * Рамки карточек в колонках: base — обычное состояние, selected — элемент
 * выбран (в левой панели выбранный стоит на сцене, в панели карт — последний
 * кликнутый/перетаскиваемый токен). Цвета заданы явными значениями палитры
 * Tailwind по требованиям макета.
 */
export const categoryBorders: Record<
  TokenCategory,
  { base: string; selected: string }
> = {
  // Герои: серую рамку сменяет белая
  hero: { base: "border-zinc-500", selected: "border-zinc-100" },
  // NPC: тёмно-серую сменяет серая
  npc: { base: "border-zinc-700", selected: "border-zinc-400" },
  // Противники: тёмно-красную сменяет красная
  enemy: { base: "border-red-900", selected: "border-red-500" },
  // Предметы: тёмно-жёлтую сменяет жёлтая
  item: { base: "border-amber-700", selected: "border-amber-400" },
}

export const categoryLabels: Record<TokenCategory, string> = {
  hero: "Герои",
  npc: "NPC",
  enemy: "Противники",
  item: "Предметы",
}

/**
 * Рамки компактных круглых токенов: цвет рамки — это категория персонажа.
 * Требование макета: герои — белая, NPC — серая, противники — красная,
 * предметы — жёлтая. Выбор и метка «уже на карте» показываются не цветом
 * рамки, а кольцами (см. TokenPanel), поэтому категория всегда читается.
 */
export const compactTokenBorders: Record<TokenCategory, string> = {
  hero: "border-zinc-100",
  npc: "border-zinc-500",
  enemy: "border-red-500",
  item: "border-amber-400",
}

/**
 * Атрибут колонки категорий. По нему жест «перетащил и отпустил» понимает, куда
 * попал курсор: над колонкой — меняем категорию, над сеткой — ставим токен на
 * клетку. Так круглому токену не нужны ручки перетаскивания внутри.
 */
export const TOKEN_COLUMN_ATTRIBUTE = "data-token-category"

/** Категория колонки под точкой отпускания (null — отпустили мимо колонок). */
export function tokenCategoryAtPoint(clientX: number, clientY: number) {
  if (typeof document === "undefined") return null
  // Ghost перетаскивания всегда pointer-events-none, поэтому здесь именно колонка.
  const value = document
    .elementFromPoint(clientX, clientY)
    ?.closest(`[${TOKEN_COLUMN_ATTRIBUTE}]`)
    ?.getAttribute(TOKEN_COLUMN_ATTRIBUTE)
  return (tokenCategories as readonly string[]).includes(value ?? "")
    ? (value as TokenCategory)
    : null
}
