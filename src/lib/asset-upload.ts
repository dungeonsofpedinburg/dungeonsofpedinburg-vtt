/**
 * Выгрузка ассета в папку выпуска `assets/episodes/<slug>/` (или в кэш
 * `assets/cache/`). Файлы кладёт локальный сервер Vite
 * (`pedinburg:serve-episode-assets`): из браузера записать файл на диск нельзя.
 * Одна точка входа на все случаи — экспорт выпуска и добавление видео-сцены, —
 * поэтому и путь, и отчёт об ошибке выглядят одинаково.
 */
export const ASSET_UPLOAD_ENDPOINT = "/__pedinburg/assets"

/**
 * Базовый адрес сервера выгрузки. В браузере путь относительный (запрос уходит на
 * тот же origin), а в Node-смоуках (`scripts/smoke-assets.mjs`) — абсолютный:
 * так сквозной путь «интерфейс → assets/episodes/<slug>/scenes/...» проверяется
 * без браузера.
 */
let uploadBaseUrl = ""

/** Задаёт адрес сервера выгрузки для Node-смоуков: `http://127.0.0.1:5173`. */
export function setAssetUploadBaseUrl(base: string) {
  uploadBaseUrl = base.replace(/\/+$/, "")
}

/** Итог выгрузки: либо относительный URL, либо причина отказа сервера. */
export type AssetUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * Выгрузка файла в `targetFolder` (путь от корня `assets/`) + data-URL содержимого.
 * `targetFolder` — папка выпуска (`episodes/<slug>/scenes`) или кэша
 * (`cache/scenes`; короткая форма `scenes` тоже принимается — это наследие).
 * Сервер отвечает веб-путем (`/assets/episodes/<slug>/scenes/forest.jpg`);
 * причину отказа (слишком большой файл, недоступный сервер) возвращаем текстом,
 * чтобы её можно было показать Мастеру.
 */
export async function saveAssetToLibrary(
  targetFolder: string,
  fileName: string,
  dataUrl: string
): Promise<AssetUploadResult> {
  const path = `${targetFolder}/${fileName}`
  if (typeof fetch !== "function") {
    return { ok: false, error: "сервер разработки недоступен: запустите npm run dev" }
  }

  try {
    const response = await fetch(`${uploadBaseUrl}${ASSET_UPLOAD_ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, dataUrl }),
    })
    if (!response.ok) {
      // Сервер объясняет причину сам: «файл слишком большой», «недопустимый путь».
      const body = (await response.json().catch(() => null)) as
        | { error?: unknown }
        | null
      const reason =
        typeof body?.error === "string" && body.error
          ? body.error
          : `сервер ответил ${response.status}`
      console.warn(`[ассеты] ${path}: ${reason}`)
      return { ok: false, error: reason }
    }
    const body = (await response.json()) as { url?: unknown }
    if (typeof body.url !== "string" || !body.url) {
      return { ok: false, error: "сервер не вернул путь к файлу" }
    }
    return { ok: true, url: body.url }
  } catch (error) {
    console.warn(`[ассеты] не удалось выгрузить файл ${path}`, error)
    return {
      ok: false,
      error: "сервер разработки не ответил: запустите npm run dev и повторите",
    }
  }
}
