/**
 * Решения музыкального движка для треков актов.
 *
 * Логика «переключать ли музыку при смене сцены» вынесена в чистые функции: их
 * проверяет смоук-прогон (в Node нет ни браузера, ни `HTMLAudioElement`), а
 * `useSoundtrackPlayer` только исполняет полученное решение.
 */

/** Что делать с музыкой акта при смене сцены. */
export type GroupTrackAction =
  /** Ничего не меняем: тот же акт, тот же трек или у акта музыки нет */
  | { type: "keep" }
  /** Включаем трек: `restart` — с начала, иначе с сохранённой позиции */
  | { type: "start"; restart: boolean }
  /** Ручной трек играет: музыку акта поднимем после его паузы */
  | { type: "defer" }

/**
 * Сцена сменилась — решаем судьбу музыки акта:
 *
 * * акт без трека (`requestedId === null`) музыку не трогает — она продолжает играть;
 * * переключение внутри акта (тот же трек) ничего не перезапускает;
 * * новый трек акта проявляется с начала;
 * * если играет ручной трек, музыка акта ждёт паузы (`defer`).
 */
export function resolveGroupTrackAction(input: {
  /** id трека активного акта (`null`/пусто — у акта трека нет) */
  requestedId: string | null
  /** id трека, который сейчас стоит в фоновом канале ("" — канала нет) */
  currentId: string
  /** Играет ли ручной трек из правой панели */
  manualPlaying: boolean
  /** Музыка акта уже заглушена ручным треком */
  suspended: boolean
}): GroupTrackAction {
  const requested = input.requestedId ?? ""
  if (!requested) return { type: "keep" }
  const isSameTrack = requested === input.currentId
  if (input.manualPlaying) {
    return isSameTrack && !input.suspended ? { type: "keep" } : { type: "defer" }
  }
  if (isSameTrack) {
    // Тот же трек: продолжаем с сохранённого места, если он был заглушён.
    return input.suspended ? { type: "start", restart: false } : { type: "keep" }
  }
  return { type: "start", restart: true }
}

/**
 * Пора ли вернуть музыку акта: только после паузы ручного трека и только если
 * она действительно была им перекрыта.
 */
export function shouldResumeGroupTrack(input: {
  suspended: boolean
  manualPlaying: boolean
}) {
  return input.suspended && !input.manualPlaying
}
