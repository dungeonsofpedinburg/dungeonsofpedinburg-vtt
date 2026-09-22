import type { TrackInput } from "@/store/useEpisodeStore"
import type { Track } from "@/data/types"

/** Перевод трека из стора в поля формы диалога. */
export function trackToInput(track: Track): TrackInput {
  return {
    title: track.title,
    artist: track.artist,
    duration: track.duration,
    tag: track.tag,
    audioSrc: track.audioSrc,
    coverSrc: track.coverSrc,
  }
}
