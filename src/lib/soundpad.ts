/**
 * Набор иконок саундпада. В сторе и в файле выпуска лежит ИМЯ иконки (строка),
 * а не компонент: React-компоненты не переживают JSON и structured clone.
 * Порядок массива — порядок плиток в выборе иконки.
 */
export const SOUNDPAD_ICON_NAMES = [
  "Swords",
  "Skull",
  "Flame",
  "Zap",
  "Sparkles",
  "ShieldAlert",
  "Volume2",
  "Footprints",
  "Bomb",
  "HeartPulse",
  "Ghost",
  "DoorOpen",
] as const

export type SoundpadIconName = (typeof SOUNDPAD_ICON_NAMES)[number]

/** Иконка нового слота: «звук» без уточнений. */
export const DEFAULT_SOUNDPAD_ICON: SoundpadIconName = "Volume2"

/** Разрешено ли имя иконки: чужие значения из файла выпуска не пускаем в стор. */
export function isSoundpadIconName(value: unknown): value is SoundpadIconName {
  return (
    typeof value === "string" &&
    (SOUNDPAD_ICON_NAMES as readonly string[]).includes(value)
  )
}

/** Имя иконки из файла выпуска, приведённое к разрешённому набору. */
export function normalizeSoundpadIcon(value: unknown): SoundpadIconName {
  return isSoundpadIconName(value) ? value : DEFAULT_SOUNDPAD_ICON
}

/** Название слота по умолчанию, когда Мастер его не указал: «Звук 3». */
export function soundpadTitleFallback(index: number) {
  return `Звук ${index + 1}`
}
