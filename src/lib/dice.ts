import type { DiceBoxRollResult } from "@3d-dice/dice-box"
import type { DieSides, RollDie } from "@/data/types"

/**
 * Цвет кубиков Fantastic Dice. Это значение материала WebGL (игрового движка),
 * а не DOM-стиль, поэтому оно живёт константой, а не Tailwind-классом.
 */
export const DICE_THEME_COLOR = "#72164c"

/** Сколько плашка с итогом броска держится на сцене, мс. */
export const ROLL_PLAQUE_MS = 4500

/**
 * Сколько ждём ответ физики с /screen, если экран не подключён: без него итог
 * всё равно придётся считать локально, поэтому ждать дольше нет смысла.
 */
export const ROLL_WAIT_MS = 5000

/**
 * Ожидание ответа, когда экран OBS на связи. Первый бросок грузит ammo.wasm и
 * тему с CDN, а сам полёт кубиков занимает пару секунд: с прежним ROLL_WAIT_MS
 * Мастер сдавался раньше и показывал случайное число, пока кубики ещё катились.
 */
export const ROLL_WAIT_WITH_SCREEN_MS = 15000

/** Сколько ждать итог: экран на связи — ждём физику, иначе считаем локально. */
export function rollWaitMsFor(screenCount: number) {
  return screenCount > 0 ? ROLL_WAIT_WITH_SCREEN_MS : ROLL_WAIT_MS
}

const KNOWN_SIDES: DieSides[] = [4, 6, 8, 10, 12, 20]

/**
 * Нотации для броска из пула кубиков Staging area:
 * `['d20','d6','d6']` → `['1d20','2d6']` (порядок по возрастанию граней).
 */
export function buildDiceNotation(pool: DieSides[]): string[] {
  const counts = new Map<DieSides, number>()
  pool.forEach((sides) => counts.set(sides, (counts.get(sides) ?? 0) + 1))
  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([sides, count]) => `${count}d${sides}`)
}

/** Обратный разбор: `['1d20','2d6']` → `[20,6,6]` (нужен локальному фолбэку). */
export function notationToSides(notation: string[]): DieSides[] {
  const pool: DieSides[] = []
  notation.forEach((entry) => {
    const parsed = /^(\d+)d(\d+)$/i.exec(entry.trim())
    if (!parsed) return
    const count = Number(parsed[1])
    const sides = normalizeSides(parsed[2])
    for (let index = 0; index < count; index += 1) pool.push(sides)
  })
  return pool
}

function normalizeSides(value: unknown, fallback: DieSides = 6): DieSides {
  const sides = Number(value)
  return KNOWN_SIDES.find((option) => option === sides) ?? fallback
}

/**
 * Результат физики dice-box → плоский список кубиков и сумма.
 * Библиотека отдаёт массив групп (по нотации), внутри каждой — `rolls`
 * со значениями; значение может прийти строкой, поэтому приводим к числу.
 */
export function summarizeDiceResults(results: DiceBoxRollResult[]): {
  dice: RollDie[]
  sum: number
} {
  const dice: RollDie[] = []
  results.forEach((group) => {
    const groupSides = normalizeSides(group.sides)
    const entries = Array.isArray(group.rolls) ? group.rolls : [group]
    entries.forEach((entry) => {
      const value = Number(entry.value)
      if (!Number.isFinite(value)) return
      dice.push({ sides: normalizeSides(entry.sides, groupSides), value })
    })
  })
  return { dice, sum: dice.reduce((total, die) => total + die.value, 0) }
}

/**
 * Проверка результата физики перед отправкой Мастеру.
 *
 * Зачем: `dice-box` сбрасывает счётчики `rollId` при каждом `roll()` (внутри
 * вызывается `clear()`), а воркер физики живёт в отдельном потоке. Опоздавшее
 * сообщение о кубике прошлого броска приходит с тем же `rollId` и записывается
 * в кубик нового броска — библиотека рапортует значение, которого на грани нет.
 * Поэтому сверяем результат с запрошенным пулом: количество кубиков, набор граней
 * и попадание каждого значения в 1..sides. Недостоверный итог лучше не отправлять:
 * Мастер дождётся таймаута и покажет честную локальную оценку со знаком «≈».
 */
