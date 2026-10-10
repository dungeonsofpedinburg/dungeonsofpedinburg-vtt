import { useEffect, useRef, useState } from "react"
import {
  crossfadeLevels,
  isCrossfadeFinished,
  isCrossfadeInStarted,
} from "@/lib/audio-crossfade"
import {
  resolveGroupTrackAction,
  shouldResumeGroupTrack,
} from "@/lib/group-track"
import type { GroupTrack, Track } from "@/data/types"

/** Режимы повтора: выключен, повторять плейлист, повторять один трек. */
export type RepeatMode = "off" | "all" | "one"

type DeckName = "a" | "b"

type Deck = {
  audio: HTMLAudioElement
  trackId: string
}

/**
 * Фоновый канал трека группы сцен (акта): своё `<audio>`, играет зацикленно.
 * Живёт параллельно двум декам ручного плейлиста, чтобы музыка акта и ручной
 * трек не мешали друг другу.
 */
type AmbientChannel = {
  audio: HTMLAudioElement
  trackId: string
  title: string
  src: string
}

const DEFAULT_VOLUME = 65

/** Длительность плавного входа/выхода фонового трека группы, мс. */
const AMBIENT_FADE_MS = 1500

/** Канал группы создаётся лениво: в Node (смоук) конструктора Audio нет. */
function createAmbientChannel(): AmbientChannel | null {
  if (typeof Audio === "undefined") return null
  const audio = new Audio()
  audio.preload = "auto"
  // Трек акта звучит по кругу: неизвестно, сколько сцен мастер проведёт в акте.
  audio.loop = true
  audio.volume = 0
  return { audio, trackId: "", title: "", src: "" }
}

/**
 * Плеер саундтрека на двух аудио-деках: переключение треков идёт с кроссфейдом
 * (старый затухает 3 с, новый проявляется с 3-й по 5-ю секунду). Физику звука
 * ведёт requestAnimationFrame, поэтому переход можно прервать новым переключением.
 * Состояние воспроизведения живёт только в UI — в стор оно не уезжает.
 *
 * Третий источник — `groupTrack`: музыка активного акта. Она играет зацикленно
 * сама по себе, а ручной трек временно её перекрывает (см. `duckGroupTrack` и
 * `resumeGroupTrack`): позиция запоминается, и на паузе акт возвращается с места.
 */
