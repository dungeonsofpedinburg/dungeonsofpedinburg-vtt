import { createContext, useContext } from "react"
import type {
  RepeatMode,
  useSoundtrackPlayer,
} from "@/hooks/useSoundtrackPlayer"

/** Плеер саундтрека и режим повтора — то, что видят вкладки и подписи кнопок. */
export type SoundtrackValue = ReturnType<typeof useSoundtrackPlayer> & {
  repeatMode: RepeatMode
  /** Цикл повтора: выключен → весь плейлист → один трек. */
  cycleRepeat: () => void
  /** Подпись кнопки повтора (она же title и aria-label). */
  repeatLabel: string
}

/**
 * Контекст поднимается над вкладками (см. `SoundtrackProvider`): Radix
 * размонтирует неактивные `TabsContent`, поэтому плеер, живущий внутри вкладки,
 * глох при переключении на соседнюю вкладку.
 */
export const SoundtrackContext = createContext<SoundtrackValue | null>(null)

export function useSoundtrack() {
  const value = useContext(SoundtrackContext)
  if (!value) {
    throw new Error("useSoundtrack доступен только внутри SoundtrackProvider")
  }
  return value
}
