import type { EpisodeFile } from "@/data/types"

/**
 * Данные для смоук-прогонов.
 *
 * Само приложение стартует пустым (см. `@/data/seed`): ни сцен, ни персонажей,
 * ни треков. Проверки стора, синхронизации и экспорта работают на собственном
 * наборе — он повторяет прежний демо-выпуск, под который написаны сценарии:
 * порядок сцен, карты местности, заметки и токены.
 */
export const SMOKE_SCENE_GROUPS = [
  "Завязка",
  "1 акт",
  "2 акт",
  "3 акт",
  "Финал",
]

export const SMOKE_EPISODE: EpisodeFile = {
  campaign: "Пединбург: Хроники Трёх Ключей",
  sceneGroups: SMOKE_SCENE_GROUPS,
  backgrounds: [
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
  ],
  characters: [
    { id: "char-ingrid", name: "Ингрид Хальс", role: "Следопыт", initials: "ИХ", category: "hero", avatarSrc: "/placeholders/character-1.svg", fullBodyPngSrc: "/placeholders/character-1.svg", hp: { current: 31, max: 34 } },
    { id: "char-marcus", name: "Маркус фон Борн", role: "Алхимик", initials: "МБ", category: "hero", avatarSrc: "/placeholders/character-2.svg", fullBodyPngSrc: "/placeholders/character-2.svg", hp: { current: 18, max: 26 } },
    { id: "char-selena", name: "Селена Дрейк", role: "Плут", initials: "СД", category: "hero", avatarSrc: "/placeholders/character-3.svg", fullBodyPngSrc: "/placeholders/character-3.svg", hp: { current: 24, max: 24 } },
    { id: "char-anselm", name: "Отец Ансельм", role: "Клерик", initials: "ОА", category: "hero", avatarSrc: "/placeholders/character-4.svg", fullBodyPngSrc: "/placeholders/character-4.svg", hp: { current: 27, max: 30 } },
    { id: "char-hobb", name: "Хобб Ржавый", role: "Наёмник", initials: "ХР", category: "npc", avatarSrc: "/placeholders/character-5.svg", fullBodyPngSrc: "/placeholders/character-5.svg", hp: { current: 12, max: 28 } },
    { id: "char-cultist", name: "Культист из стоков", role: "Противник", initials: "КЛ", category: "enemy", avatarSrc: "/placeholders/character-2.svg", fullBodyPngSrc: "/placeholders/character-2.svg" },
    { id: "item-three-keys", name: "Три Ключа", role: "Предмет", initials: "ТК", category: "item", avatarSrc: "", fullBodyPngSrc: "" },
    { id: "item-lantern", name: "Лампа ловчего", role: "Предмет", initials: "ЛЛ", category: "item", avatarSrc: "", fullBodyPngSrc: "" },
  ],
  tracks: [
    { id: "track-01", title: "Порт в тумане", artist: "Lowlands Ensemble", duration: "3:12", tag: "Атмосфера", audioSrc: "", coverSrc: "" },
    { id: "track-02", title: "Шаги в катакомбах", artist: "Lowlands Ensemble", duration: "4:05", tag: "Подземелье", audioSrc: "", coverSrc: "" },
    { id: "track-03", title: "Вальс ратуши", artist: "Pedinburg Chamber", duration: "2:48", tag: "Социальная", audioSrc: "", coverSrc: "" },
    { id: "track-04", title: "Мост Мясников", artist: "Grimworks", duration: "3:37", tag: "Погоня", audioSrc: "", coverSrc: "" },
    { id: "track-05", title: "Молоты под городом", artist: "Grimworks", duration: "5:21", tag: "Бой", audioSrc: "", coverSrc: "" },
    { id: "track-06", title: "Костяной хор", artist: "Chapel of Ash", duration: "6:02", tag: "Ритуал", audioSrc: "", coverSrc: "" },
  ],
  mapTokens: [
    { id: "token-ingrid", characterId: "char-ingrid", mapId: "bg-catacombs", cellX: 6, cellY: 2 },
    { id: "token-marcus", characterId: "char-marcus", mapId: "bg-catacombs", cellX: 6, cellY: 4 },
    { id: "token-selena", characterId: "char-selena", mapId: "bg-catacombs", cellX: 3, cellY: 6 },
    { id: "token-anselm", characterId: "char-anselm", mapId: "bg-catacombs", cellX: 7, cellY: 6 },
    { id: "token-hobb", characterId: "char-hobb", mapId: "bg-catacombs", cellX: 12, cellY: 7 },
    { id: "token-cultist", characterId: "char-cultist", mapId: "bg-catacombs", cellX: 10, cellY: 4 },
    { id: "token-item-keys", characterId: "item-three-keys", mapId: "bg-catacombs", cellX: 4, cellY: 2 },
    { id: "token-item-lantern", characterId: "item-lantern", mapId: "bg-catacombs", cellX: 9, cellY: 9 },
    // Вторая карта — своя, независимая раскладка.
    { id: "token-ossuary-ingrid", characterId: "char-ingrid", mapId: "bg-ossuary", cellX: 1, cellY: 0 },
    { id: "token-ossuary-cultist", characterId: "char-cultist", mapId: "bg-ossuary", cellX: 11, cellY: 7 },
  ],
  sceneNotes: {
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
  },
  activeBackgroundId: "bg-harbor",
  activeMapId: "bg-catacombs",
}
