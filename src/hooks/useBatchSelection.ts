import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * Пишет ли пользователь текст прямо сейчас. `Delete`/`Backspace` в поле ввода или
 * в редакторе заметок должны удалять текст, а не сцены с персонажами, поэтому
 * слушатель клавиш сначала спрашивает об этом.
 */
export function isTextEntryTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false
  if (element.isContentEditable) return true
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)
}

export type BatchSelection = {
  /** Режим выделения включён: на элементах секции видны чекбоксы */
  isSelecting: boolean
  count: number
  isSelected: (id: string) => boolean
  /** ПКМ → «Выделить несколько»: включаем режим и сразу отмечаем этот элемент */
  start: (seedId: string) => void
  /** Клик по элементу в режиме выделения */
  toggle: (id: string) => void
  cancel: () => void
  /** Удалить отмеченное и выйти из режима (кнопка и клавиша Delete) */
  deleteSelected: () => void
}

/**
 * Режим множественного выделения для одной секции (персонажи, сцены, треки,
 * саундпад). Живёт в компоненте секции: стор хранит данные выпуска, а выделение —
 * это состояние интерфейса, ему в файле выпуска делать нечего.
 *
 * Пока режим включён, `Delete`/`Backspace` удаляют отмеченное, `Escape` выходит
 * без удаления. В полях ввода клавиши работают как обычно (см. isTextEntryTarget).
 */
export function useBatchSelection(
  onDelete: (ids: string[]) => void
): BatchSelection {
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const cancel = useCallback(() => {
    setIsSelecting(false)
    setSelectedIds([])
  }, [])

  const start = useCallback((seedId: string) => {
    setIsSelecting(true)
    setSelectedIds(seedId ? [seedId] : [])
  }, [])

  const toggle = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    )
  }, [])

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return
    onDelete(selectedIds)
    cancel()
  }, [cancel, onDelete, selectedIds])

  useEffect(() => {
    if (!isSelecting) return

    function handleKeyDown(event: KeyboardEvent) {
      if (isTextEntryTarget(event.target)) return
      if (event.key === "Escape") {
        event.preventDefault()
        cancel()
        return
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault()
        deleteSelected()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isSelecting, cancel, deleteSelected])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  return {
    isSelecting,
    count: selectedIds.length,
    isSelected: (id: string) => selectedSet.has(id),
    start,
    toggle,
    cancel,
    deleteSelected,
  }
}
