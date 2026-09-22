import { useEffect } from "react"
import { SceneStage } from "@/components/master-panel/SceneStage"
import { SyncStatusBadge } from "@/components/sync/SyncStatusBadge"
import { useEpisodeSync } from "@/hooks/useEpisodeSync"

/**
 * Экран для OBS: фиксированные 1920×880, полностью прозрачный фон.
 * Состояние получает по WebSocket (server/index.mjs) от вкладки мастера
 * (роль "screen" — только приём), индикатор связи виден в правом верхнем углу.
 *
 * Видео-сцены живут здесь по тем же правилам, что и в панели Мастера:
 * `<video>` рисует общий `SceneStage`, а пауза, повтор и перемотка приходят
 * снапшотом (`videoPlayback`) — поэтому проектор не играет «своё» видео.
 */
export function ObsScreen() {
  useEpisodeSync("screen")

  // Прозрачность для OBS: утилита Tailwind перекрывает base-слой shadcn (body -> bg-background).
  // Заодно привязываем корневой кегль к ширине канваса: от него считается rem-кегль
  // итога броска на подложке (правило html.screen-scale в index.css).
  useEffect(() => {
    document.body.classList.add("bg-transparent")
    document.documentElement.classList.add("screen-scale")
    return () => {
      document.body.classList.remove("bg-transparent")
      document.documentElement.classList.remove("screen-scale")
    }
  }, [])

  return (
    <div className="flex h-svh w-full items-center justify-center overflow-hidden bg-transparent">
      <SceneStage
        className="aspect-[1440/1080] h-full max-h-[1080px] shrink-0"
        diceRole="screen"
      />
      <SyncStatusBadge />
    </div>
  )
}
