/**
 * Плеер звуковых эффектов саундпада.
 *
 * Живёт на уровне модуля, а не внутри компонента: Radix размонтирует неактивные
 * `TabsContent`, поэтому звук, привязанный к вкладке «Саундтрек», обрывался бы при
 * переходе на «Карты» или «Кубики». Здесь же у эффекта свой `<audio>`, который
 * живёт до конца воспроизведения.
 *
 * Музыку эффекты не трогают: у плеера саундтрека свои деки (`useSoundtrackPlayer`),
 * эффект звучит параллельно поверх них и по завершении просто освобождает голос.
 */

/** Сколько эффектов может звучать одновременно: защита от «пулемёта» по кнопке. */
export const MAX_SFX_VOICES = 4

/** Живые голоса: нужны, чтобы гасить самый старый при переполнении. */
const voices = new Set<HTMLAudioElement>()

/** Освобождение голоса: после `ended` (или ошибки) звук больше не держим. */
function release(audio: HTMLAudioElement) {
  voices.delete(audio)
  audio.onended = null
  audio.onerror = null
  // Пустой src отпускает буфер браузера — эффект можно играть снова.
  audio.removeAttribute("src")
}

/** Гасит все звучащие эффекты (например, при сбросе выпуска). */
export function stopAllSfx() {
  for (const audio of voices) {
    audio.pause()
    release(audio)
  }
}

/** Сколько эффектов звучит прямо сейчас (для автотестов и отладки). */
export function activeSfxCount() {
  return voices.size
}

/**
 * Одноразовое воспроизведение эффекта: запускаем и сразу забываем — звук
 * останавливается сам по `ended`. Возвращает `false`, если играть нечего
 * (пустой путь) или аудио недоступно (SSR, тесты в Node).
 */
export function playSfx(src: string) {
  const path = (src ?? "").trim()
  if (!path || typeof Audio === "undefined") return false

  // Лимит голосов: длинный эффект не копит наложения бесконечно.
  if (voices.size >= MAX_SFX_VOICES) {
    const oldest = voices.values().next().value
    if (oldest) {
      oldest.pause()
      release(oldest)
    }
  }

  const audio = new Audio(path)
  audio.onended = () => release(audio)
  audio.onerror = () => release(audio)
  voices.add(audio)
  // Автовоспроизведение может быть запрещено до первого клика — молча отпускаем.
  void audio.play().catch(() => release(audio))
  return true
}
