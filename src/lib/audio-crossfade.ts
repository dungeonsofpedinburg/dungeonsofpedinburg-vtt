/** Уходящий трек затухает 3 секунды. */
export const CROSSFADE_OUT_MS = 3000

/** Новый трек начинает проявляться на 2-й секунде затухания предыдущего. */
export const CROSSFADE_IN_DELAY_MS = 2000

/** Проявление нового трека тоже длится 3 секунды. */
export const CROSSFADE_IN_MS = 3000

/** Полная длительность перехода: 2 с паузы + 3 с проявления = 5 с. */
export const CROSSFADE_TOTAL_MS = CROSSFADE_IN_DELAY_MS + CROSSFADE_IN_MS

/**
 * Множители громкости на момент `elapsedMs` от начала переключения:
 * `out` — уходящий трек (1 → 0 за 3 с), `in` — новый (0 → 1 со 2-й по 5-ю секунду).
 */
export function crossfadeLevels(elapsedMs: number) {
  const elapsed = Math.max(0, elapsedMs)
  return {
    out: clamp01(1 - elapsed / CROSSFADE_OUT_MS),
    in: clamp01((elapsed - CROSSFADE_IN_DELAY_MS) / CROSSFADE_IN_MS),
  }
}

/** Пора запускать новый трек — на 2-й секунде затухания предыдущего. */
export function isCrossfadeInStarted(elapsedMs: number) {
  return elapsedMs >= CROSSFADE_IN_DELAY_MS
}

/** Переход завершён: уходящий трек можно останавливать. */
export function isCrossfadeFinished(elapsedMs: number) {
  return elapsedMs >= CROSSFADE_TOTAL_MS
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1)
}
