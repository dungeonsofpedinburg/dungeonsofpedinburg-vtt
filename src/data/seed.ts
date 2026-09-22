import {
  Compass,
  DoorOpen,
  Flame,
  Landmark,
  Map,
  Moon,
  Scroll,
  Skull,
  Swords,
  Trees,
  Warehouse,
  Waves,
} from "lucide-react"
import type {
  ActGroup,
  Background,
  Character,
  IconComponent,
  MapToken,
  SceneNotes,
  SoundpadSlot,
} from "@/data/types"

/** Порядок групп в библиотеке фонов. */
export const actGroups: ActGroup[] = [
  "Завязка",
  "1 акт",
  "2 акт",
  "3 акт",
  "Финал",
]

export const initialBackgrounds: Background[] = [
  { id: "bg-harbor", title: "Порт в тумане", src: "/placeholders/background-1.svg", actGroup: "Завязка", isBattlemap: false },
  { id: "bg-tavern", title: "Таверна «Три ключа»", src: "/placeholders/background-2.svg", actGroup: "Завязка", isBattlemap: false },
  { id: "bg-artisan-street", title: "Улица Ремесленников", src: "/placeholders/background-3.svg", actGroup: "Завязка", isBattlemap: false },
  { id: "bg-north-gate", title: "Северные ворота", src: "/placeholders/background-1.svg", actGroup: "1 акт", isBattlemap: false },
  { id: "bg-catacombs", title: "Катакомбы", src: "/placeholders/background-2.svg", actGroup: "1 акт", isBattlemap: true },
  { id: "bg-town-hall", title: "Ратуша", src: "/placeholders/background-3.svg", actGroup: "1 акт", isBattlemap: false },
  { id: "bg-forge-rows", title: "Кузнечные ряды", src: "/placeholders/background-1.svg", actGroup: "1 акт", isBattlemap: false },
  { id: "bg-butcher-bridge", title: "Мост Мясников", src: "/placeholders/background-2.svg", actGroup: "1 акт", isBattlemap: false },
  { id: "bg-observatory", title: "Башня астронома", src: "/placeholders/background-1.svg", actGroup: "2 акт", isBattlemap: false },
  { id: "bg-misty-shore", title: "Туманный берег", src: "/placeholders/background-3.svg", actGroup: "2 акт", isBattlemap: false },
  { id: "bg-ossuary", title: "Костница", src: "/placeholders/background-2.svg", actGroup: "2 акт", isBattlemap: true },
  { id: "bg-black-pines", title: "Чёрные сосны", src: "/placeholders/background-3.svg", actGroup: "2 акт", isBattlemap: false },
]

/** Иконки для иконочных плейсхолдеров, когда у фона ещё нет картинки. */
export const backgroundIcons: Record<string, IconComponent> = {
  "bg-harbor": Waves,
  "bg-tavern": Flame,
  "bg-artisan-street": Warehouse,
  "bg-north-gate": DoorOpen,
  "bg-catacombs": Skull,
  "bg-town-hall": Landmark,
  "bg-forge-rows": Swords,
  "bg-butcher-bridge": Compass,
  "bg-observatory": Moon,
  "bg-misty-shore": Map,
  "bg-ossuary": Scroll,
  "bg-black-pines": Trees,
}