export function isDiceResultValid(dice: RollDie[], pool: DieSides[]): boolean {
  if (dice.length !== pool.length) return false
  const remaining = [...pool]
  return dice.every((die) => {
    if (!Number.isInteger(die.value) || die.value < 1 || die.value > die.sides) return false
    const index = remaining.indexOf(die.sides)
    if (index < 0) return false
    remaining.splice(index, 1)
    return true
  })
}

/**
 * Строка разбора для плашки: `18 + 5 = 23`.
 * Один кубик показываем просто числом — `7 = 7` читается как ошибка.
 * `estimated` — итог посчитан локально (экран OBS не ответил), значение помечаем «≈».
 */
export function formatRollBreakdown(dice: RollDie[], sum: number, estimated = false) {
  const prefix = estimated ? "≈ " : ""
  if (dice.length === 0) return `${prefix}Итог: ${sum}`
  if (dice.length === 1) return `${prefix}${sum}`
  return `${prefix}${dice.map((die) => die.value).join(" + ")} = ${sum}`
}

/**
 * Физика кубиков — СЫРЫЕ значения конфига dice-box. Воркер физики (инлайновый
 * `physics.worker` в бандле библиотеки) читает именно эти ключи и нормирует их:
 *   mass       → 1 + mass/3                                     — внутренняя масса;
 *   gravity    → gravity + mass/3                               — компенсация веса;
 *   spinForce  → spinForce/40                                   — импульс вращения;
 *   throwForce → throwForce / 2 / внутренняя масса × (1 + scale/6) — скорость броска.
 *
 * Нормировка идёт и в `init`, и в КАЖДОМ `updateConfig`, но пересчитывается только
 * то, что пришло в кадре. Без сырых ключей `mass`/`gravity`/`throwForce` накапливают
 * нормировку от уже нормированного значения: сила броска росла на ~20% за каждое
 * изменение размера пула — отсюда «невесомые» кубики, летящие через всю арену.
 * Поэтому сырые ключи лежат в конфиге ПОСТОЯННО, и результат всегда один и тот же.
 *
 * Значения: `mass: 9` → внутренняя масса `1 + 9/3 = 4`, ровно втрое больше дефолтной
 * (1 + 1/3 ≈ 1.33); движок сам поднимает гравитацию до `1 + 4/3 ≈ 2.33`, поэтому
 * кубик падает резче и меньше скачет. `throwForce: 15` подобран под эту массу, чтобы
 * скорость броска осталась дефолтной: `15 / 2 / 4 = 1.875`, а у дефолта
 * `5 / 2 / 1.33 = 1.875` — кубик летит как раньше, но становится втрое тяжелее.
 */
export const DICE_PHYSICS = {
  mass: 9,
  gravity: 1,
  throwForce: 15,
  spinForce: 6,
} as const

/** Сырая масса по умолчанию — `mass` из конфига библиотеки. */
export const DICE_DEFAULT_RAW_MASS = 1

/** Сырая сила броска по умолчанию — `throwForce` из конфига библиотеки. */
export const DICE_DEFAULT_RAW_THROWFORCE = 5

/** Внутренняя масса движка после нормализации воркера: `raw → 1 + raw/3`. */
export function internalDiceMass(rawMass: number) {
  return 1 + rawMass / 3
}

/**
 * Скорость броска на единицу `(1 + scale/6)` — то, что остаётся от `throwForce`
 * после деления на внутреннюю массу. У дефолта библиотеки и у нашего конфига
 * значение одно и то же: вес вырос, а разгон кубика — нет.
 */
