import { useRef, useState } from "react"
import { FileAudio, Plus } from "lucide-react"
import { soundpadIcons } from "@/components/master-panel/soundpadIcons"
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
import { isInlineAsset } from "@/lib/asset-url"
import { prepareAudioFile } from "@/lib/audio-file"
import { DEFAULT_SOUNDPAD_ICON, SOUNDPAD_ICON_NAMES } from "@/lib/soundpad"
import { cn, fileNameWithoutExtension } from "@/lib/utils"
import type { SoundpadSlotInput } from "@/store/useEpisodeStore"

const EMPTY_SLOT: SoundpadSlotInput = {
  title: "",
  icon: DEFAULT_SOUNDPAD_ICON,
  src: "",
}

type SoundpadSlotDialogProps = {
  open: boolean
  /** Текущий слот при редактировании (нет — добавление нового) */
  initial?: SoundpadSlotInput
  onOpenChange: (open: boolean) => void
  onSubmit: (input: SoundpadSlotInput) => void
}

/**
 * Диалог слота саундпада: название, звуковой файл и иконка из набора.
 * Файл читается в data-URL (`prepareAudioFile`) — как и треки: при экспорте
 * выпуска он ляжет файлом в `assets/soundpad/`, а в JSON уедет только путь.
 */
export function SoundpadSlotDialog({
  open,
  initial,
  onOpenChange,
  onSubmit,
}: SoundpadSlotDialogProps) {
  const [form, setForm] = useState<SoundpadSlotInput>(initial ?? EMPTY_SLOT)
  const [fileName, setFileName] = useState("")
  const [error, setError] = useState("")
  const [isBusy, setIsBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function patch(part: Partial<SoundpadSlotInput>) {
    setForm((current) => ({ ...current, ...part }))
  }

  /** Выбор файла: путь берём из data-URL, название — из метаданных MP3. */
  async function pickAudio(file: File | undefined) {
    if (!file) return
    setIsBusy(true)
    setError("")
    try {
      const prepared = await prepareAudioFile(file)
      setFileName(file.name)
      patch({
        src: prepared.dataUrl,
        // Название из метаданных подставляем, только если Мастер ещё не ввёл своё.
        ...(form.title.trim()
          ? {}
          : { title: prepared.title || fileNameWithoutExtension(file.name) }),
      })
    } catch (thrown) {
      setError(
        thrown instanceof Error ? thrown.message : "Не удалось обработать файл"
      )
    } finally {
      setIsBusy(false)
    }
  }

  // Встроенный файл (data-URL) в поле ввода не показываем: это мегабайты Base64.
  const hasInlineFile = isInlineAsset(form.src)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? "Редактировать звук" : "Новый звук саундпада"}
          </DialogTitle>
          <DialogDescription>
            Звук играет поверх музыки и не останавливает её. При экспорте выпуска
            файл ляжет в папку assets, а в JSON уедет только путь.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="sfx-title">Название</Label>
            <Input
              id="sfx-title"
              value={form.title}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="Взрыв"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sfx-src">Звуковой файл</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                {hasInlineFile ? <FileAudio /> : <Plus />}
                {isBusy ? "Читаю файл…" : "Выбрать файл"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.ogg,.wav,.m4a"
                className="hidden"
                onChange={(event) => {
                  void pickAudio(event.target.files?.[0])
                  event.target.value = ""
                }}
              />
              {hasInlineFile ? (
                <span className="truncate text-xs text-muted-foreground">
                  {fileName || "Файл загружен"}
                </span>
              ) : (
                <Input
                  id="sfx-src"
                  value={form.src}
                  onChange={(event) => patch({ src: event.target.value })}
                  placeholder="/assets/soundpad/boom.mp3"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {hasInlineFile
                ? "Файл выбран — при экспорте он выгрузится в папку assets"
                : form.src
                  ? "Путь к файлу в папке assets"
                  : "Файл не выбран: играть будет нечего"}
            </p>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>Иконка</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {SOUNDPAD_ICON_NAMES.map((name) => {
                const Icon = soundpadIcons[name]
                const isActive = form.icon === name
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    aria-label={name}
                    aria-pressed={isActive}
                    onClick={() => patch({ icon: name })}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      isActive &&
                        "border-ring bg-accent text-foreground ring-2 ring-ring/40"
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={isBusy || !form.src.trim()}
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
