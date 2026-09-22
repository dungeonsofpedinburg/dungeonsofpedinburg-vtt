import { useState } from "react"
import { Music } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { prepareAudioFile } from "@/lib/audio-file"
import type { TrackInput } from "@/store/useEpisodeStore"

const EMPTY_TRACK: TrackInput = {
  title: "",
  artist: "",
  duration: "",
  tag: "",
  audioSrc: "",
  coverSrc: "",
}

type TrackDialogProps = {
  open: boolean
  /** Текущее содержимое трека: пока файл не заменён, поля берём отсюда */
  initial?: TrackInput
  onOpenChange: (open: boolean) => void
  onSubmit: (input: TrackInput) => void
}

/**
 * Диалог редактирования трека: меняются только тег и аудиофайл.
 * Название, исполнитель и длительность подставляются автоматически —
 * из метаданных выбранного MP3 или из уже сохранённых значений.
 */
export function TrackDialog({
  open,
  initial,
  onOpenChange,
  onSubmit,
}: TrackDialogProps) {
  const [form, setForm] = useState<TrackInput>(initial ?? EMPTY_TRACK)
  const [fileName, setFileName] = useState("")
  const [warning, setWarning] = useState("")
  const [error, setError] = useState("")
  const [isBusy, setIsBusy] = useState(false)

  function patch(part: Partial<TrackInput>) {
    setForm((current) => ({ ...current, ...part }))
  }

  async function pickAudio(file: File | undefined) {
    if (!file) return
    setIsBusy(true)
    setError("")
    setWarning("")
    try {
      const prepared = await prepareAudioFile(file)
      setFileName(file.name)
      if (prepared.warning) setWarning(prepared.warning)
      // Название, исполнитель, длительность и обложка — из метаданных файла.
      patch({
        audioSrc: prepared.dataUrl,
        duration: prepared.duration,
        title: prepared.title,
        artist: prepared.artist,
        coverSrc: prepared.coverSrc,
      })
    } catch (thrown) {
      setError(
        thrown instanceof Error ? thrown.message : "Не удалось обработать файл"
      )
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать трек</DialogTitle>
          <DialogDescription>
            Меняются только тег и аудиофайл. Название, исполнитель и длительность
            подставляются из метаданных выбранного MP3.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="track-title">Название</Label>
              <Input
                id="track-title"
                value={form.title}
                readOnly
                disabled
                placeholder="из метаданных MP3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="track-artist">Исполнитель</Label>
              <Input
                id="track-artist"
                value={form.artist}
                readOnly
                disabled
                placeholder="из метаданных MP3"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="track-duration">Длительность</Label>
              <Input
                id="track-duration"
                value={form.duration}
                readOnly
                disabled
                placeholder="0:00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="track-tag">Тег</Label>
              <Input
                id="track-tag"
                value={form.tag}
                onChange={(event) => patch({ tag: event.target.value })}
                placeholder="Атмосфера"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="track-audio">Аудиофайл</Label>
            <div className="flex items-center gap-3">
              <span
                title="Обложка берётся из метаданных MP3"
                className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground"
              >
                {form.coverSrc ? (
                  <img
                    src={form.coverSrc}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <Music className="size-5" />
                )}
              </span>
              <Input
                id="track-audio"
                type="file"
                accept=".mp3,audio/mpeg"
                disabled={isBusy}
                className="flex-1 cursor-pointer"
                onChange={(event) => pickAudio(event.target.files?.[0])}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {fileName
                ? `Новый файл: ${fileName}`
                : form.audioSrc
                  ? "Файл уже загружен — можно оставить прежний"
                  : "Файл не выбран"}
            </p>
            {warning ? (
              <p className="text-xs text-muted-foreground">{warning}</p>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={isBusy}
            onClick={() => {
              onSubmit(form)
              onOpenChange(false)
            }}
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
