import { useEffect, useRef, useState } from "react"
import DiceBox from "@3d-dice/dice-box"
import type { DiceBoxRollResult } from "@3d-dice/dice-box"
import {
  DICE_PHYSICS,
  DICE_REFERENCE_GEOMETRY,
  DICE_ROLL_WATCHDOG_MS,
  DICE_THEME_COLOR,
  ROLL_RESULT_TEXT,
  SCREEN_ROOT_FONT_REFERENCE_PX,
  diceScaleForCount,
  diceSum,
  estimateDiceRoll,
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

/** Событие потери WebGL-контекста: браузер шлёт его, когда GPU сбрасывает контекст. */
const CONTEXT_LOST_EVENT = "webglcontextlost"

/**
 * Пауза перед применением нового размера подложки. Перетаскивание сплиттера
 * рождает десятки срабатываний ResizeObserver, а каждое обращение к
 * `resizeWorld()` добавляет в библиотеке новый слушатель `window.resize` —
 * поэтому собираем поток кадров в один проход (см. `applyGeometry`).
 */
const RESIZE_SETTLE_MS = 250

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

/**
 * Состояние движка кубиков. Инстанс создаётся один раз на страницу (StrictMode и
 * HMR пересоздают компонент, а канвас и мир физики должны остаться теми же), но
 * движок может «заболеть»: теряется контекст WebGL, инициализация падает, бросок
 * перестаёт отдавать результат. Тогда флаг `broken` отправляет инстанс на
 * пересборку — её выполняет сторожевой таймер перед следующим броском.
 */
type DiceEngine = {
  /** Инициализация текущего инстанса: ждём её перед броском */
  ready: Promise<DiceBox>
  /** Канвас этого инстанса: нужен для очистки DOM при пересборке */
  canvas: HTMLCanvasElement | null
  /** Размер кубиков, уже отправленный инстансу (null — размер не синхронизирован) */
  scale: number | null
  /** Контекст потерян или физика зависла — инстанс больше не используем */
  broken: boolean
}

let engine: DiceEngine | null = null

/** Канвас, который dice-box создал внутри контейнера (`class="dice-box-canvas"`). */
function findDiceCanvas() {
  const container =
    typeof document === "undefined"
      ? null
      : document.querySelector(DICE_BOX_SELECTOR)
  const canvases = container?.querySelectorAll<HTMLCanvasElement>(".dice-box-canvas")
  return canvases && canvases.length > 0 ? canvases[canvases.length - 1] : null
}

/**
 * Живой ли движок. Контекст WebGL намеренно НЕ проверяем через
 * `canvas.getContext()`: библиотека сама создаёт контекст с нужными флагами, а наш
 * вызов с другими опциями вернул бы уже существующий контекст и сломал рендер.
 * Потерю контекста отслеживает слушатель `webglcontextlost`, а ошибки
 * инициализации — состояние промиса `ready`.
 */
function isEngineHealthy(entry: DiceEngine | null): entry is DiceEngine {
  return Boolean(entry && !entry.broken)
}

/**
 * Гасит инстанс: канвас убираем из DOM, мир физики освобождаем, ссылку теряем —
 * следующий бросок поднимет движок с нуля.
 *
 * Своего `destroy()` у dice-box 1.1.3 нет, а потерявший контекст канвас всё равно
 * не оживёт, поэтому пересборка — единственный способ получить рабочую сцену:
 * новый инстанс создаст свой канвас в том же контейнере.
 */
function resetDiceEngine(reason: string) {
  const current = engine
  engine = null
  if (!current) return
  current.broken = true
  console.warn(`[Dice] ${reason}. Пересобираем движок кубиков.`)
  // Мир физики держит тела Ammo: `clear()` велит воркеру освободить сцену,
  // иначе они копятся от броска к броску.
  current.ready
    .then((diceBox) => {
      try {
        diceBox.clear()
      } catch (error) {
        console.debug("[Dice] сцену мёртвого инстанса уже не почистить", error)
      }
    })
    .catch(() => {})
  if (current.canvas) {
    current.canvas.removeEventListener(CONTEXT_LOST_EVENT, onContextLost, false)
    // Мёртвый канвас остаётся в контейнере — новый инстанс создаст свой.
    current.canvas.remove()
  }
}

/**
 * Перехват потери WebGL-контекста. `preventDefault()` сообщает браузеру, что
 * восстановлением занимаемся сами: старый инстанс всё равно не оживёт, поэтому
 * выбрасываем его и сразу поднимаем движок заново.
 */
function onContextLost(event: Event) {
  event.preventDefault()
  console.warn("[Dice] WebGL context lost. Восстанавливаем движок…")
  resetDiceEngine("потерян WebGL-контекст")
  // Скрытая вкладка (уснувший проектор) может не дать контекст: тогда пересборку
  // отложит сторожевой таймер — он сработает перед следующим броском.
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return
  void acquireDiceEngine().catch((error: unknown) => {
    console.warn("[Dice] пересоздать движок сразу не удалось", error)
  })
}

/** Создаёт и инициализирует новый инстанс (старый к этому моменту уже выброшен). */
function createDiceEngine(): DiceEngine {
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
  const entry: DiceEngine = {
    // Заглушка: настоящий промис встанет синхронно, до первого await снаружи.
    ready: Promise.resolve(diceBox),
    canvas: findDiceCanvas(),
    // Размер синхронизируем явно перед первым броском: он зависит от подложки.
    scale: null,
    broken: false,
  }
  // Канвас конструктор создаёт синхронно, поэтому слушатель стоит до первого броска.
  entry.canvas?.addEventListener(CONTEXT_LOST_EVENT, onContextLost, false)
  engine = entry
  entry.ready = diceBox.init().then(
    () => diceBox,
    (error: unknown) => {
      // «Сломанный» промис не держим: следующий бросок попробует снова.
      if (engine === entry) resetDiceEngine("инициализация кубиков не удалась")
      throw error
    }
  )
  return entry
}

/**
 * Сторожевой таймер перед броском: живой движок отдаём как есть, а сломанный
 * (потерянный контекст, ошибка инициализации, зависшая физика) пересобираем
 * ЧИСТО до того, как кинуть кубики. Возвращаем запись движка: вызывающему нужны
 * и `scale`, и `canvas`.
 */
async function acquireDiceEngine() {
  if (engine && !isEngineHealthy(engine)) {
    resetDiceEngine("предыдущий инстанс нездоров")
  }
  const entry = engine ?? createDiceEngine()
  await entry.ready
  return entry
}

/** Живой движок без создания нового: для очистки сцены и пересчёта размера. */
function currentEngine() {
  return isEngineHealthy(engine) ? engine : null
}

/**
 * Бросок со сторожевым таймером `DICE_ROLL_WATCHDOG_MS`.
 * `null` — физика не ответила (или бросок упал): инстанс считаем зависшим, сцену
 * гасим, а Мастеру уходит оценка со знаком «≈», чтобы интерфейс не замер.
 */
function rollWithWatchdog(diceBox: DiceBox, notation: string[]) {
  return new Promise<DiceBoxRollResult[] | null>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let settled = false
    const finish = (results: DiceBoxRollResult[] | null) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      resolve(results)
    }
    timer = setTimeout(() => {
      timer = null
      console.warn(
        `[Dice] физика не отдала результат за ${DICE_ROLL_WATCHDOG_MS} мс — движок пересоберём`
      )
      finish(null)
    }, DICE_ROLL_WATCHDOG_MS)
    diceBox.roll(notation).then(
      (results) => finish(results),
      (error: unknown) => {
        console.error("[Dice] бросок не удался", error)
        finish(null)
      }
    )
  })
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
        // Сторожевой таймер: сломанный инстанс (потерянный контекст, ошибка,
        // зависшая физика) пересобирается ДО броска — очередь не встанет.
        const entry = await acquireDiceEngine()
        const diceBox = await entry.ready
        if (rolledEventIdRef.current !== event.id) return
        // Размер подгоняем под количество кубиков: один d20 — почти во всю плашку.
        // updateConfig в dice-box перечитывает тему и метрики, поэтому зовём его
        // только когда размер пула реально изменился, а не перед каждым броском.
        const scale = diceScaleForCount(pool.length, measureGeometry(containerRef.current))
        // Размер живёт на инстансе: после пересборки он снова не синхронизирован.
        if (entry.scale !== scale) {
          entry.scale = scale
          await diceBox.updateConfig({ scale })
          if (rolledEventIdRef.current !== event.id) return
        }
        // Значения берём из результата ИМЕННО этого броска: глобальный
        // onRollComplete читает текущую группу и может подмешать чужой результат.
        const results = await rollWithWatchdog(diceBox, event.dice)
        // Пока кубики катились, мастер мог нажать новый бросок — старый не публикуем.
        if (rolledEventIdRef.current !== event.id) return
        if (results === null) {
          // Физика зависла или упала: сцену гасим (кубики исчезают — плашке они
          // больше не противоречат), инстанс уходит на пересборку, а Мастер
          // получает локальную оценку со знаком «≈» и не ждёт своего таймаута.
          resetDiceEngine("физика не отдала результат")
          const estimate = estimateDiceRoll(pool)
          postRollResult(event.id, estimate, diceSum(estimate), true)
          return
        }
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
    let settleTimer: ReturnType<typeof setTimeout> | null = null
    /** Размер, для которого мир физики уже настроен: `ШxВ`, пустая строка — ещё нет. */
    let worldSize = ""

    const applyGeometry = () => {
      settleTimer = null
      // Замер один на кубики и на полосу итога: оба зависят от размера подложки.
      const geometry = measureGeometry(container)
      setPlateWidthPx(geometry.plateWidthPx)
      // Движка может не быть (ещё не бросали) или он сломан — пересоберётся на броске.
      const entry = currentEngine()
      if (!entry) return
      const size = `${geometry.plateWidthPx}x${geometry.plateHeightPx}`
      // `resizeWorld()` каждый раз добавляет в библиотеке новый слушатель
      // `window.resize`, поэтому зовём его только когда размер реально изменился.
      const needsResize = size !== worldSize
      worldSize = size
      void entry.ready
        .then(async (diceBox) => {
          if (needsResize) diceBox.resizeWorld()
          const scale = diceScaleForCount(lastPoolRef.current, geometry)
          if (entry.scale === scale) return
          entry.scale = scale
          await diceBox.updateConfig({ scale })
        })
        .catch(() => {})
    }

    const observer = new ResizeObserver(() => {
      // Перетаскивание даёт десятки кадров: собираем их в один проход.
      if (settleTimer !== null) clearTimeout(settleTimer)
      settleTimer = setTimeout(applyGeometry, RESIZE_SETTLE_MS)
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      if (settleTimer !== null) clearTimeout(settleTimer)
    }
  }, [])

  // Плашка с итогом погасла (через ROLL_PLAQUE_MS) — чистим сцену целиком, а не
  // просто скрываем канвас: `clear()` снимает кубики и велит воркеру физики
  // освободить тела Ammo, иначе мир копит их от броска к броску.
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
    // `currentEngine` не создаёт движок: чистить нечего, если его нет.
    const entry = currentEngine()
    if (!entry) return
    void entry.ready
      .then((diceBox) => diceBox.clear())
      .catch((error: unknown) => {
        console.debug("[Dice] сцену уже не почистить", error)
      })
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
