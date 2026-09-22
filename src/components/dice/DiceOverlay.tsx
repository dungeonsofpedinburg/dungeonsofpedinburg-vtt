import { useEffect, useRef, useState } from "react"
import DiceBox from "@3d-dice/dice-box"
import {
  DICE_PHYSICS,
  DICE_REFERENCE_GEOMETRY,
  DICE_THEME_COLOR,
  ROLL_RESULT_TEXT,
  SCREEN_ROOT_FONT_REFERENCE_PX,
  diceScaleForCount,
  formatRollBreakdown,
  isDiceResultValid,
  notationToSides,
  screenRollTextRem,
  screenRootFontPx,
  summarizeDiceResults,
  type DiceGeometry,
} from "@/lib/dice"
import { postRollResult } from "@/store/episodeSync"
import { useEpisodeStore } from "@/store/useEpisodeStore"
import { cn } from "@/lib/utils"

/** Контейнер кубиков: лежит внутри SceneStage — значит, виден и в OBS. */
const DICE_BOX_ID = "dice-box-overlay"
const DICE_BOX_SELECTOR = `#${DICE_BOX_ID}`

/** Стартовый размер: средний пул. Первый бросок всё равно выставит свой. */
const INITIAL_DICE_SCALE = diceScaleForCount(3)

/**
 * Страховка от «зависшей» физики: если библиотека не отдала результат, отпускаем
 * очередь бросков, чтобы следующий клик сработал. Дольше ждать незачем — Мастер
 * к этому моменту уже показал локальную оценку со знаком «≈».
 */
const ROLL_RESULT_TIMEOUT_MS = 10000

/** Прямоугольник подложки: канвас бросается ровно в тех же пикселях. */
function measureGeometry(container: HTMLElement | null): DiceGeometry {
  const rect = container?.getBoundingClientRect()
  if (!rect || rect.width < 1 || rect.height < 1) return DICE_REFERENCE_GEOMETRY
  return { plateWidthPx: rect.width, plateHeightPx: rect.height }
}

/**
 * Корневой кегль текущего окна: на /screen он привязан к ширине канваса
 * (правило `html.screen-scale`), поэтому rem-кегль итога считаем вместе с ним.
 */
function currentRootFontPx() {
  return typeof window === "undefined"
    ? SCREEN_ROOT_FONT_REFERENCE_PX
    : screenRootFontPx(window.innerWidth)
}

/** Промис с таймаутом: результат физики не должен держать очередь вечно. */
function waitWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`физика не отдала результат за ${ms} мс`)),
      ms
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/**
 * Экземпляр DiceBox создаётся один раз на страницу: StrictMode и HMR
 * пересоздают компонент, а канвас и мир физики должны остаться теми же.
 */
let diceBoxPromise: Promise<DiceBox> | null = null

function getDiceBox() {
  if (!diceBoxPromise) {
    diceBoxPromise = (async () => {
      // Актуальный API 1.1.3: один объект конфигурации, контейнер — в `container`.
      const diceBox = new DiceBox({
        container: DICE_BOX_SELECTOR,
        // Ассеты ammo.wasm и тема темы грузятся с CDN; локальная копия лежит в public/assets.
        assetPath: "assets/",
        origin: "https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/",
        theme: "default",
        themeColor: DICE_THEME_COLOR,
        // Обычный канвас вместо OffscreenCanvas: кубики надёжно видны в OBS.
        offscreen: false,
        scale: INITIAL_DICE_SCALE,
        enableShadows: true,
        // Вес и «бросок»: сырые ключи всегда в конфиге, иначе updateConfig({scale})
        // перенормализует их повторно и кубики теряют вес (см. DICE_PHYSICS).
        ...DICE_PHYSICS,
      })
      await diceBox.init()
      return diceBox
    })().catch((error: unknown) => {
      // Не оставляем «сломанный» промис: следующий бросок попробует снова.
      diceBoxPromise = null
      throw error
    })
  }
  return diceBoxPromise
}

/**
 * 3D-кубики Fantastic Dice на сцене.
 * Физику считает только /screen (большой экран OBS), а фактические значения
 * уходят Мастеру обратным каналом — поэтому итог в плашке совпадает в обоих окнах.
 */
