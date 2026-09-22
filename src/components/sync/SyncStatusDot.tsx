import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useSyncInfo } from "@/hooks/useEpisodeSync"
import { cn } from "@/lib/utils"
import type { SyncStatus } from "@/store/episodeSync"

const DOT: Record<SyncStatus, string> = {
  idle: "bg-muted-foreground/50",
  connecting: "bg-muted-foreground animate-pulse",
  reconnecting: "bg-destructive animate-pulse",
  waiting: "bg-muted-foreground animate-pulse",
  live: "bg-primary",
}

const LABEL: Record<SyncStatus, string> = {
  idle: "Синхронизация не запущена",
  connecting: "Подключаюсь к sync-серверу…",
  reconnecting: "Нет связи с sync-сервером — переподключаюсь…",
  waiting: "Связь есть, состояние ещё не пришло",
  live: "Экран OBS на связи",
}

/**
 * Индикатор связи в шапке Мастер-панели: сколько экранов OBS подключено
 * к sync-серверу (системный WebSocket на порту 5174).
 */
export function SyncStatusDot() {
  const { status, presence, endpoint } = useSyncInfo()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex cursor-default items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", DOT[status])} />
          экранов: {presence.screens}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-0.5">
          <span>{LABEL[status]}</span>
          <span className="text-muted-foreground">
            {endpoint ?? "адрес sync-сервера ещё не определён"}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
