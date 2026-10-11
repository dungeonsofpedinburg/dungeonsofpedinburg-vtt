/**
 * Раскладка группы токенов при групповом перемещении.
 *
 * Мастер выделяет несколько фишек и бросает их в одну целевую клетку. Ставить
 * всех в одну ячейку нельзя — токены накладывались бы друг на друга. Поэтому
 * группа «рассыпается» по ближайшим свободным клеткам: цель и её ближайшие
 * соседи по возрастанию евклидова расстояния.
 *
 * Клетки, занятые чужими (невыделенными) токенами, исключаются, а вот клетки
 * самих перемещаемых токенов — нет: они как раз освобождаются.
 */

export type GridCell = { cellX: number; cellY: number }

/** Евклидово расстояние между клетками в шагах сетки. */
export function cellDistance(a: GridCell, b: GridCell) {
  return Math.hypot(a.cellX - b.cellX, a.cellY - b.cellY)
}

export type ClusterTargetCellsInput = {
  /** Клетка, куда Мастер указал целью (клик или дроп) */
  target: GridCell
  /** Сколько клеток нужно — по числу выделенных токенов */
  count: number
  /** Клетки, занятые невыделенными токенами */
  occupied: GridCell[]
  columns: number
  rows: number
}

/**
 * Отдаёт `count` клеток, начиная с цели и продолжая ближайшими соседями.
 * Порядок устойчивый: при равных расстояниях клетки идут сверху вниз, слева
 * направо, поэтому один и тот же бросок всегда даёт одну и ту же раскладку.
 * Свободных клеток может не хватить — тогда возвращается сколько есть.
 */
export function clusterTargetCells({
  target,
  count,
  occupied,
  columns,
  rows,
}: ClusterTargetCellsInput): GridCell[] {
  if (count <= 0 || columns <= 0 || rows <= 0) return []

  const taken = new Set(occupied.map((cell) => `${cell.cellX},${cell.cellY}`))
  const free: GridCell[] = []

  for (let cellY = 0; cellY < rows; cellY++) {
    for (let cellX = 0; cellX < columns; cellX++) {
      if (taken.has(`${cellX},${cellY}`)) continue
      free.push({ cellX, cellY })
    }
  }

  return free
    .map((cell) => ({ cell, distance: cellDistance(cell, target) }))
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance
      if (a.cell.cellY !== b.cell.cellY) return a.cell.cellY - b.cell.cellY
      return a.cell.cellX - b.cell.cellX
    })
    .slice(0, count)
    .map((item) => item.cell)
}

/**
 * Центр клетки в долях поля — по этим координатам рамка выделения проверяет,
 * попал ли токен внутрь неё.
 */
export function cellCenterFraction(
  cell: GridCell,
  geometry: {
    offsetX: number
    offsetY: number
    cellWidth: number
    cellHeight: number
  }
) {
  return {
    x: geometry.offsetX + (cell.cellX + 0.5) * geometry.cellWidth,
    y: geometry.offsetY + (cell.cellY + 0.5) * geometry.cellHeight,
  }
}

/** Прямоугольник в долях поля: меньшее значение — левый/верхний край. */
export function normalizeRect(
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  return {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
  }
}

/** Точка внутри прямоугольника (в тех же единицах: доли поля или проценты). */
export function isPointInsideRect(
  point: { x: number; y: number },
  rect: { left: number; right: number; top: number; bottom: number }
) {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  )
}