export function useSoundtrackPlayer(
  tracks: Track[],
  repeatMode: RepeatMode,
  groupTrack: GroupTrack | null
) {
  const deckARef = useRef<Deck | null>(null)
  const deckBRef = useRef<Deck | null>(null)
  const activeRef = useRef<DeckName>("a")
  const rampRef = useRef<number | null>(null)
  const tracksRef = useRef(tracks)
  const repeatRef = useRef(repeatMode)
  const currentIdRef = useRef(tracks[0]?.id ?? "")
  const playingRef = useRef(false)
  const volumeRef = useRef(DEFAULT_VOLUME)

  const ambientRef = useRef<AmbientChannel | null>(null)
  const ambientFadeRef = useRef<number | null>(null)
  /** Позиция, на которой фоновый трек был заглушён ручным: с неё он вернётся. */
  const ambientSavedTimeRef = useRef(0)
  /** Групповой трек заглушён ручным (true) — ждём паузу, чтобы вернуть его. */
  const ambientSuspendedRef = useRef(false)
  /** Последний запрошенный трек акта: он же вернётся после ручного трека. */
  const ambientRequestRef = useRef<GroupTrack | null>(null)

  const [currentId, setCurrentId] = useState(tracks[0]?.id ?? "")
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  const [ambientId, setAmbientId] = useState("")


  // Колбэки слушателей вешаются один раз и читают свежие данные из ref-ов.
  useEffect(() => {
    tracksRef.current = tracks
    repeatRef.current = repeatMode
    currentIdRef.current = currentId
  }, [tracks, repeatMode, currentId])

  const deckOf = (name: DeckName) =>
    name === "a" ? deckARef.current : deckBRef.current
  const activeDeck = () => deckOf(activeRef.current)
  const idleDeck = () => deckOf(activeRef.current === "a" ? "b" : "a")
  const trackById = (id: string) =>
    tracksRef.current.find((track) => track.id === id)
  const masterVolume = () => volumeRef.current / 100

  function markPlaying(value: boolean) {
    playingRef.current = value
    setIsPlaying(value)
  }

  function stopRamp() {
    if (rampRef.current !== null) {
      cancelAnimationFrame(rampRef.current)
      rampRef.current = null
    }
  }

  /** Плавно ведёт громкость фонового трека к `level` за `AMBIENT_FADE_MS`. */
  function fadeAmbient(level: number, onDone?: () => void) {
    const channel = ambientRef.current
    if (!channel) return
    if (ambientFadeRef.current !== null) {
      cancelAnimationFrame(ambientFadeRef.current)
      ambientFadeRef.current = null
    }
    const from = channel.audio.volume
    const to = level
    // Без requestAnimationFrame (Node, смоуки) ставим громкость сразу.
    if (Math.abs(to - from) < 0.01 || typeof requestAnimationFrame !== "function") {
      channel.audio.volume = to
      onDone?.()
      return
    }
    let startedAt: number | null = null
    const step = (now: number) => {
      if (startedAt === null) startedAt = now
      const ratio = Math.min((now - startedAt) / AMBIENT_FADE_MS, 1)
      channel.audio.volume = from + (to - from) * ratio
      if (ratio < 1) {
        ambientFadeRef.current = requestAnimationFrame(step)
        return
      }
      ambientFadeRef.current = null
      onDone?.()
    }
    ambientFadeRef.current = requestAnimationFrame(step)
  }

  /**
   * Музыка акта: свой трек играет зацикленно, пока Мастер ведёт сцены группы.
   *
   * * переключение внутри группы трек не трогает — эффект просто не вызывается;
   * * новый трек акта проявляется кроссфейдом, старый уходит;
   * * если сейчас играет ручной трек — музыка акта ждёт паузы (`resumeGroupTrack`).
   */
  function applyGroupTrack(track: GroupTrack) {
    const channel = (ambientRef.current ??= createAmbientChannel())
    if (!channel) return
    // Запоминаем запрошенный трек акта: он вернётся после ручного перекрытия.
    ambientRequestRef.current = track

    const action = resolveGroupTrackAction({
      requestedId: track.id,
      currentId: channel.trackId,
      manualPlaying: playingRef.current,
      suspended: ambientSuspendedRef.current,
    })
    if (action.type === "keep") return

    if (action.type === "defer") {
      // Ручной трек главнее: запоминаем трек акта и поднимаем его на паузе.
      ambientSuspendedRef.current = true
      if (channel.src !== track.src) {
        channel.src = track.src
        channel.trackId = track.id
        channel.title = track.title
        ambientSavedTimeRef.current = 0
        setAmbientId(track.id)
      }
      return
    }

    if (!action.restart) {
      // Тот же трек акта: продолжаем с сохранённого места.
      resumeGroupTrack()
      return
    }

    channel.src = track.src
    channel.trackId = track.id
    channel.title = track.title
    channel.audio.src = track.src
    channel.audio.currentTime = 0
    channel.audio.volume = 0
    ambientSavedTimeRef.current = 0
    ambientSuspendedRef.current = false
    setAmbientId(track.id)
    void channel.audio.play().catch(() => {})
    fadeAmbient(masterVolume())
  }

  /** Ручной трек зазвучал: музыка акта плавно уходит и запоминает позицию. */
  function duckGroupTrack() {
    const channel = ambientRef.current
    if (!channel || channel.audio.paused) return
    ambientSuspendedRef.current = true
    ambientSavedTimeRef.current = channel.audio.currentTime
    fadeAmbient(0, () => channel.audio.pause())
  }

  /** Ручной трек встал на паузу: музыка акта возвращается с того же места. */
  function resumeGroupTrack() {
    const channel = ambientRef.current
    if (!channel || !channel.src) return
    if (
      !shouldResumeGroupTrack({
        suspended: ambientSuspendedRef.current,
        manualPlaying: playingRef.current,
      })
    ) {
      return
    }
    const request = ambientRequestRef.current
    if (request && channel.src !== request.src) {
      // Пока играл ручной трек, акт сменился: новый трек акта — с начала.
      channel.src = request.src
      channel.trackId = request.id
      channel.title = request.title
      channel.audio.src = request.src
      ambientSavedTimeRef.current = 0
      setAmbientId(request.id)
    }
    channel.audio.currentTime = ambientSavedTimeRef.current
    channel.audio.volume = 0
    ambientSuspendedRef.current = false
    void channel.audio.play().catch(() => {})
    fadeAmbient(masterVolume())
  }

  /** Кроссфейд: уходящий гаснет 3 с, новый проявляется со 2-й по 5-ю секунду. */
  function crossfadeTo(trackId: string) {
    const track = trackById(trackId)
    const outgoing = activeDeck()
    const incoming = idleDeck()
    if (!track || !track.audioSrc || !outgoing || !incoming) return

    stopRamp()
    // Активным сразу становится новый дек: позицию читаем с него.
    activeRef.current = activeRef.current === "a" ? "b" : "a"
    incoming.audio.src = track.audioSrc
    incoming.audio.currentTime = 0
    incoming.audio.volume = 0
    incoming.trackId = track.id
    setCurrentId(track.id)
    setPosition(0)
    setDuration(0)
    markPlaying(true)
    // Ручной трек перекрывает музыку акта — она уходит и запоминает позицию.
    duckGroupTrack()

    if (outgoing.audio.paused) {
      // До этого ничего не играло — просто включаем новый трек.
      incoming.audio.volume = masterVolume()
      void incoming.audio.play().catch(() => {})
      return
    }

    let incomingStarted = false
    let startedAt: number | null = null
    const step = (now: number) => {
      // Отсчёт идёт по времени кадров rAF — без вызова performance.now().
      if (startedAt === null) startedAt = now
      const elapsed = now - startedAt
      const levels = crossfadeLevels(elapsed)
      outgoing.audio.volume = masterVolume() * levels.out
      incoming.audio.volume = masterVolume() * levels.in
      if (!incomingStarted && isCrossfadeInStarted(elapsed)) {
        incomingStarted = true
        void incoming.audio.play().catch(() => {})
      }
      if (isCrossfadeFinished(elapsed)) {
        outgoing.audio.pause()
        outgoing.audio.volume = masterVolume()
        incoming.audio.volume = masterVolume()
        rampRef.current = null
        return
      }
      rampRef.current = requestAnimationFrame(step)
    }
    rampRef.current = requestAnimationFrame(step)
  }

  /** Выбрать трек без воспроизведения (например, после удаления текущего). */
  function select(trackId: string) {
    stopRamp()
    const deck = activeDeck()
    if (!deck) return
    deck.audio.pause()
    const track = trackId ? trackById(trackId) : undefined
    deck.audio.src = track?.audioSrc ?? ""
    deck.audio.volume = masterVolume()
    deck.trackId = track?.id ?? ""
    setCurrentId(track?.id ?? "")
    setPosition(0)
    setDuration(0)
    markPlaying(false)
    // Ручной плейлист замолчал — музыку акта возвращаем с сохранённого места.
    resumeGroupTrack()
  }

  /** Клик по обложке: тот же трек — пауза/продолжить, другой — кроссфейд. */
  function play(trackId: string) {
    if (trackId === currentIdRef.current) {
      toggle()
      return
    }
    crossfadeTo(trackId)
  }

  function toggle() {
    if (playingRef.current) {
      stopRamp()
      const deck = activeDeck()
      if (deck) {
        deck.audio.volume = masterVolume()
        deck.audio.pause()
      }
      markPlaying(false)
      // Пауза ручного трека возвращает музыку акта на сохранённую позицию.
      resumeGroupTrack()
      return
    }
    const deck = activeDeck()
    const track = trackById(currentIdRef.current)
    if (!deck || !track?.audioSrc) return
    if (deck.trackId !== track.id) {
      deck.audio.src = track.audioSrc
      deck.trackId = track.id
    }
    deck.audio.volume = masterVolume()
    void deck.audio.play().catch(() => {})
    markPlaying(true)
    duckGroupTrack()
  }

  /** Переход по списку: играет — с кроссфейдом, на паузе — просто выбираем. */
  function stepTrack(offset: number) {
    const list = tracksRef.current
    if (list.length === 0) return
    const index = list.findIndex((track) => track.id === currentIdRef.current)
    const target = list[(index + offset + list.length) % list.length]
    if (!target) return
    if (playingRef.current) crossfadeTo(target.id)
    else select(target.id)
  }

  /** Конец трека: повтор одного, следующий по кругу или остановка. */
  function handleEnded() {
    if (repeatRef.current === "one") {
      const deck = activeDeck()
      if (deck?.audio.src) {
        deck.audio.currentTime = 0
        void deck.audio.play().catch(() => {})
      }
      return
    }
    if (repeatRef.current === "all") {
      stepTrack(1)
      return
    }
    markPlaying(false)
    // Плейлист закончился — музыку акта возвращаем на сохранённую позицию.
    resumeGroupTrack()
  }

  function seek(ratio: number) {
    const deck = activeDeck()
    if (!deck || !Number.isFinite(deck.audio.duration)) return
    deck.audio.currentTime = ratio * deck.audio.duration
    setPosition(deck.audio.currentTime)
  }

  function applyVolume(value: number) {
    const next = Math.min(Math.max(Math.round(value), 0), 100)
    volumeRef.current = next
    setVolume(next)
    if (rampRef.current === null) {
      const deck = activeDeck()
      if (deck) deck.audio.volume = next / 100
    }
    // Музыка акта слушается той же громкостью: меняем её, если трек сейчас звучит.
    const channel = ambientRef.current
    if (channel && ambientFadeRef.current === null && !ambientSuspendedRef.current) {
      channel.audio.volume = next / 100
    }
  }

  /**
   * Смена акта: поднимаем его трек. Группа без трека сюда не доходит (`groupTrack`
   * равен null) — по спецификации музыка продолжает играть, поэтому «пустой»
   * акт ничего не меняет. Внутри одного акта трек тот же — эффект не срабатывает.
   */
  useEffect(() => {
    if (!groupTrack) return
    applyGroupTrack(groupTrack)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupTrack?.id, groupTrack?.src])

  // Деки создаются один раз: <audio> живут вне JSX — им не нужен DOM-узел.
  useEffect(() => {
    const deckA: Deck = { audio: new Audio(), trackId: "" }
    const deckB: Deck = { audio: new Audio(), trackId: "" }
    deckARef.current = deckA
    deckBRef.current = deckB

    const onTimeUpdate = (event: Event) => {
      const audio = event.currentTarget as HTMLAudioElement
      if (audio !== activeDeck()?.audio) return
      setPosition(audio.currentTime || 0)
    }
    const onDuration = (event: Event) => {
      const audio = event.currentTarget as HTMLAudioElement
      if (audio !== activeDeck()?.audio) return
      if (Number.isFinite(audio.duration)) setDuration(audio.duration || 0)
    }
    const onEnded = (event: Event) => {
      const audio = event.currentTarget as HTMLAudioElement
      if (audio !== activeDeck()?.audio) return
      handleEnded()
    }

    const audios = [deckA.audio, deckB.audio]
    audios.forEach((audio) => {
      audio.preload = "metadata"
      audio.addEventListener("timeupdate", onTimeUpdate)
      audio.addEventListener("durationchange", onDuration)
      audio.addEventListener("loadedmetadata", onDuration)
      audio.addEventListener("ended", onEnded)
    })

    return () => {
      stopRamp()
      // Фоновый канал живёт вне JSX — глушим его вместе с деками.
      if (ambientFadeRef.current !== null) {
        cancelAnimationFrame(ambientFadeRef.current)
        ambientFadeRef.current = null
      }
      ambientRef.current?.audio.pause()
      audios.forEach((audio) => {
        audio.removeEventListener("timeupdate", onTimeUpdate)
        audio.removeEventListener("durationchange", onDuration)
        audio.removeEventListener("loadedmetadata", onDuration)
        audio.removeEventListener("ended", onEnded)
        audio.pause()
      })
      deckARef.current = null
      deckBRef.current = null
    }
  }, [])

  return {
    currentId,
    current: tracks.find((track) => track.id === currentId) ?? null,
    isPlaying,
    position,
    duration,
    volume,
    isMuted: volume === 0,
    /** id трека акта, который сейчас звучит как фон (пустая строка — нет) */
    groupTrackId: ambientId,
    play,
    toggle,
    select,
    next: () => stepTrack(1),
    previous: () => stepTrack(-1),
    seek,
    setVolumePercent: applyVolume,
    toggleMute: () => applyVolume(volumeRef.current === 0 ? DEFAULT_VOLUME : 0),
  }
}
