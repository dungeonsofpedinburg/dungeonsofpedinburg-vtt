import { CheckCheck, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type BatchSelectionBarProps = {
  /** Сколько элементов отмечено */
  count: number
  /** Что удаляем: подпись для скринридера — «персонажей», «сцен» и т. п. */
  itemsLabel: string
  onDelete: () => void
  onCancel: () => void
  className?: string
}

/**
 * Компактная плашка управления режимом множественного выделения: счётчик,
 * удаление выбранного и выход. Одна на все секции (персонажи, сцены, треки,
 * саундпад), чтобы поведение и вид совпадали.
 */
export function BatchSelectionBar({
  count,
  itemsLabel,
  onDelete,
  onCancel,
  className,
}: BatchSelectionBarProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-ring/50 bg-accent/20 px-2 py-1 ${className ?? ""}`}
    >
      <CheckCheck className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs font-medium">Выбрано: {count}</span>
      <span className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant="destructive"
          disabled={count === 0}
          title={`${itemsLabel}: удалить выбранное (клавиша Delete)`}
          onClick={onDelete}
        >
          <Trash2 />
          Удалить выбранные
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Выйти из режима выделения"
          title="Выйти из режима выделения (Escape)"
          onClick={onCancel}
        >
          <X />
        </Button>
      </span>
    </div>
  )
}
