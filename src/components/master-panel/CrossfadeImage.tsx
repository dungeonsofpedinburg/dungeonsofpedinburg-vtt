import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/** Сколько миллисекунд прежний кадр растворяется поверх нового. */
export const CROSSFADE_MS = 350

/**
 * Запрет на собственный слой композитинга у кадра: без него Chrome растрирует
 * картинку в её собственном разрешении, а потом растягивает текстурой вместе с
 * `transform: scale` сцены (`/screen` масштабируется до ×2 на 4K) — отсюда «мыло»
 * на персонажах при резких декорациях. `will-change: auto` и `transform: none`
 * снимают подсказки на промоушен: кадр рисуется в нативном разрешении экрана.
 */
const CRISP_IMAGE_STYLE = { willChange: "auto", transform: "none" } as const

type CrossfadeImageProps = {
  src: string
  alt: string
  /** Классы живого кадра; старая копия получает их же плюс `staleClassName`. */
  className?: string
  /** Позиционирование старой копии поверх новой (по умолчанию — на всю плашку). */
  staleClassName?: string
  durationMs?: number
}

/**
 * Картинка с кроссфейдом: при смене `src` предыдущий кадр ещё `durationMs`
 * растворяется поверх нового. Так смена состояния персонажа (или сцены) не
 * мигает: новый кадр уже на месте, старый только уходит.
 */
export function CrossfadeImage({
  src,
  alt,
  className,
  staleClassName = "absolute inset-0",
  durationMs = CROSSFADE_MS,
}: CrossfadeImageProps) {
  const [staleSrc, setStaleSrc] = useState<string | null>(null)
  /**
   * Кадр, чьё проявление уже отыграло. Пока кадр «входящий», он несёт
   * `animate-in fade-in`; с окончанием анимации класс снимается.
   *
   * Зачем: анимация живёт с `fill-mode: both`, поэтому до анмаунта элемента
   * браузер считает его анимируемым и держит на отдельном слое композитинга.
   * Такой слой растрируется один раз ДО масштабирования сцены и на проекторе
   * выглядит мыльным. Без активной анимации кадр перерисовывается под масштаб.
   */
  const [settledSrc, setSettledSrc] = useState<string | null>(null)
  const previousSrc = useRef(src)
  const isEntering = settledSrc !== src

  useEffect(() => {
    const timer = setTimeout(() => setSettledSrc(src), durationMs)
    return () => clearTimeout(timer)
  }, [durationMs, src])

  useEffect(() => {
    const previous = previousSrc.current
    if (previous === src) return
    previousSrc.current = src
    if (!previous) return
    setStaleSrc(previous)
    const timer = setTimeout(() => setStaleSrc(null), durationMs)
    return () => clearTimeout(timer)
  }, [durationMs, src])

  return (
    <>
      {staleSrc ? (
        // fill-mode-forwards: после затухания копия остаётся прозрачной до снятия.
        <img
          src={staleSrc}
          alt=""
          aria-hidden
          className={cn(
            className,
            staleClassName,
            "pointer-events-none animate-out fill-mode-forwards fade-out"
          )}
          style={{ animationDuration: `${durationMs}ms`, ...CRISP_IMAGE_STYLE }}
        />
      ) : null}
      {/* Ключ по пути: смена кадра пересоздаёт узел, и проявление играет заново. */}
      <img
        key={src}
        src={src}
        alt={alt}
        className={cn(className, isEntering && "animate-in fade-in")}
        style={{
          // Длительность нужна только на время проявления: без анимации она мертва.
          ...(isEntering ? { animationDuration: `${durationMs}ms` } : null),
          ...CRISP_IMAGE_STYLE,
        }}
      />
    </>
  )
}
