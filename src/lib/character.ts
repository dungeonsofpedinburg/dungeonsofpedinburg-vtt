/** Инициалы из имени: «Ингрид Хальс» → «ИХ». */
export function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const letters = parts.map((part) => part.charAt(0).toUpperCase()).join("")
  return letters || "??"
}
