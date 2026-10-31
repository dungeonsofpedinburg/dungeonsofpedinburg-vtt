import { useRef, useState } from "react"
import { FileAudio, Plus, Trash2 } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { isInlineAsset } from "@/lib/asset-url"
import { prepareAudioFile } from "@/lib/audio-file"
import { backgroundStates } from "@/lib/background"
import type {
  AppearanceSoundMode,
  Background,
  BackgroundAppearance,
} from "@/data/types"

/** Куда пишем настройки: сцена целиком или конкретное её состояние. */
export type BackgroundAppearanceTarget = "all" | `state:${string}`

export type BackgroundAppearanceResult = {
  target: BackgroundAppearanceTarget
  patch: BackgroundAppearance
}

/**
 * Настройки выбранной цели «как есть»: для «всех состояний» — поле сцены,
 * для состояния — его собственное переопределение (пустое = наследуется).
 */
function appearanceSource(
  background: Background | null,
  target: string
): BackgroundAppearance | undefined {
  if (!background) return undefined
  if (target === "all") return background.appearance
  return backgroundStates(background).find((state) => state.id === target)
    ?.appearance
}

/**
 * Диалог звука появления сцены. Как у персонажей, но без «эффекта появления»:
 * смена сцены и так играет кроссфейдом.
 */
export function BackgroundAppearanceDialog({
  open,
  background,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  background: Background | null
  onOpenChange: (open: boolean) => void
  onSubmit: (result: BackgroundAppearanceResult) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {background ? (
          /*
           * `key` по сцене: форма монтируется заново на каждое открытие, поля
           * начинаются с настроек выбранной цели — без эффектов-синхронизаторов.
           */
          <BackgroundAppearanceForm
            key={background.id}
            background={background}
            onCancel={() => onOpenChange(false)}
            onSubmit={(result) => {
              onSubmit(result)
              onOpenChange(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** Поля формы: звук и режим проигрывания для выбранной цели. */
function BackgroundAppearanceForm({
  background,
  onCancel,
  onSubmit,
}: {
  background: Background
  onCancel: () => void
  onSubmit: (result: BackgroundAppearanceResult) => void
}) {
  const [target, setTarget] = useState("all")
  const [soundSrc, setSoundSrc] = useState(background.appearance?.soundSrc ?? "")
  const [soundMode, setSoundMode] = useState<AppearanceSoundMode>(
    background.appearance?.soundMode ?? "once"
  )
  const [fileName, setFileName] = useState("")
  const [error, setError] = useState("")
  const [isBusy, setIsBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** Смена цели перечитывает настройки: у состояния они свои. */
  function changeTarget(value: string) {
    setTarget(value)
    const next = appearanceSource(background, value)
    setSoundSrc(next?.soundSrc ?? "")
    setSoundMode(next?.soundMode ?? "once")
    setFileName("")
    setError("")
  }

  async function pickAudio(file: File | undefined) {
    if (!file) return
    setIsBusy(true)
    setError("")
    try {
      const prepared = await prepareAudioFile(file)
      setFileName(file.name)
      setSoundSrc(prepared.dataUrl)
    } catch (thrown) {
      setError(
        thrown instanceof Error ? thrown.message : "Не удалось обработать файл"
      )
    } finally {
      setIsBusy(false)
    }
  }

  function submit() {
    const source = appearanceSource(background, target) ?? {}
    const trimmed = soundSrc.trim()
    const patch: BackgroundAppearance = {}
    if ((source.soundSrc ?? "") !== trimmed) patch.soundSrc = trimmed
    if ((source.soundMode ?? "once") !== soundMode) patch.soundMode = soundMode
    onSubmit({
      target: target === "all" ? "all" : `state:${target}`,
      patch,
    })
  }

  // Встроенный файл (data-URL) в поле ввода не показываем: это мегабайты Base64.
  const hasInlineFile = isInlineAsset(soundSrc)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Звук появления сцены</DialogTitle>
        <DialogDescription>
          {background.title} · что играет, когда сцена выходит в эфир
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="scene-appearance-target">Где применить</Label>
          <Select value={target} onValueChange={changeTarget}>
            <SelectTrigger id="scene-appearance-target" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все состояния сцены</SelectItem>
              {backgroundStates(background).map((state) => (
                <SelectItem key={state.id} value={state.id}>
                  Только «{state.name}»
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {target === "all"
              ? "Настройка станет базовой для всех состояний сцены."
              : "Состояние переопределяет только изменённые поля, остальное наследуется от сцены."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="scene-appearance-sound">Звук появления</Label>
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
                id="scene-appearance-sound"
                value={soundSrc}
                onChange={(event) => setSoundSrc(event.target.value)}
                placeholder="/assets/episodes/<slug>/scenes/appear.mp3"
              />
            )}
            {soundSrc ? (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Убрать звук"
                title="Убрать звук"
                onClick={() => {
                  setSoundSrc("")
                  setFileName("")
                }}
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {soundSrc
              ? "При экспорте файл ляжет в папку scenes выпуска, в JSON уедет путь"
              : "Звука нет — сцена выйдет молча"}
          </p>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="scene-appearance-mode">Когда проигрывать</Label>
          <Select
            value={soundMode}
            onValueChange={(value) => setSoundMode(value as AppearanceSoundMode)}
          >
            <SelectTrigger id="scene-appearance-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="once">Только при первом появлении</SelectItem>
              <SelectItem value="always">Всегда</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            «Первое появление» помнит каждая сцена и её состояние отдельно.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button disabled={isBusy} onClick={submit}>
          Сохранить
        </Button>
      </DialogFooter>
    </>
  )
}

