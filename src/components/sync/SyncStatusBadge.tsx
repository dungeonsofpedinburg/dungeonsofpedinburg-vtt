import { useEffect, useState } from "react"
import { useSyncInfo } from "@/hooks/useEpisodeSync"
import { cn } from "@/lib/utils"
import type { SyncStatus } from "@/store/episodeSync"

/** Сколько держим подтверждение «всё на связи» перед автоскрытием, мс. */
const LIVE_HIDE_MS = 6000

type BadgeMode = "auto" | "always" | "off"

/** `?badge=always|off` — для отладки OBS; по умолчанию индикатор говорит только о проблемах. */
function resolveBadgeMode(): BadgeMode {
  if (typeof location === "undefined") return "auto"
  const raw = new URLSearchParams(location.search).get("badge")
  return raw === "always" || raw === "off" ? raw : "auto"
}

const BADGE_MODE = resolveBadgeMode()

const TEXT: Record<SyncStatus, string> = {
  idle: "Синхронизация не запущена",
  connecting: "Подключение к sync-серверу…",
  reconnecting: "Нет связи с sync-сервером — переподключаюсь…",
  waiting: "OBS Screen Ready (Waiting for Master)",
  live: "OBS Screen Ready",
}

const DOT: Record<SyncStatus, string> = {
  idle: "bg-muted-foreground/50",
  connecting: "bg-muted-foreground animate-pulse",
  reconnecting: "bg-destructive animate-pulse",
  waiting: "bg-muted-foreground animate-pulse",
  live: "bg-primary",
}

/**
 * Индикатор связи для /screen: показываем, пока состояние не пришло,
 * и мягко убираем через несколько секунд после успешного подключения,
 * чтобы надпись не попала в запись стрима.
 */
export function SyncStatusBadge({ className }: { className?: string }) {
  const { status } = useSyncInfo()
  const [isHidden, setIsHidden] = useState(false)
  const [seenStatus, setSeenStatus] = useState(status)

  // Смена статуса — индикатор снова на виду (правка состояния на рендере, без эффекта).
  if (seenStatus !== status) {
    setSeenStatus(status)
    setIsHidden(false)
  }

  useEffect(() => {
    if (status !== "live") return
    const timer = setTimeout(() => setIsHidden(true), LIVE_HIDE_MS)
    return () => clearTimeout(timer)
  }, [status])

  if (BADGE_MODE === "off") return null
  if (BADGE_MODE === "auto" && isHidden) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed right-3 top-3 z-50 flex select-none items-center gap-2",
        "rounded-full border border-border/60 bg-background/50 px-2.5 py-1",
        "text-[11px] leading-none text-muted-foreground backdrop-blur-sm",
        className
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[status])} />
      <span>{TEXT[status]}</span>
    </div>
  )
}
