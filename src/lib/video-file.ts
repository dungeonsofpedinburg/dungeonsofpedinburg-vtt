import {
  assetFileName,
  episodeAssetFolder,
  extensionFromDataUrl,
} from "@/lib/asset-url"
import { saveAssetToLibrary } from "@/lib/asset-upload"
import { isVideoFile } from "@/lib/media"

/** Папка видео-сцен внутри папки выпуска: `assets/episodes/<slug>/videos`. */
export const VIDEO_FOLDER = "videos"

/** Файлы больше этого размера вызывают предупреждение в диалоге. */
const WARN_VIDEO_SIZE = 200 * 1024 * 1024

export type PreparedVideo = {
  /**
   * Относительный путь к выгруженному файлу внутри папки выпуска:
   * `/assets/episodes/port-v-tumane/videos/bg-1-intro.mp4`
   */
  src: string
  warning?: string
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
    reader.readAsDataURL(file)
  })
}

/**
 * Готовит видео к хранению: файл сразу ложится в папку выпуска
 * `assets/episodes/<slug>/videos` (его принимает локальный сервер), а в сторе
 * остаётся только относительный путь. Так архив выпуска самодостаточен: видео
 * уезжает Мастеру вместе с папкой, а не остаётся в кэше Продюсера.
 *
 * Data-URL для видео не используем намеренно: снапшот состояния уезжает на /screen
 * по WebSocket (`useEpisodeSync`), и строка на десятки мегабайт положила бы
 * синхронизацию. Заодно Range-запросы сервера дают плееру перемотку.
 */
export async function prepareVideoFile(
  file: File,
  options: { id: string; label: string; episodeSlug: string }
): Promise<PreparedVideo> {
  if (!isVideoFile(file)) {
    throw new Error("Нужен видеофайл: MP4 или WebM")
  }

  const dataUrl = await readAsDataUrl(file)
  const fileName = assetFileName(
    options.id,
    options.label,
    extensionFromDataUrl(dataUrl)
  )
  const upload = await saveAssetToLibrary(
    episodeAssetFolder(options.episodeSlug, VIDEO_FOLDER),
    fileName,
    dataUrl
  )
  if (!upload.ok) {
    // Причина приходит от сервера («файл слишком большой…») или из сети — показываем
    // её как есть, без советов запускать лишние команды.
    throw new Error(`Файл не выложился в папку этого выпуска: ${upload.error}`)
  }
  const src = upload.url

  return {
    src,
    warning:
      file.size > WARN_VIDEO_SIZE
        ? `Файл ${(file.size / 1024 / 1024).toFixed(1)} МБ — сцена может грузиться долго`
        : undefined,
  }
}
