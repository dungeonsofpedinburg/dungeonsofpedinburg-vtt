import { useEffect, useSyncExternalStore } from "react"
import {
  getSyncInfo,
  initEpisodeSync,
  subscribeSyncInfo,
  type SyncInfo,
  type SyncRole,
} from "@/store/episodeSync"

/** Подключает вкладку к WebSocket-синхронизации на время жизни компонента. */
export function useEpisodeSync(role: SyncRole) {
  useEffect(() => initEpisodeSync(role), [role])
}

/** Статус связи с sync-сервером в реальном времени — для индикаторов. */
export function useSyncInfo(): SyncInfo {
  return useSyncExternalStore(subscribeSyncInfo, getSyncInfo, getSyncInfo)
}
