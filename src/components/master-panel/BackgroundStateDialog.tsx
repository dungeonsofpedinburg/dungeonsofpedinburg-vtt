import { useRef, useState } from "react"
import type { ChangeEvent } from "react"
import { Check, ImagePlus, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { isVideoSrc } from "@/lib/media"
import { fileNameWithoutExtension } from "@/lib/utils"
import type { Background, BackgroundState } from "@/data/types"

/** Что принимает проводник для состояния сцены: картинка или видео-фон. */
const STATE_FILE_ACCEPT = "image/*,video/mp4,video/webm"

type PrepareMedia = (
  file: File,
  options: { id: string; label: string }
) => Promise<{ src: string; warning?: string }>

/**
 * Диалог нового состояния сцены: название и файл (картинка или видео).
 * После подтверждения состояние сразу становится активным (это делает стор),
 * поэтому эфир и миниатюры обновляются мгновенно и через кроссфейд.
 *
 * Файл можно не выбирать: тогда вариант останется с картинкой текущего состояния —
 * так «Ночь» с тем же кадром появляется одним названием, а картинку меняют позже.
 */
export function AddBackgroundStateDialog({
  open,
  background,
  prepareMedia,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  background: Background | null
  /** Общая с библиотекой подготовка медиа: видео уезжает файлом, картинка — data-URL */
  prepareMedia: PrepareMedia
  onOpenChange: (open: boolean) => void
  onSubmit: (state: Omit<BackgroundState, "id">) => void
}) {
  const [name, setName] = useState("")
  const [src, setSrc] = useState("")
  const [isBattlemap, setIsBattlemap] = useState(background?.isBattlemap ?? false)
  const [isBusy, setIsBusy] = useState(false)
  const [problem, setProblem] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setName("")
    setSrc("")
    setProblem("")
    setIsBattlemap(background?.isBattlemap ?? false)
  }

  async function handleFilePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !background) return
    setIsBusy(true)
    setProblem("")
    try {
      const prepared = await prepareMedia(file, {
        // Имя ассета: id сцены + метка файла — так картинки состояний не
        // перетирают друг друга в папке выпуска.
        id: `${background.id}-state`,
        label: fileNameWithoutExtension(file.name),
      })
      setSrc(prepared.src)
      if (!name.trim()) setName(fileNameWithoutExtension(file.name))
      if (prepared.warning) setProblem(prepared.warning)
    } catch (thrown) {
      setProblem(
        thrown instanceof Error ? thrown.message : "Не удалось обработать файл"
      )
    } finally {
      setIsBusy(false)
    }
  }

  function submit() {
    onSubmit({ name, src, isBattlemap })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новое состояние сцены</DialogTitle>
          <DialogDescription>
            {background
              ? `${background.title} · вариант фона: «Ночь», «Пожар», «Разрушенная»`
              : "Выберите сцену"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="scene-state-name">Название состояния</Label>
            <Input
              id="scene-state-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ночь, Пожар, Разрушенная…"
            />
          </div>

          <div className="space-y-2">
            <Label>Картинка или видео состояния</Label>
            <div className="flex items-center gap-3">
              <span className="relative flex aspect-[4/3] w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
                {src ? (
                  isVideoSrc(src) ? (
                    <video
                      src={src}
                      muted
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : (
                    <img
                      src={src}
                      alt="Новое состояние"
                      className="absolute inset-0 size-full object-cover"
                    />
                  )
                ) : (
                  <ImagePlus className="size-5 text-muted-foreground" />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isBusy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                  {src ? "Другой файл" : "Выбрать файл"}
                </Button>
                {src ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="justify-start text-muted-foreground"
                    onClick={() => setSrc("")}
                  >
                    <Trash2 />
                    Убрать файл
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="scene-state-battlemap"
              checked={isBattlemap}
              onCheckedChange={(checked) => setIsBattlemap(checked === true)}
            />
            <Label htmlFor="scene-state-battlemap" className="text-xs">
              Состояние — карта местности (поверх фона рисуется сетка)
            </Label>
          </div>

          {problem ? (
            <p className="text-xs text-destructive">{problem}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {src
                ? "Файл готов: состояние станет активным сразу после добавления."
                : "Без файла вариант останется с картинкой текущего состояния."}
            </p>
          )}
          {src && !problem ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="size-3" />
              Новый кадр появится на сцене через кроссфейд
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button disabled={!background || isBusy} onClick={submit}>
            Добавить состояние
          </Button>
        </DialogFooter>

        <input
          ref={fileInputRef}
          type="file"
          accept={STATE_FILE_ACCEPT}
          className="hidden"
          onChange={handleFilePicked}
        />
      </DialogContent>
    </Dialog>
  )
}
