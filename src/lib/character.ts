import type { Character, CharacterState } from "@/data/types"

/** Инициалы из имени: «Ингрид Хальс» → «ИХ». */
export function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const letters = parts.map((part) => part.charAt(0).toUpperCase()).join("")
  return letters || "??"
}

/** id состояния, которое есть у любого персонажа: «Обычное». */
export const DEFAULT_CHARACTER_STATE_ID = "default"

/** Имя состояния по умолчанию. */
export const DEFAULT_CHARACTER_STATE_NAME = "Обычное"

/**
 * Базовые картинки персонажа как состояние «Обычное». Отдельного поля для него
 * нет: у файлов выпуска старого формата состояний не было вовсе, и их
 * `avatarSrc`/`fullBodyPngSrc` — ровно это состояние.
 */
export function defaultCharacterState(character: Character): CharacterState {
  return {
    id: DEFAULT_CHARACTER_STATE_ID,
    name: DEFAULT_CHARACTER_STATE_NAME,
    avatarSrc: character.avatarSrc,
    fullBodyPngSrc: character.fullBodyPngSrc,
  }
}

/**
 * Все состояния персонажа: «Обычное» первым, затем добавленные мастером. Если
 * файл пришёл без «Обычного» (или состояний не было вовсе) — подставляем его
 * сами, чтобы в меню всегда был путь назад.
 */
export function characterStates(character: Character): CharacterState[] {
  const states = character.states ?? []
  if (states.some((state) => state.id === DEFAULT_CHARACTER_STATE_ID)) {
    return states
  }
  return [defaultCharacterState(character), ...states]
}

/**
 * Активное состояние персонажа. Если `activeStateId` пуст или указывает на
 * удалённое состояние — возвращается «Обычное».
 */
export function getCharacterActiveState(character: Character): CharacterState {
  const states = characterStates(character)
  const active = states.find((state) => state.id === character.activeStateId)
  return active ?? states[0] ?? defaultCharacterState(character)
}

/** Картинка токена для карты и рельсы: из активного состояния персонажа. */
export function characterAvatarSrc(character: Character) {
  return getCharacterActiveState(character).avatarSrc
}

/** Иллюстрация для сцены: из активного состояния персонажа. */
export function characterFullBodySrc(character: Character) {
  return getCharacterActiveState(character).fullBodyPngSrc
}

/** Есть ли у персонажа варианты, кроме «Обычного». */
export function hasCustomCharacterStates(character: Character) {
  return (character.states ?? []).some(
    (state) => state.id !== DEFAULT_CHARACTER_STATE_ID
  )
}
