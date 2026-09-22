/**
 * Типы для `@3d-dice/dice-box`: пакет поставляется без деклараций, поэтому
 * описываем только то, что реально использует проект.
 * Состав опций и методов сверен с dist/dice-box.es.js версии 1.1.3:
 * в 1.1.3 конструктор принимает ОДИН объект конфигурации (контейнер — в `container`).
 */
declare module "@3d-dice/dice-box" {
  /** Один кубик в ответе физики: значение может прийти числом или строкой. */
  export type DiceBoxDieResult = {
    sides?: number | string
    value?: number | string
    rollId?: number
    groupId?: number
    [key: string]: unknown
  }

  /** Группа кубиков одной нотации: `1d20` или `2d6`. */
  export type DiceBoxRollResult = DiceBoxDieResult & {
    /** Отдельные кубики группы */
    rolls?: DiceBoxDieResult[]
    /** Сумма группы с учётом модификатора */
    value?: number | string
    /** Количество кубиков в группе */
    qty?: number
  }

  export type DiceBoxConfig = {
    /** Селектор или узел, куда складывается канвас (по умолчанию — body) */
    container?: string | HTMLElement | null
    /** База для ассетов: по умолчанию — origin приложения */
    origin?: string
    /** Папка с ammo/ и themes/ относительно origin */
    assetPath?: string
    theme?: string
    themeColor?: string
    /** Размер кубиков */
    scale?: number
    /** OffscreenCanvas вместо обычного канваса */
    offscreen?: boolean
    enableShadows?: boolean
    shadowTransparency?: number
    lightIntensity?: number
    /** Пауза между появлением кубиков, мс */
    delay?: number
    suspendSimulation?: boolean
    /**
     * Физика: значения воркер нормализует сам (`mass → 1 + mass/3`,
     * `gravity → gravity + mass/3`, `throwForce → throwForce/2/mass×(1+scale/6)`,
     * `spinForce → spinForce/40`), поэтому в конфиге должны лежать СЫРЫЕ ключи —
     * `updateConfig` отправляет весь конфиг заново и пересчитывает их повторно.
     */
    mass?: number
    gravity?: number
    throwForce?: number
    spinForce?: number
    preloadThemes?: string[]
    onBeforeRoll?: (results: unknown) => void
    onDieComplete?: (result: DiceBoxDieResult) => void
    onRollComplete?: (results: DiceBoxRollResult[]) => void
    onRemoveComplete?: (result: DiceBoxDieResult) => void
    id?: string
  }

  export default class DiceBox {
    constructor(config?: DiceBoxConfig)
    /** Загрузка мира физики и темы — обязательна до первого броска */
    init(): Promise<unknown>
    /** Бросок по нотации: сцена предварительно очищается */
    roll(
      notation: string | string[],
      options?: { theme?: string; themeColor?: string; newStartPoint?: boolean }
    ): Promise<DiceBoxRollResult[]>
    /** Добавление кубиков без очистки сцены */
    add(
      notation: string | string[],
      options?: { theme?: string; themeColor?: string; newStartPoint?: boolean }
    ): Promise<DiceBoxRollResult[]>
    clear(): DiceBox
    show(): DiceBox
    hide(className?: string): DiceBox
    updateConfig(config: DiceBoxConfig): Promise<unknown>
    resizeWorld(): void
    onBeforeRoll: (results: unknown) => void
    onDieComplete: (result: DiceBoxDieResult) => void
    onRollComplete: (results: DiceBoxRollResult[]) => void
    onRemoveComplete: (result: DiceBoxDieResult) => void
  }
}