export function DiceOverlay() {
  const rollEvent = useEpisodeStore((state) => state.lastRollEvent)
  const lastRoll = useEpisodeStore((state) => state.lastRoll)
  const isRollPending = useEpisodeStore((state) => state.isRollPending)

  /** Строка итога броска: формат общий с панелью Мастера (см. @/lib/dice). */
  const rollText = lastRoll
    ? formatRollBreakdown(lastRoll.dice, lastRoll.sum, lastRoll.estimated)
    : ""

  const containerRef = useRef<HTMLDivElement>(null)
  const rolledEventIdRef = useRef<number | null>(null)
  const hadResultRef = useRef(false)
  /** Размер, уже отправленный в движок: null — конфиг ещё не синхронизирован. */
  const diceScaleRef = useRef<number | null>(null)
  /** Сколько кубиков было в последнем броске: размер пересчитываем при resize. */
  const lastPoolRef = useRef(3)
  /**
   * Очередь бросков: dice-box не переносит два броска одновременно — `roll()`
   * внутри вызывает `clear()` и сбрасывает счётчики `rollId`, из-за чего поздние
   * сообщения физики прошлого броска попадают в кубики нового. Поэтому запускаем
   * броски строго по одному, цепочкой промисов.
   */
  const rollChainRef = useRef<Promise<void>>(Promise.resolve())

  // Подложка живёт от старта броска до исчезновения результата.
  const showPlate = isRollPending || Boolean(lastRoll)

  /**
   * Ширина подложки в пикселях: от неё зависит кегль строки итога. Обновляет тот
   * же ResizeObserver, что пересчитывает размер кубиков при перетаскивании сплиттера.
   * До первого замера считаем по эталону /screen — так же, как размер кубиков.
   */
  const [plateWidthPx, setPlateWidthPx] = useState(
    DICE_REFERENCE_GEOMETRY.plateWidthPx
  )

  // Новый бросок: roll() сам очищает сцену от кубиков прошлого броска.
  useEffect(() => {
    if (!rollEvent || rollEvent.id === rolledEventIdRef.current) return
    const event = rollEvent
    // Метку ставим синхронно: повторный рендер (StrictMode) не запустит бросок дважды.
    rolledEventIdRef.current = event.id
    const pool = notationToSides(event.dice)
    lastPoolRef.current = pool.length || 1

    rollChainRef.current = rollChainRef.current
      .catch(() => {})
      .then(async () => {
        const diceBox = await getDiceBox()
        if (rolledEventIdRef.current !== event.id) return
        // Размер подгоняем под количество кубиков: один d20 — почти во всю плашку.
        // updateConfig в dice-box перечитывает тему и метрики, поэтому зовём его
        // только когда размер пула реально изменился, а не перед каждым броском.
        const scale = diceScaleForCount(pool.length, measureGeometry(containerRef.current))
        if (diceScaleRef.current !== scale) {
          diceScaleRef.current = scale
          await diceBox.updateConfig({ scale })
          if (rolledEventIdRef.current !== event.id) return
        }
        // Значения берём из результата ИМЕННО этого броска: глобальный
        // onRollComplete читает текущую группу и может подмешать чужой результат.
        const results = await waitWithTimeout(
          diceBox.roll(event.dice),
          ROLL_RESULT_TIMEOUT_MS
        )
        // Пока кубики катились, мастер мог нажать новый бросок — старый не публикуем.
        if (rolledEventIdRef.current !== event.id) return
        const { dice, sum } = summarizeDiceResults(results)
        if (!isDiceResultValid(dice, pool)) {
          console.warn(
            "[dice] физика вернула недостоверный результат — Мастер посчитает сам",
            results
          )
          return
        }
        // Числа считает экран: Мастер покажет ровно этот итог.
        postRollResult(event.id, dice, sum)
      })
      .catch((error: unknown) => {
        console.error("[dice] бросок не удался", error)
      })
  }, [rollEvent])

  // Перетаскивание сплиттера меняет размер подложки: канвас следует за ней,
  // а размер кубиков пересчитывается — в процентах он должен остаться прежним.
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      // Замер один на кубики и на полосу итога: оба зависят от размера подложки.
      const geometry = measureGeometry(container)
      setPlateWidthPx(geometry.plateWidthPx)
      void getDiceBox()
        .then(async (diceBox) => {
          diceBox.resizeWorld()
          const scale = diceScaleForCount(lastPoolRef.current, geometry)
          if (diceScaleRef.current === scale) return
          diceScaleRef.current = scale
          await diceBox.updateConfig({ scale })
        })
        .catch(() => {})
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Плашка с итогом погасла (через ROLL_PLAQUE_MS) — убираем кубики со сцены.
  // Если в этот момент летит новый бросок, сцену не трогаем: clear() оборвал бы
  // чужие кубики и сбросил счётчики rollId, а свой clear сделает сам roll().
  useEffect(() => {
    if (lastRoll) {
      hadResultRef.current = true
      return
    }
    if (!hadResultRef.current) return
    if (isRollPending) return
    hadResultRef.current = false
    void getDiceBox()
      .then((diceBox) => diceBox.clear())
      .catch(() => {})
  }, [lastRoll, isRollPending])

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      {/* Подложка: появляется вместе с броском и уходит вместе с результатом. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-[5vw] rounded-3xl border-2 border-zinc-700/60 bg-zinc-900/65 backdrop-blur-md transition-opacity duration-500",
          showPlate ? "opacity-100" : "opacity-0"
        )}
      />
      {/* Кубики бросаются внутри подложки: канвас — тот же прямоугольник. */}
      <div
        ref={containerRef}
        id={DICE_BOX_ID}
        className="absolute inset-[5vw] [&>canvas]:size-full"
      />
      {/*
        Итог броска поверх нижних 20% подложки. Полоса вырезана по её ширине
        (inset-x-[5vw]) и прижата к низу: у подложки по 5vw отступа сверху и
        снизу, поэтому 20% её высоты — это 20% × (100% − 10vw), то есть высота
        `calc(20% - 2vw)` (177.6 px на канвасе 1920). Градиент снизу вверх: у
        нижней кромки чёрный, выше — прозрачный, поэтому строка читается на
        любой картинке. Стоит ПОСЛЕ канваса: DOM-порядок кладёт её поверх кубиков.
        Кегль приходит из @/lib/dice в rem и ужимается, если строка шире подложки.
      */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-[5vw] bottom-[5vw] flex h-[calc(20%_-_2vw)] items-center justify-center",
          "rounded-b-3xl bg-linear-to-t from-black to-black/0 transition-opacity duration-300",
          lastRoll ? "opacity-100" : "opacity-0"
        )}
      >
        {lastRoll ? (
          <span
            className={ROLL_RESULT_TEXT}
            style={{
              fontSize: `${screenRollTextRem(rollText, plateWidthPx, currentRootFontPx())}rem`,
            }}
          >
            {rollText}
          </span>
        ) : null}
      </div>
    </div>
  )
}
