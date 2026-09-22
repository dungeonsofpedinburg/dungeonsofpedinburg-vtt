import { useEffect } from "react"

/** Клавиши вкладок правой панели: «1» — сцены, «2» — саундтрек, и так далее. */
export const TAB_SHORTCUT_KEYS = ["1", "2", "3", "4"]

const TYPING_TAGS = ["INPUT", "TEXTAREA", "SELECT"]
/** Открытые Radix-слои: меню, диалоги, выпадающие списки. */
const MODAL_SELECTOR =
  '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]'

/** Фокус в поле ввода или в contenteditable — шорткаты должны молчать. */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return TYPING_TAGS.includes(target.tagName)
}

/**
 * Открытый диалог или меню перехватывает цифры первыми: иначе выбор в меню
 * «Файл» переключал бы вкладки под открытым меню.
 */
function isModalOpen() {
  return Boolean(document.querySelector(MODAL_SELECTOR))
}

/**
 * Клавиши 1–4 переключают вкладки правой панели (сцены / саундтрек / карты /
 * кубики). Хук не срабатывает, когда мастер печатает текст: переименование сцены
 * цифрой в названии не должно прыгать по вкладкам.
 */
export function useTabNumberShortcuts(onSelect: (index: number) => void) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
      const index = TAB_SHORTCUT_KEYS.indexOf(event.key)
      if (index < 0) return
      if (isTypingTarget(event.target) || isModalOpen()) return
      event.preventDefault()
      onSelect(index)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onSelect])
}
