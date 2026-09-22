import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"

export type DragPayload = {
  /** null — токен ещё не на карте (тянем из панели токенов) */
  tokenId: string | null
  characterId: string
  fromPanel: boolean
}

export type DragState = DragPayload & {
  pointerX: number
  pointerY: number
  cellX: number
  cellY: number
  inside: boolean
}

type UseGridDropOptions = {
  /** Геометрия сетки: ровные клетки + «сдача» по краям поля */
  geometry: GridGeometry
  /**
   * `cell = null`, если отпустили вне поля или в неровной краевой полосе.
   * Точка отпускания нужна вызывающему: по ней он различает дроп на поле и
   * дроп в колонку категорий панели токенов.
   */
  onDrop: (
    payload: DragPayload,
    cell: { cellX: number; cellY: number } | null,
    point: { clientX: number; clientY: number }
  ) => void
}

function clamp(value: number, max: number) {
  return Math.min(Math.max(value, 0), max)
}

export type CellHit = {
  inside: boolean
  cellX: number
  cellY: number
}

/** Габариты поля на экране — хватает DOMRect и обычного объекта (для тестов). */
export type FieldRect = {
  left: number
  top: number
  width: number
  height: number
}

/** Геометрия сетки: ровные клетки + «сдача» по краям. */
export type GridGeometry = {
  columns: number
  rows: number
  /** Отступ «сдачи» в долях ширины и высоты поля */
  offsetX: number
  offsetY: number
  /** Сторона ровной клетки в долях ширины и высоты поля */
  cellWidth: number
  cellHeight: number
}

/**
 * Пересчёт точки указателя в клетку сетки.
 * Точки в краевых «неровных» полосах помечаются inside = false —
 * в них токены не ставятся. Используется и pointer-драгом, и HTML5-дропом.
 */
export function resolveCellFromPoint(
  rect: FieldRect,
  clientX: number,
  clientY: number,
  grid: GridGeometry
): CellHit | null {
  if (rect.width <= 0 || rect.height <= 0) return null

  const insideField =
    clientX >= rect.left &&
    clientX <= rect.left + rect.width &&
    clientY >= rect.top &&
    clientY <= rect.top + rect.height

  const localX = (clientX - rect.left) / rect.width
  const localY = (clientY - rect.top) / rect.height
  const rawX = Math.floor((localX - grid.offsetX) / grid.cellWidth)
  const rawY = Math.floor((localY - grid.offsetY) / grid.cellHeight)
  const playable =
    rawX >= 0 && rawX < grid.columns && rawY >= 0 && rawY < grid.rows

  return {
    inside: insideField && playable,
    cellX: clamp(rawX, grid.columns - 1),
    cellY: clamp(rawY, grid.rows - 1),
  }
}

/**
 * Перетаскивание токенов нативных PointerEvents:
 * ghost следует за курсором, при отпускании клетка считается по геометрии поля
 * (жёсткий snapping к центрам клеток — токен рисуется по центру ячейки).
 */
export function useGridDrop({ geometry, onDrop }: UseGridDropOptions) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const payloadRef = useRef<DragPayload | null>(null)

  const resolveCell = useCallback(
    (clientX: number, clientY: number) => {
      const element = gridRef.current
      if (!element) return null
      return resolveCellFromPoint(
        element.getBoundingClientRect(),
        clientX,
        clientY,
        geometry
      )
    },
    [geometry]
  )

  const isDragging = drag !== null

  useEffect(() => {
    if (!isDragging) return

    function handleMove(event: PointerEvent) {
      const resolved = resolveCell(event.clientX, event.clientY)
      setDrag((current) => {
        if (!current) return current
        return {
          ...current,
          pointerX: event.clientX,
          pointerY: event.clientY,
          cellX: resolved ? resolved.cellX : current.cellX,
          cellY: resolved ? resolved.cellY : current.cellY,
          inside: resolved ? resolved.inside : false,
        }
      })
    }

    function handleEnd(event: PointerEvent) {
      const payload = payloadRef.current
      const resolved = resolveCell(event.clientX, event.clientY)
      payloadRef.current = null
      setDrag(null)
      if (!payload) return
      onDrop(
        payload,
        resolved && resolved.inside
          ? { cellX: resolved.cellX, cellY: resolved.cellY }
          : null,
        { clientX: event.clientX, clientY: event.clientY }
      )
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleEnd)
    window.addEventListener("pointercancel", handleEnd)

    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleEnd)
      window.removeEventListener("pointercancel", handleEnd)
    }
  }, [isDragging, onDrop, resolveCell])

  const startDrag = useCallback(
    (payload: DragPayload, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      const resolved = resolveCell(event.clientX, event.clientY)
      payloadRef.current = payload
      setDrag({
        ...payload,
        pointerX: event.clientX,
        pointerY: event.clientY,
        cellX: resolved ? resolved.cellX : 0,
        cellY: resolved ? resolved.cellY : 0,
        inside: resolved ? resolved.inside : false,
      })
    },
    [resolveCell]
  )

  return { gridRef, drag, isDragging, startDrag }
}
