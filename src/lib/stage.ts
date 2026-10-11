/**
 * Сцена с несколькими персонажами: сколько их пускаем и как раскладываем.
 *
 * Раскладка считается в процентах ширины сцены, поэтому одинаково выглядит и в
 * маленьком превью Мастера, и на проекторе `/screen` (кадр 1440×1080). Позиции живут
 * здесь, а не в компоненте, чтобы их можно было проверить смоуком.
 */

/** Сколько персонажей/предметов пускаем на сцену одновременно. */
export const MAX_STAGE_CHARACTERS = 4

/** Длительность выезда снизу и задвигания вниз, мс. */
export const STAGE_SLIDE_MS = 350

/**
 * Длительность «разъезда» фигур по горизонтали: когда кто-то выходит или уходит,
 * остальные переезжают на новые позиции, мс.
 */
export const STAGE_RELAYOUT_MS = 350

/**
 * Виртуальное разрешение сцены — строго 4:3 (1440×1080). Внутри этого
 * прямоугольника всё считается в пикселях (сетка, фигуры, подложка кубиков), а на
 * экран он попадает целиком через равномерное масштабирование (см. stageScale).
 */
export const STAGE_WIDTH_PX = 1440
export const STAGE_HEIGHT_PX = 1080

/**
 * Масштаб вписывания виртуальной сцены в окно: минимум обеих сторон, поэтому
 * сцена видна целиком при любом разрешении и никогда не обрезается краем экрана.
 * Поля кадрирования вокруг остаются монолитно чёрными.
 * На 1378×720 масштаб равен 0.667 — кадр 960×720 вписывается по высоте целиком.
 */
export function stageScale(viewportWidthPx: number, viewportHeightPx: number) {
  return Math.min(
    viewportWidthPx / STAGE_WIDTH_PX,
    viewportHeightPx / STAGE_HEIGHT_PX
  )
}

/**
 * Готовые раскладки: фигуры равномерно расходятся от центра, а при добавлении
 * или удалении одного героя остальные плавно едут на новые места.
 */
const STAGE_LAYOUTS: Record<number, number[]> = {
  1: [50],
  2: [35, 65],
  3: [25, 50, 75],
  4: [18, 38, 62, 82],
}

/** Позиции фигур в процентах ширины сцены для `count` персонажей. */
export function characterStagePositions(count: number): number[] {
  if (count <= 0) return []
  const known = STAGE_LAYOUTS[count]
  if (known) return known
  // Больше четырёх не пускает стор, но на всякий случай раскладываем равномерно.
  return Array.from(
    { length: count },
    (_, index) => ((index + 1) / (count + 1)) * 100
  )
}

/** Позиция конкретной фигуры: её индекс в списке стоящих на сцене. */
export function characterStagePosition(index: number, count: number) {
  const positions = characterStagePositions(count)
  return positions[index] ?? positions[positions.length - 1] ?? 50
}
