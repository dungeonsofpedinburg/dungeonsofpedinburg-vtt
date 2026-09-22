import type { DieSides, TokenCategory, Track } from "@/data/types"

/**
 * Геометрия сетки боя.
 *
 * Клетка — ровный квадрат со стороной 6.7% ширины экрана. Целое число таких
 * квадратов в ширину и высоту не укладывается, поэтому рисуются только ровные
 * клетки, а «сдача» (остаток ширины и высоты) делится пополам и остаётся по
 * краям карты — в этих неровных полосах токены ставить нельзя.
 *
 * Поле всегда сохраняет пропорцию 1440×1080, поэтому проценты и доли ниже
 * дают одинаковые пропорции и в панели мастера, и в Viewport, и на /screen.
 */

/** Отношение высоты сцены к ширине (1080 / 1440). */
const STAGE_ASPECT = 0.75

/** Сторона ровной клетки в долях ширины поля: 6.7%. */
export const GRID_CELL_RATIO = 0.067

/** Токен занимает 92% клетки по ширине и высоте — везде одинаково. */
export const TOKEN_CELL_RATIO = 0.92

/** Та же клетка в долях высоты поля (клетка квадратная, поле шире, чем выше). */
export const GRID_CELL_HEIGHT_RATIO = GRID_CELL_RATIO / STAGE_ASPECT

/** Сколько ровных квадратов влезает по ширине и по высоте. */
export const GRID_COLUMNS = Math.floor(1 / GRID_CELL_RATIO)
export const GRID_ROWS = Math.floor(1 / GRID_CELL_HEIGHT_RATIO)

/** «Сдача» по краям, в долях размеров поля. */
const gridOffsetX = (1 - GRID_COLUMNS * GRID_CELL_RATIO) / 2
const gridOffsetY = (1 - GRID_ROWS * GRID_CELL_HEIGHT_RATIO) / 2

/** Размер клетки в процентах от ширины и высоты поля (для CSS). */
export const gridCellPercent = {
  width: GRID_CELL_RATIO * 100,
  height: GRID_CELL_HEIGHT_RATIO * 100,
}

/** Отступы «сдачи» в процентах от ширины и высоты поля (для CSS). */
export const gridOffsetPercent = {
  x: gridOffsetX * 100,
  y: gridOffsetY * 100,
}

/** Геометрия для пересчёта точки указателя в ровную клетку. */
export const gridGeometry = {
  columns: GRID_COLUMNS,
  rows: GRID_ROWS,
  offsetX: gridOffsetX,
  offsetY: gridOffsetY,
  cellWidth: GRID_CELL_RATIO,
  cellHeight: GRID_CELL_HEIGHT_RATIO,
}

export const mapGrid = { columns: GRID_COLUMNS, rows: GRID_ROWS }

/** Порядок и подписи колонок панели токенов. */
export const tokenCategories: TokenCategory[] = ["hero", "npc", "enemy", "item"]

export const campaign = {
  title: "Пединбург: Хроники Трёх Ключей",
}

export const dice: DieSides[] = [4, 6, 8, 10, 12, 20]

export const initialTracks: Track[] = [
  { id: "track-01", title: "Порт в тумане", artist: "Lowlands Ensemble", duration: "3:12", tag: "Атмосфера", audioSrc: "", coverSrc: "" },
  { id: "track-02", title: "Шаги в катакомбах", artist: "Lowlands Ensemble", duration: "4:05", tag: "Подземелье", audioSrc: "", coverSrc: "" },
  { id: "track-03", title: "Вальс ратуши", artist: "Pedinburg Chamber", duration: "2:48", tag: "Социальная", audioSrc: "", coverSrc: "" },
  { id: "track-04", title: "Мост Мясников", artist: "Grimworks", duration: "3:37", tag: "Погоня", audioSrc: "", coverSrc: "" },
  { id: "track-05", title: "Молоты под городом", artist: "Grimworks", duration: "5:21", tag: "Бой", audioSrc: "", coverSrc: "" },
  { id: "track-06", title: "Костяной хор", artist: "Chapel of Ash", duration: "6:02", tag: "Ритуал", audioSrc: "", coverSrc: "" },
]
