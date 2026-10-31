import type {
  AppearanceSoundMode,
  Background,
  BackgroundState,
} from "@/data/types"

/** id состояния, которое есть у любой сцены: «Обычное». */
export const DEFAULT_BACKGROUND_STATE_ID = "default"

/** Имя состояния по умолчанию. */
export const DEFAULT_BACKGROUND_STATE_NAME = "Обычное"

/**
 * Базовые поля сцены как состояние «Обычное». Отдельного состояния для них нет:
 * у файлов выпуска старого формата состояний не было вовсе, и `src` сцены — ровно
 * это состояние.
 *
 * Флаг карты местности сюда НЕ копируем: он живёт в самой сцене
 * (`background.isBattlemap`) и меняется рубильником в библиотеке. Иначе
 * материализованное «Обычное» заморозило бы старый флаг, и сцена, которую позже
 * сделали картой, осталась бы без сетки и токенов.
 */
export function defaultBackgroundState(background: Background): BackgroundState {
  return {
    id: DEFAULT_BACKGROUND_STATE_ID,
    name: DEFAULT_BACKGROUND_STATE_NAME,
    src: background.src,
  }
}

/**
 * Все состояния сцены: «Обычное» первым, затем добавленные мастером. Если файл
 * пришёл без «Обычного» (или состояний не было вовсе) — подставляем его сами,
 * чтобы в меню всегда был путь назад.
 */
export function backgroundStates(background: Background): BackgroundState[] {
  const states = background.states ?? []
  if (states.some((state) => state.id === DEFAULT_BACKGROUND_STATE_ID)) {
    return states
  }
  return [defaultBackgroundState(background), ...states]
}

/**
 * Активное состояние сцены. Если `activeStateId` пуст или указывает на удалённое
 * состояние — возвращается «Обычное».
 */
export function getBackgroundActiveState(
  background: Background
): BackgroundState {
  const states = backgroundStates(background)
  const active = states.find((state) => state.id === background.activeStateId)
  return active ?? states[0] ?? defaultBackgroundState(background)
}

/** Картинка (или видео) активного состояния: то, что рисует сцена. */
export function backgroundStateSrc(background: Background) {
  return getBackgroundActiveState(background).src
}

/**
 * Карта местности ли активное состояние: сетка рисуется только тогда, когда это
 * разрешает состояние.
 *
 * «Обычное» — это сама сцена, поэтому его флаг всегда берётся из
 * `background.isBattlemap`: материализованное состояние могло запомнить старое
 * значение, и тогда сцена, ставшая картой, теряла сетку и токены. Свой флаг
 * решает только у кастомных состояний («Разрушенная» может быть картой).
 */
export function isBackgroundBattlemap(background: Background) {
  const state = getBackgroundActiveState(background)
  if (state.id === DEFAULT_BACKGROUND_STATE_ID) return background.isBattlemap
  return state.isBattlemap ?? background.isBattlemap
}

/** Есть ли у сцены варианты, кроме «Обычного». */
export function hasCustomBackgroundStates(background: Background) {
  return (background.states ?? []).some(
    (state) => state.id !== DEFAULT_BACKGROUND_STATE_ID
  )
}

export type ResolvedBackgroundAppearance = {
  soundSrc: string
  soundMode: AppearanceSoundMode
}

/**
 * Эффективный звук появления сцены: состояние побеждает сцену, сцена —
 * значения по умолчанию. Логика та же, что у персонажей
 * (`resolveCharacterAppearance`): отсутствие поля — «взять уровень выше»,
 * пустая строка `soundSrc` — осознанное «без звука» на этом уровне.
 */
export function resolveBackgroundAppearance(
  background: Background,
  state: BackgroundState
): ResolvedBackgroundAppearance {
  const override = state.appearance ?? {}
  const base = background.appearance ?? {}
  return {
    soundSrc: override.soundSrc ?? base.soundSrc ?? "",
    soundMode: override.soundMode ?? base.soundMode ?? "once",
  }
}
