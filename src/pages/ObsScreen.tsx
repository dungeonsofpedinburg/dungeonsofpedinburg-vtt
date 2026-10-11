import { useEffect, useState } from "react"
import { SceneStage } from "@/components/master-panel/SceneStage"
import { SyncStatusBadge } from "@/components/sync/SyncStatusBadge"
import { useEpisodeSync } from "@/hooks/useEpisodeSync"
import {
  STAGE_HEIGHT_PX,
  STAGE_WIDTH_PX,
  stageScale,
} from "@/lib/stage"

/** Масштаб окна: пересчитывается на `window.resize` (и на смене размеров в OBS). */
function useStageScale() {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const update = () =>
      setScale(stageScale(window.innerWidth, window.innerHeight))
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  return scale
}

/**
 * Экран для OBS: виртуальная сцена 1440×1080 (4:3) и чёрная подложка вокруг.
 * Состояние получает по WebSocket (server/index.mjs) от вкладки мастера
 * (роль "screen" — только приём), индикатор связи виден в правом верхнем углу.
 *
 * Видео-сцены живут здесь по тем же правилам, что и в панели Мастера:
 * `<video>` рисует общий `SceneStage`, а пауза, повтор и перемотка приходят
 * снапшотом (`videoPlayback`) — поэтому проектор не играет «своё» видео.
 *
 * Сцена рендерится в фиксированных 1440×1080 (строгое 4:3) и масштабируется
 * целиком (`transform: scale`), поэтому на мониторе 720p головы персонажей,
 * верхние границы карт и кубики видны полностью: без масштабирования сцена
 * растягивалась по высоте окна, и края картинки уходили за пределы дисплея.
 * Поля кадрирования (letterbox/pillarbox) чёрные на всех уровнях: класс
 * `screen-root` красит `html`/`body` (правило в index.css), контейнер страницы и
 * сцена — `bg-black`.
 */
export function ObsScreen() {
  useEpisodeSync("screen")
  const scale = useStageScale()

  // Чёрная подложка вместо `body -> bg-background` из base-слоя shadcn.
  // Заодно привязываем корневой кегль к ширине канваса: от него считается rem-кегль
  // итога броска на подложке (правило html.screen-scale в index.css).
  useEffect(() => {
    document.documentElement.classList.add("screen-root", "screen-scale")
    return () => {
      document.documentElement.classList.remove("screen-root", "screen-scale")
    }
  }, [])

  return (
    <div className="bg-black w-screen h-screen flex items-center justify-center overflow-hidden">
      {/*
        Виртуальная сцена: layout-размер всегда 1440×1080 (внутри — проценты и
        пиксели канваса OBS), а `transform: scale` вписывает её в окно.
        `transformOrigin: center center` держит сцену по центру, полосы вокруг
        остаются чёрными и монолитными.
      */}
      <div
        className="relative shrink-0 bg-black"
        style={{
          width: `${STAGE_WIDTH_PX}px`,
          height: `${STAGE_HEIGHT_PX}px`,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <SceneStage
          className="size-full bg-black"
          diceRole="screen"
        />
      </div>
      <SyncStatusBadge />
    </div>
  )
}
