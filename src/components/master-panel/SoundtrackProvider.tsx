import { useState } from "react"
import type { ReactNode } from "react"
import { SoundtrackContext } from "@/hooks/useSoundtrack"
import type { SoundtrackValue } from "@/hooks/useSoundtrack"
import { useSoundtrackPlayer } from "@/hooks/useSoundtrackPlayer"
import type { RepeatMode } from "@/hooks/useSoundtrackPlayer"
import { useEpisodeStore } from "@/store/useEpisodeStore"

/** Подпись кнопки повтора: она же title и aria-label. */
function repeatLabelFor(repeatMode: RepeatMode) {
  if (repeatMode === "all") return "Повторять плейлист"
  if (repeatMode === "one") return "Повторять один трек"
  return "Повтор выключен"
}

/**
 * Провайдер саундтрека. Плеер обязан жить над вкладками: Radix размонтирует
 * неактивные `TabsContent`, поэтому внутри вкладки «Саундтрек» музыка обрывалась
 * при переключении на соседнюю вкладку. Здесь он живёт столько же, сколько
 * панель Мастера, поэтому воспроизведение не прерывается.
 */
export function SoundtrackProvider({ children }: { children: ReactNode }) {
  const tracks = useEpisodeStore((state) => state.tracks)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off")
  const player = useSoundtrackPlayer(tracks, repeatMode)

  const value: SoundtrackValue = {
    ...player,
    repeatMode,
    cycleRepeat: () =>
      setRepeatMode((mode) =>
        mode === "off" ? "all" : mode === "all" ? "one" : "off"
      ),
    repeatLabel: repeatLabelFor(repeatMode),
  }

  return (
    <SoundtrackContext.Provider value={value}>
      {children}
    </SoundtrackContext.Provider>
  )
}
