import {
  Compass,
  DoorOpen,
  Flame,
  Landmark,
  Map,
  Moon,
  Scroll,
  Skull,
  Swords,
  Trees,
  Warehouse,
  Waves,
} from "lucide-react"
import type {
  ActGroup,
  Background,
  Character,
  IconComponent,
  MapToken,
  SceneNotes,
  SoundpadSlot,
  Track,
} from "@/data/types"

/**
 * Стартовые данные выпуска. Выпуск начинается абсолютно пустым: сцен, персонажей,
 * треков и звуков нет ни одного — мастер наполняет их сам. Никаких демо-данных
 * здесь быть не должно, иначе «Создать новый выпуск» не даёт чистого листа.
 */

/** Разделители сцен: у пустого выпуска один раздел, чтобы было куда добавлять сцены. */
export const actGroups: ActGroup[] = ["Завязка"]

export const initialBackgrounds: Background[] = []

export const initialCharacters: Character[] = []

export const initialTracks: Track[] = []

/** Раскладка токенов на картах: пустой выпуск начинается без фишек. */
export const initialMapTokens: MapToken[] = []

/** Заметки по группам сцен: у пустого выпуска их нет. */
export const initialGroupNotes: SceneNotes = {}

/**
 * Саундпад тоже пуст: звуки — дело конкретного выпуска, готовых эффектов у
 * проекта нет. Мастер добавляет плитки сам, «плюс» в панели аудио.
 */
export const initialSoundpad: SoundpadSlot[] = []

/**
 * Палитра иконок для сцены без картинки. В пустом выпуске иконок по id нет,
 * поэтому берём их из палитры по хэшу id: у одной и той же сцены иконка всегда
 * одна и та же, а список не разрастается вместе с числом сцен.
 */
const SCENE_ICON_PALETTE: IconComponent[] = [
  Waves,
  Flame,
  Warehouse,
  DoorOpen,
  Skull,
  Landmark,
  Swords,
  Compass,
  Moon,
  Map,
  Scroll,
  Trees,
]

/** Иконка-плейсхолдер сцены без картинки (или `undefined` для пустого id). */
export function backgroundIcon(id: string): IconComponent | undefined {
  if (!id) return undefined
  let hash = 0
  for (const char of id) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 100000
  }
  return SCENE_ICON_PALETTE[hash % SCENE_ICON_PALETTE.length]
}



