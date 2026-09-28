/**
 * Выгрузка ассета в папку кэша `assets/cache/`. Файлы кладёт локальный сервер
 * Vite (`pedinburg:serve-episode-assets`): из браузера записать файл на диск
 * нельзя. Одна точка входа на все случаи — экспорт выпуска и добавление
 * видео-сцены, — поэтому и путь, и отчёт об ошибке выглядят одинаково.
 */
export const ASSET_UPLOAD_ENDPOINT = "/__pedinburg/assets"

/** Итог выгрузки: либо относительный URL, либо причина отказа сервера. */
export type AssetUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * `folder/fileName` внутри кэша `assets/cache/` + data-URL содержимого.
 * Сервер отвечает относительным URL (`/assets/cache/videos/intro.mp4`); причину
 * отказа (слишком большой файл, недоступный сервер) возвращаем текстом, чтобы
 * её можно было показать Мастеру как есть.
 */
export async function saveAssetToLibrary(
  folder: string,
  fileName: string,
  dataUrl: string
): Promise<AssetUploadResult> {
  // Папка кэша подставляется сервером: клиент шлёт только `scenes/имя.png`.
  const path = `${folder}/${fileName}`
  if (typeof fetch !== "function") {
    return { ok: false, error: "сервер разработки недоступен: запустите npm run dev" }
  }

  try {
    const response = await fetch(ASSET_UPLOAD_ENDPOINT, {
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
