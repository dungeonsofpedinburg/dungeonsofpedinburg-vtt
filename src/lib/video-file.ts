import { assetFileName, extensionFromDataUrl } from "@/lib/asset-url"
import { saveAssetToLibrary } from "@/lib/asset-upload"
import { isVideoFile } from "@/lib/media"

/** Папка видео-сцен внутри кэша `assets/cache/` — рядом со сценами и музыкой. */
export const VIDEO_FOLDER = "videos"

/** Файлы больше этого размера вызывают предупреждение в диалоге. */
const WARN_VIDEO_SIZE = 200 * 1024 * 1024

export type PreparedVideo = {
  /** Относительный путь к выгруженному файлу: `/assets/cache/videos/bg-1-intro.mp4` */
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
 * Готовит видео к хранению: файл сразу ложится в папку кэша `assets/cache/videos`
 * (его принимает локальный сервер), а в сторе остаётся только относительный путь.
 *
 * Data-URL для видео не используем намеренно: снапшот состояния уезжает на /screen
 * по WebSocket (`useEpisodeSync`), и строка на десятки мегабайт положила бы
 * синхронизацию. Заодно Range-запросы сервера дают плееру перемотку.
 */
export async function prepareVideoFile(
  file: File,
  options: { id: string; label: string }
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
  const upload = await saveAssetToLibrary(VIDEO_FOLDER, fileName, dataUrl)
  if (!upload.ok) {
    // Причина приходит от сервера («файл слишком большой…») или из сети — показываем
    // её как есть, без советов запускать лишние команды.
    throw new Error(`Файл не выложился в папку assets: ${upload.error}`)
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
