import {
  Bomb,
  DoorOpen,
  Flame,
  Footprints,
  Ghost,
  HeartPulse,
  ShieldAlert,
  Skull,
  Sparkles,
  Swords,
  Volume2,
  Zap,
} from "lucide-react"
import {
  DEFAULT_SOUNDPAD_ICON,
  type SoundpadIconName,
} from "@/lib/soundpad"
import type { IconComponent } from "@/data/types"

/**
 * Компоненты иконок саундпада. Сам набор имён объявлен в `@/lib/soundpad` —
 * там же живёт проверка имён из файла выпуска; здесь только маппинг на lucide,
 * потому что React-компоненты в стор и в JSON не уезжают.
 */
export const soundpadIcons: Record<SoundpadIconName, IconComponent> = {
  Swords,
  Skull,
  Flame,
  Zap,
  Sparkles,
  ShieldAlert,
  Volume2,
  Footprints,
  Bomb,
  HeartPulse,
  Ghost,
  DoorOpen,
}

/**
 * Иконка слота по имени из стора. Незнакомое имя (файл из будущей версии,
 * ручная правка JSON) даёт иконку по умолчанию, а не пустую плитку.
 */
export function soundpadIcon(name: string) {
  return (
    soundpadIcons[name as SoundpadIconName] ?? soundpadIcons[DEFAULT_SOUNDPAD_ICON]
  )
}
