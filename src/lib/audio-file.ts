import { fileNameWithoutExtension } from "@/lib/utils"

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00"
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${rest.toString().padStart(2, "0")}`
}

export type PreparedAudio = {
  dataUrl: string
  /** Длительность в формате m:ss, если браузер смог её прочитать */
  duration: string
  /** Название из метаданных MP3, иначе — имя файла без расширения */
  title: string
  /** Исполнитель из метаданных MP3 (пустая строка, если тега нет) */
  artist: string
  /** Обложка из метаданных MP3 как data-URL (пустая строка — картинки нет) */
  coverSrc: string
  warning?: string
}

/** Файлы больше этого размера вызывают предупреждение в диалоге. */
const WARN_AUDIO_SIZE = 15 * 1024 * 1024

/** Сколько байт от начала файла читаем для разбора ID3v2 (обложки бывают крупными). */
const ID3_HEAD_BYTES = 1024 * 1024

/** Обложки больше этого размера не тащим в стор: раздувают экспорт выпуска. */
const MAX_COVER_BYTES = 1024 * 1024

export type AudioTags = {
  title?: string
  artist?: string
  /** Обложка из кадра APIC как data-URL */
  cover?: string
}

/**
 * Читает название и исполнителя из метаданных MP3:
 * 1. ID3v2.2/2.3/2.4 в начале файла (кадры TIT2/TPE1, для v2.2 — TT2/TP1);
 * 2. ID3v1 в последних 128 байтах (если тега версии 2 нет);
 * 3. если тегов нет — вызывающий берёт имя файла.
 * Сторонние библиотеки не нужны: разбор идёт по спецификации ID3.
 */
export async function readMp3Tags(file: File): Promise<AudioTags> {
  try {
    const head = new Uint8Array(
      await file.slice(0, ID3_HEAD_BYTES).arrayBuffer()
    )
    const frames = readId3v2Frames(head)
    if (frames) return frames
  } catch {
    // Начало файла недоступно — пробуем ID3v1 ниже.
  }

  try {
    if (file.size > 128) {
      const tail = new Uint8Array(
        await file.slice(file.size - 128).arrayBuffer()
      )
      return readId3v1(tail)
    }
  } catch {
    // Метаданные недоступны — вернём пустой результат.
  }

  return {}
}

/**
 * Готовит аудиофайл к хранению в сторе: читает в data-URL и определяет
 * длительность через <audio>. Файлы лежат только в памяти мастера —
 * треки не входят в снапшот для /screen.
 */
export async function prepareAudioFile(file: File): Promise<PreparedAudio> {
  if (!file.type.startsWith("audio/")) {
    throw new Error("Нужен аудиофайл: MP3, OGG, WAV или M4A")
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
    reader.readAsDataURL(file)
  })

  const [duration, tags] = await Promise.all([
    readAudioDuration(dataUrl),
    readMp3Tags(file),
  ])

  return {
    dataUrl,
    duration: formatDuration(duration),
    title: tags.title?.trim() || fileNameWithoutExtension(file.name),
    artist: tags.artist?.trim() ?? "",
    coverSrc: tags.cover ?? "",
    warning:
      file.size > WARN_AUDIO_SIZE
        ? `Файл ${(file.size / 1024 / 1024).toFixed(1)} МБ — JSON-экспорт выпуска станет тяжёлым`
        : undefined,
  }
}

/** Разбор ID3v2: заголовок тега и текстовые кадры названия/исполнителя. */
function readId3v2Frames(bytes: Uint8Array): AudioTags | null {
  if (bytes.length < 10) return null
  // Тег начинается сигнатурой «ID3».
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null

  const major = bytes[3]
  const flags = bytes[5]
  const tagSize = readSyncSafe(bytes, 6)
  if (tagSize <= 0) return null

  // В v2.3/2.4 за заголовком может идти расширение тега.
  let offset = 10
  if (flags & 0x40 && offset + 6 <= bytes.length) {
    offset +=
      major >= 4 ? readSyncSafe(bytes, offset) : readUint32(bytes, offset) + 4
  }

  const frameHeaderSize = major === 2 ? 6 : 10
  const titleId = major === 2 ? "TT2" : "TIT2"
  const artistId = major === 2 ? "TP1" : "TPE1"
  const end = Math.min(bytes.length, 10 + tagSize)
  const result: AudioTags = {}

  while (offset + frameHeaderSize <= end) {
    const idLength = major === 2 ? 3 : 4
    const id = decodeWith(
      bytes.subarray(offset, offset + idLength),
      "iso-8859-1"
    )
    // Хвост тега добит нулевыми байтами — кадры закончились.
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break

    const frameSize =
      major === 2
        ? (bytes[offset + 3] << 16) |
          (bytes[offset + 4] << 8) |
          bytes[offset + 5]
        : major >= 4
          ? readSyncSafe(bytes, offset + 4)
          : readUint32(bytes, offset + 4)
    if (frameSize <= 0) break

    const bodyStart = offset + frameHeaderSize
    const bodyEnd = Math.min(end, bodyStart + frameSize)
    if (id === titleId && !result.title) {
      result.title = decodeTextFrame(bytes.subarray(bodyStart, bodyEnd))
    } else if (id === artistId && !result.artist) {
      result.artist = decodeTextFrame(bytes.subarray(bodyStart, bodyEnd))
    } else if ((id === "APIC" || id === "PIC") && !result.cover) {
      result.cover = decodeApicFrame(bytes.subarray(bodyStart, bodyEnd), major)
    }
    offset = bodyStart + frameSize
    // Текст и обложка собраны — дальше можно не читать.
    if (result.title && result.artist && result.cover) break
  }

  return result.title || result.artist ? result : null
}

/**
 * Обложка из кадра APIC (v2.3/2.4) или PIC (v2.2):
 * кодировка → MIME (или 3 байта формата) → тип картинки → описание → сами данные.
 */
function decodeApicFrame(body: Uint8Array, major: number) {
  if (body.length < 8) return ""
  const encoding = body[0]
  let offset = 1
  let mime = "image/jpeg"

  if (major === 2) {
    const format = decodeWith(
      body.subarray(offset, offset + 3),
      "iso-8859-1"
    ).toUpperCase()
    offset += 3
    mime = format === "PNG" ? "image/png" : "image/jpeg"
  } else {
    const mimeEnd = body.indexOf(0, offset)
    if (mimeEnd < 0) return ""
    mime = decodeWith(body.subarray(offset, mimeEnd), "iso-8859-1") || mime
    offset = mimeEnd + 1
  }

  offset += 1 // тип картинки (0x03 — обложка альбома)
  const dataStart = findDescriptionEnd(body, offset, encoding)
  if (dataStart < 0 || dataStart >= body.length) return ""

  const data = body.subarray(dataStart)
  if (data.length < 64 || data.length > MAX_COVER_BYTES) return ""
  return `data:${mime};base64,${toBase64(data)}`
}

/** Конец строки описания: для UTF-16 терминатор двойной, иначе одинарный. */
function findDescriptionEnd(body: Uint8Array, offset: number, encoding: number) {
  if (encoding === 1 || encoding === 2) {
    for (let index = offset; index + 1 < body.length; index += 2) {
      if (body[index] === 0 && body[index + 1] === 0) return index + 2
    }
    return -1
  }
  const end = body.indexOf(0, offset)
  return end < 0 ? -1 : end + 1
}

/** Base64 без FileReader: работает и в браузере, и в тестах на Node. */
function toBase64(bytes: Uint8Array) {
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

/** ID3v1: «TAG» + 30 байт названия + 30 байт исполнителя. */
function readId3v1(bytes: Uint8Array): AudioTags {
  if (bytes.length < 128) return {}
  if (!(bytes[0] === 0x54 && bytes[1] === 0x41 && bytes[2] === 0x47)) return {}
  const title = cutAtNull(decodeWith(bytes.subarray(3, 33), "iso-8859-1"))
  const artist = cutAtNull(decodeWith(bytes.subarray(33, 63), "iso-8859-1"))
  return { title: title || undefined, artist: artist || undefined }
}

/** Текст кадра: первый байт — кодировка, дальше сама строка. */
function decodeTextFrame(body: Uint8Array) {
  if (body.length < 2) return ""
  const encoding = body[0]
  const payload = body.subarray(1)
  const text =
    encoding === 0
      ? decodeWith(payload, "iso-8859-1")
      : encoding === 1
        ? decodeWith(payload, "utf-16")
        : encoding === 2
          ? decodeWith(payload, "utf-16be")
          : decodeWith(payload, "utf-8")
  // Некоторые кодировщики добивают строку нулевыми байтами — берём часть до них.
  return cutAtNull(text)
}

/** Обрезает строку по первому нулевому символу (padding в тегах ID3). */
function cutAtNull(value: string) {
  const [clean] = value.split("\u0000")
  return clean.trim()
}

function decodeWith(bytes: Uint8Array, encoding: string) {
  try {
    return new TextDecoder(encoding).decode(bytes)
  } catch {
    return ""
  }
}

/** Синхронебезопасное число ID3: по 7 значащих бит в каждом байте. */
function readSyncSafe(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  )
}

/** Обычное 32-битное big-endian число — размер кадра в ID3v2.3. */
function readUint32(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  )
}

function readAudioDuration(dataUrl: string) {
  return new Promise<number>((resolve) => {
    const audio = document.createElement("audio")
    const finish = (value: number) => {
      audio.src = ""
      resolve(value)
    }
    audio.onloadedmetadata = () => finish(audio.duration)
    audio.onerror = () => finish(0)
    audio.src = dataUrl
  })
}