export const initialCharacters: Character[] = [
  { id: "char-ingrid", name: "Ингрид Хальс", role: "Следопыт", initials: "ИХ", category: "hero", avatarSrc: "/placeholders/character-1.svg", fullBodyPngSrc: "/placeholders/character-1.svg", hp: { current: 31, max: 34 } },
  { id: "char-marcus", name: "Маркус фон Борн", role: "Алхимик", initials: "МБ", category: "hero", avatarSrc: "/placeholders/character-2.svg", fullBodyPngSrc: "/placeholders/character-2.svg", hp: { current: 18, max: 26 } },
  { id: "char-selena", name: "Селена Дрейк", role: "Плут", initials: "СД", category: "hero", avatarSrc: "/placeholders/character-3.svg", fullBodyPngSrc: "/placeholders/character-3.svg", hp: { current: 24, max: 24 } },
  { id: "char-anselm", name: "Отец Ансельм", role: "Клерик", initials: "ОА", category: "hero", avatarSrc: "/placeholders/character-4.svg", fullBodyPngSrc: "/placeholders/character-4.svg", hp: { current: 27, max: 30 } },
  { id: "char-hobb", name: "Хобб Ржавый", role: "Наёмник", initials: "ХР", category: "npc", avatarSrc: "/placeholders/character-5.svg", fullBodyPngSrc: "/placeholders/character-5.svg", hp: { current: 12, max: 28 } },
  { id: "char-cultist", name: "Культист из стоков", role: "Противник", initials: "КЛ", category: "enemy", avatarSrc: "/placeholders/character-2.svg", fullBodyPngSrc: "/placeholders/character-2.svg" },
  { id: "item-three-keys", name: "Три Ключа", role: "Предмет", initials: "ТК", category: "item", avatarSrc: "", fullBodyPngSrc: "" },
  { id: "item-lantern", name: "Лампа ловчего", role: "Предмет", initials: "ЛЛ", category: "item", avatarSrc: "", fullBodyPngSrc: "" },
]

/** Стартовая расстановка: у каждой карты своя раскладка (cellX 0..13, cellY 0..10). */
export const initialMapTokens: MapToken[] = [
  { id: "token-ingrid", characterId: "char-ingrid", mapId: "bg-catacombs", cellX: 6, cellY: 2 },
  { id: "token-marcus", characterId: "char-marcus", mapId: "bg-catacombs", cellX: 6, cellY: 4 },
  { id: "token-selena", characterId: "char-selena", mapId: "bg-catacombs", cellX: 3, cellY: 6 },
  { id: "token-anselm", characterId: "char-anselm", mapId: "bg-catacombs", cellX: 7, cellY: 6 },
  { id: "token-hobb", characterId: "char-hobb", mapId: "bg-catacombs", cellX: 12, cellY: 7 },
  { id: "token-cultist", characterId: "char-cultist", mapId: "bg-catacombs", cellX: 10, cellY: 4 },
  { id: "token-item-keys", characterId: "item-three-keys", mapId: "bg-catacombs", cellX: 4, cellY: 2 },
  { id: "token-item-lantern", characterId: "item-lantern", mapId: "bg-catacombs", cellX: 9, cellY: 9 },
  // Вторая карта — своя, независимая раскладка
  { id: "token-ossuary-ingrid", characterId: "char-ingrid", mapId: "bg-ossuary", cellX: 1, cellY: 0 },
  { id: "token-ossuary-cultist", characterId: "char-cultist", mapId: "bg-ossuary", cellX: 11, cellY: 7 },
]

export const initialSceneNotes: SceneNotes = {
  "bg-harbor":
    "Партия сходит с трапа в холодный туман. Таможенник вымогает пошлину, в трюме ждёт груз с двойным дном — первая зацепка на контрабандистов.",
  "bg-tavern":
    "Нижний зал таверны «Три ключа». Хозяин Ганс передаёт письмо с печатью ратуши и карту ливневых стоков. В углу сидит человек в мокром плаще и следит за героями.",
  "bg-north-gate":
    "Стража проверяет повозки. Комендант Брайт продаст пропуск за 20 золотых или за услугу: найти писаря, ушедшего к стокам. На стене свежие царапины.",
  "bg-catacombs":
    "Боевая карта: узкие тоннели с водой по колено. Засада — два культиста и подмастерье-нежить. Проверка Восприятия СЛ 14, чтобы заметить метки на стенах.",
  "bg-town-hall":
    "Социальная сцена: бургомистр объявляет награду за голову «серого алхимика». Три фракции ищут поддержки партии. Каждые 15 минут — новый слух.",
}

/**
 * Саундпад начинается пустым: звуки — дело конкретного выпуска, а готовых
 * эффектов у проекта нет. Мастер добавляет плитки сам, «плюс» в конце ряда.
 */
export const initialSoundpad: SoundpadSlot[] = []