export function diceThrowSpeedFactor(
  rawThrowForce: number = DICE_PHYSICS.throwForce,
  rawMass: number = DICE_PHYSICS.mass
) {
  return rawThrowForce / 2 / internalDiceMass(rawMass)
}

/**
 * Ширина кубика в процентах от ширины подложки:
 * один кубик → 22%, шесть и больше → 13% (шаг прогрессии ≈0.9).
 */
export const DICE_WIDTH_PERCENT = [22, 19.8, 17.8, 16, 14.4, 13]

/**
 * Перевод «процент ширины подложки → scale движка», откалиброван на /screen:
 * 22% подложки 1248×888 (канвас OBS 1920×1080) → scale 13.42.
 */
export const SCALE_PER_PERCENT = 0.61

/** Эталон калибровки: прямоугольник подложки на канвасе OBS 1920×1080. */
export const DICE_REFERENCE_GEOMETRY = { plateWidthPx: 1248, plateHeightPx: 888 }

/**
 * Проекция мира физики на пиксели зависит от ВЫСОТЫ канваса (камера смотрит на
 * арену сверху), поэтому в проценты переводим через высоту подложки: при другом
 * соотношении сторон кубик остаётся того же размера в пикселях, а не «плывёт».
 * Число выведено из калибровки: `0.61 × 888 / 12.48 = 43.4`.
 */
const SCALE_PER_PLATE_HEIGHT = 43.4

/** Прямоугольник подложки, внутри которой бросаются кубики (px). */
export type DiceGeometry = { plateWidthPx: number; plateHeightPx: number }

/**
 * `scale` для пула заданного размера. Пул больше шести кубиков упирается
 * в минимальную ширину — иначе кубики становятся неразличимыми.
 * Без геометрии считаем по эталону /screen: так функция остаётся чистой для тестов.
 */
export function diceScaleForCount(
  count: number,
  geometry: DiceGeometry = DICE_REFERENCE_GEOMETRY
) {
  const poolSize = Number.isFinite(count) ? Math.trunc(count) : 1
  const position =
    Math.min(Math.max(poolSize, 1), DICE_WIDTH_PERCENT.length) - 1
  const percent = DICE_WIDTH_PERCENT[position]
  const targetPx = (percent / 100) * geometry.plateWidthPx
  const scale = (targetPx * SCALE_PER_PLATE_HEIGHT) / geometry.plateHeightPx
  // Округляем до сотых: движок принимает любое число, но так его проще читать.
  return Math.round(scale * 100) / 100
}

/*
 * --- Итог броска на /screen: полоса градиента и кегль строки ---
 *
 * Итог лежит в нижних 20% серой подложки (DiceOverlay), поэтому строку нужно
 * уместить в её ширину. Кегль задаём в rem: на /screen корневой кегль привязан
 * к ширине канваса (правило `html.screen-scale` в index.css), и rem-размер
 * автоматически подстраивается под ширину экрана — и в OBS, и в окне браузера.
 */

/**
 * Кинематографичный результат броска: дисплейная антиква + многослойная
 * чёрная тень, чтобы белый текст читался даже поверх светлого кубика.
 * Живёт здесь, а не в компоненте: строку рисуют и панель Мастера, и /screen.
 */
export const ROLL_RESULT_TEXT =
  "font-display font-normal text-white leading-none " +
  "[text-shadow:0_6px_18px_rgba(0,0,0,1),0_2px_6px_rgba(0,0,0,1),0_0_2px_rgba(0,0,0,1)]"

/**
 * Кегль итога на /screen: 4× прежних 3.5vw, то есть 4 × 67.2 = 268.8 px на
 * эталонном канвасе OBS 1920×1080 — это ровно 16.8rem при корневом кегле 16 px.
 */
export const SCREEN_ROLL_TEXT_REM = 16.8

/**
 * Корневой кегль /screen: 1/120 ширины канваса — ровно 16 px при 1920, как на
 * эталоне OBS. Числа обязаны совпадать с правилом `html.screen-scale` в
 * index.css: разойдутся — rem-кегль итога перестанет попадать в подложку.
 */
