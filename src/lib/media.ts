import type { Background, VideoPlaybackState } from "@/data/types"

/**
 * Медиа сцены: видео-фоны живут в тех же полях, что картинки (`Background.src`),
 * поэтому «это видео?» определяется по расширению пути. Правило одно на весь
 * проект: по нему SceneStage выбирает `<video>` вместо `<img>`, библиотека сцен
 * решает, какой обработчик звать, а плеер Мастера — показывать ли себя.
 */

/** Расширения видео, которые играет браузер и раздаёт сервер ассетов. */
export const VIDEO_EXTENSIONS = [".mp4", ".webm"]

/** Видео ли путь: `/assets/videos/intro.mp4` → true, `/assets/scenes/x.jpg` → false. */
export function isVideoSrc(src: string | null | undefined) {
  const path = (src ?? "").trim().toLowerCase().split("?")[0]
  return VIDEO_EXTENSIONS.some((extension) => path.endsWith(extension))
}

/** Видео ли выбранный в проводнике файл: по MIME, а при пустом MIME — по имени. */
export function isVideoFile(file: Pick<File, "type" | "name">) {
  return file.type.startsWith("video/") || isVideoSrc(file.name)
}

/**
 * Зацикливать ли видео-сцену. Настройки нет — значит «да»: у картинок она
 * смысла не имеет, а файлы выпуска старого формата её не знают.
 */
export function isLoopEnabled(background: Pick<Background, "isLoop">) {
  return background.isLoop !== false
}

/**
 * Порог перемотки: расхождения меньше этого (в секундах) не трогаем, иначе
 * текущий кадр дёргался бы на каждой команде паузы.
 */
export const VIDEO_SEEK_EPSILON = 0.3

/** Нужно ли выставлять `currentTime`: команда перемотки против текущей позиции. */
export function shouldSeekVideo(currentTime: number, seekTime: number) {
  return Math.abs(currentTime - seekTime) > VIDEO_SEEK_EPSILON
}

/**
 * Следующая метка события перемотки: строго больше предыдущей. `Date.now()`
 * одного миллисекундного тика мало — две команды подряд получили бы одинаковую
 * метку, и вторая потерялась бы в эффектах обоих окон.
 */
export function nextSeekId(previous = 0) {
  return Math.max(Date.now(), previous + 1)
}

/** Стартовое состояние видео-фона: играет, зациклено, с начала. */
export function initialVideoPlayback(isLoop = true, previousSeekId = 0): VideoPlaybackState {
  return {
    isPlaying: true,
    isLoop,
    seekTime: 0,
    seekId: nextSeekId(previousSeekId),
  }
}

/**
 * Состояние видео при выходе сцены в эфир: новое видео стартует с начала и
 * играет в обоих окнах, а повтор берём из настроек самой сцены (по умолчанию да).
 */
export function videoPlaybackForScene(
  background: Pick<Background, "isLoop"> | null | undefined,
  previousSeekId = 0
): VideoPlaybackState {
  return initialVideoPlayback(
    background ? isLoopEnabled(background) : true,
    previousSeekId
  )
}

/** Таймкод плеера: 90 → «01:30», 3690 → «1:01:30». Часы появляются по нужде. */
export function formatMediaTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00"
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  const pad = (value: number) => String(value).padStart(2, "0")
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${pad(minutes)}:${pad(rest)}`
}
