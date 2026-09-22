export type PreparedImage = {
  dataUrl: string
  width: number
  height: number
  warning?: string
}

/** Длинная сторона, до которой сжимаются изображения перед сохранением в сторе. */
export const MAX_IMAGE_SIDE = 1024

/** Файлы больше этого размера вызывают предупреждение в диалоге. */
const WARN_FILE_SIZE = 4 * 1024 * 1024

/** Файлы меньше этого размера в допустимых габаритах сохраняются без пережатия. */
const SKIP_REENCODE_SIZE = 512 * 1024

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Файл не является изображением"))
    image.src = dataUrl
  })
}

function supportsWebp() {
  try {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    return canvas.toDataURL("image/webp").startsWith("data:image/webp")
  } catch {
    return false
  }
}

export type PrepareImageOptions = {
  /** Максимальная длина длинной стороны (по умолчанию MAX_IMAGE_SIDE). */
  maxSide?: number
}

/**
 * Готовит загруженное изображение к хранению в сторе: уменьшает до maxSide
 * по длинной стороне и пережимает в WebP (фолбэк — JPEG). Это критично, потому что
 * персонажи и фоны целиком уезжают на /screen снапшотами по WebSocket (server/index.mjs).
 */
export async function prepareImageFile(
  file: File,
  options: PrepareImageOptions = {}
): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Нужен файл изображения: PNG, JPG, WebP или SVG")
  }

  const maxSide = options.maxSide ?? MAX_IMAGE_SIDE
  const originalDataUrl = await readAsDataUrl(file)
  const image = await loadImage(originalDataUrl)
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight)
  const scale = longestSide > maxSide ? maxSide / longestSide : 1
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const warning =
    file.size > WARN_FILE_SIZE
      ? `Файл ${(file.size / 1024 / 1024).toFixed(1)} МБ сжат до ${width}×${height}`
      : undefined

  if (scale === 1 && file.size <= SKIP_REENCODE_SIZE) {
    return { dataUrl: originalDataUrl, width, height, warning }
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) {
    return { dataUrl: originalDataUrl, width, height, warning }
  }
  context.drawImage(image, 0, 0, width, height)

  const format = supportsWebp() ? "image/webp" : "image/jpeg"
  return {
    dataUrl: canvas.toDataURL(format, 0.85),
    width,
    height,
    warning,
  }
}