export const SCREEN_ROOT_FONT_VW = 120
/** Ниже 10 px корень не опускаем: на маленьком окне кегль иначе нечитаем. */
export const SCREEN_ROOT_FONT_MIN_PX = 10
/** Выше 24 px не поднимаем: на 4K-канвасе строка иначе вырастает быстрее подложки. */
export const SCREEN_ROOT_FONT_MAX_PX = 24
/** Корневой кегль эталонного канваса 1920×1080 — база всех rem-расчётов. */
export const SCREEN_ROOT_FONT_REFERENCE_PX = 16

/** Корневой кегль /screen для окна заданной ширины (та же формула, что в CSS). */
export function screenRootFontPx(viewportWidthPx: number) {
  const width = Number.isFinite(viewportWidthPx) ? viewportWidthPx : 0
  return Math.min(
    Math.max(width / SCREEN_ROOT_FONT_VW, SCREEN_ROOT_FONT_MIN_PX),
    SCREEN_ROOT_FONT_MAX_PX
  )
}

/**
 * Advance-ширины Colus в долях кегля: сняты с public/fonts/Colus-Regular.ttf
 * (unitsPerEm = 1000). Строка итога состоит только из цифр, «+», «=», «≈» и
 * подписи «Итог:», поэтому таблица короткая, зато ширина считается точно,
 * а не «на глаз» — от неё зависит, влезет строка в подложку или нет.
 */
const ROLL_TEXT_EM: Record<string, number> = {
  " ": 0.25,
  ":": 0.232,
  "+": 0.476,
  "=": 0.488,
  "≈": 0.446,
  "0": 0.694,
  "1": 0.389,
  "2": 0.522,
  "3": 0.542,
  "4": 0.556,
  "5": 0.539,
  "6": 0.616,
  "7": 0.511,
  "8": 0.583,
  "9": 0.609,
  "И": 0.795,
  "г": 0.525,
  "о": 0.816,
  "т": 0.592,
}

/** Незнакомый знак считаем широким: лучше ужать кегль, чем вылезти за подложку. */
const ROLL_TEXT_FALLBACK_EM = 0.7

/** Запас на округление кегля браузером и сглаживание, доля от ширины строки. */
const ROLL_TEXT_FIT_MARGIN = 1.02

/** Ширина строки итога в кеглях (с запасом на сглаживание). */
export function rollTextEmWidth(text: string) {
  let em = 0
  for (const char of text) em += ROLL_TEXT_EM[char] ?? ROLL_TEXT_FALLBACK_EM
  return em * ROLL_TEXT_FIT_MARGIN
}

/**
 * Кегль строки итога в rem: ровно `SCREEN_ROLL_TEXT_REM`, пока строка помещается
 * в подложку, и меньше — если нет. Так короткое «14» остаётся в 4 раза крупнее
 * прежнего, а длинное «6 + 3 + 6 + 6 + 6 = 27» ужимается и не вылезает за края.
 * Функция чистая (геометрия и корневой кегль — параметры), поэтому её проверяет смоук.
 */
export function screenRollTextRem(
  text: string,
  plateWidthPx: number = DICE_REFERENCE_GEOMETRY.plateWidthPx,
  rootFontPx: number = SCREEN_ROOT_FONT_REFERENCE_PX
) {
  const em = rollTextEmWidth(text)
  if (em <= 0 || plateWidthPx <= 0 || rootFontPx <= 0) return SCREEN_ROLL_TEXT_REM
  const fitRem = plateWidthPx / (em * rootFontPx)
  // Округляем ВНИЗ до сотых: кегль предельный, и округление вверх вытолкнуло бы
  // строку за подложку на доли пикселя.
  return Math.min(SCREEN_ROLL_TEXT_REM, Math.floor(fitRem * 100) / 100)
}
