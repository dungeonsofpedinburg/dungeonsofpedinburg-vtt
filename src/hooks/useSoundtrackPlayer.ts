import { useEffect, useRef, useState } from "react"
import {
  crossfadeLevels,
  isCrossfadeFinished,
  isCrossfadeInStarted,
} from "@/lib/audio-crossfade"
import type { Track } from "@/data/types"

/** Режимы повтора: выключен, повторять плейлист, повторять один трек. */
export type RepeatMode = "off" | "all" | "one"

type DeckName = "a" | "b"

type Deck = {
  audio: HTMLAudioElement
  trackId: string
}

const DEFAULT_VOLUME = 65

/**
 * Плеер саундтрека на двух аудио-деках: переключение треков идёт с кроссфейдом
 * (старый затухает 3 с, новый проявляется с 3-й по 5-ю секунду). Физику звука
 * ведёт requestAnimationFrame, поэтому переход можно прервать новым переключением.
 * Состояние воспроизведения живёт только в UI — в стор оно не уезжает.
 */
export function useSoundtrackPlayer(tracks: Track[], repeatMode: RepeatMode) {
  const deckARef = useRef<Deck | null>(null)
  const deckBRef = useRef<Deck | null>(null)
  const activeRef = useRef<DeckName>("a")
  const rampRef = useRef<number | null>(null)
  const tracksRef = useRef(tracks)
  const repeatRef = useRef(repeatMode)
  const currentIdRef = useRef(tracks[0]?.id ?? "")
  const playingRef = useRef(false)
  const volumeRef = useRef(DEFAULT_VOLUME)

  const [currentId, setCurrentId] = useState(tracks[0]?.id ?? "")
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(DEFAULT_VOLUME)

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
  }

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
