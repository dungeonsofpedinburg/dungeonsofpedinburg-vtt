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

/** Подсказка в пустой колонке: как выглядит рамка без выбора и с выбором. */
export const categoryHints: Record<TokenCategory, string> = {
  hero: "серая рамка, белая при выборе",
  npc: "тёмно-серая рамка, серая при выборе",
  enemy: "тёмно-красная рамка, красная при выборе",
  item: "тёмно-жёлтая рамка, жёлтая при выборе",
}
