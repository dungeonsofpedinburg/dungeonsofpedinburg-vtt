import { useRef, useState } from "react"
import { FileAudio, ImagePlus, Plus, Trash2 } from "lucide-react"
import { categoryLabels } from "@/components/master-panel/tokenAppearance"
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
import { tokenCategories } from "@/data/content"
import { isInlineAsset } from "@/lib/asset-url"
import { prepareAudioFile } from "@/lib/audio-file"
import { characterStates } from "@/lib/character"
import { prepareImageFile } from "@/lib/image-file"
import type { CharacterInput, CharacterImagePatch } from "@/store/useEpisodeStore"
import type {
  AppearanceEffect,
  AppearanceSoundMode,
  Character,
  CharacterAppearance,
  CharacterState,
  TokenCategory,
} from "@/data/types"

function useImagePicker() {
  const [preview, setPreview] = useState("")
  const [warning, setWarning] = useState("")
  const [error, setError] = useState("")
  const [isBusy, setIsBusy] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    setIsBusy(true)
    setError("")
    setWarning("")
    try {
      const prepared = await prepareImageFile(file)
      setPreview(prepared.dataUrl)
      if (prepared.warning) setWarning(prepared.warning)
    } catch (thrown) {
      setError(
        thrown instanceof Error ? thrown.message : "Не удалось обработать файл"
      )
    } finally {
      setIsBusy(false)
    }
  }

  function reset() {
    setPreview("")
    setWarning("")
    setError("")
  }

  return { preview, warning, error, isBusy, pick, reset }
}

type ImagePickerState = ReturnType<typeof useImagePicker>

function ImagePickerField({
  id,
  label,
  picker,
  currentSrc,
}: {
  id: string
  label: string
  picker: ImagePickerState
  currentSrc?: string
}) {
  const preview = picker.preview || currentSrc

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          {preview ? (
            <img src={preview} alt="" className="size-full object-cover object-top" />
          ) : (
            <ImagePlus className="size-5 text-muted-foreground" />
          )}
        </span>
        <Input
          id={id}
          type="file"
          accept="image/*"
          disabled={picker.isBusy}
          className="cursor-pointer"
          onChange={(event) => picker.pick(event.target.files?.[0])}
        />
      </div>
      {picker.warning ? (
        <p className="text-xs text-muted-foreground">{picker.warning}</p>
      ) : null}
      {picker.error ? (
        <p className="text-xs text-destructive">{picker.error}</p>
      ) : null}
    </div>
  )
}

export function CreateCharacterDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (input: CharacterInput) => void
}) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState<TokenCategory>("hero")
  const tokenPicker = useImagePicker()
  const figurePicker = useImagePicker()

  function submit() {
    onCreate({
      name,
      role: categoryLabels[category],
      category,
      avatarSrc: tokenPicker.preview,
      fullBodyPngSrc: figurePicker.preview,
    })
    setName("")
    setCategory("hero")
    tokenPicker.reset()
    figurePicker.reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новый персонаж</DialogTitle>
          <DialogDescription>
            Инициалы подставятся из имени. Картинка для токена сразу появится на
            фишках, картинка для сцены — на проекторе.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="new-character-name">Имя</Label>
            <Input
              id="new-character-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например: Ингрид Хальс"
            />
          </div>

          <div className="space-y-2">
            <Label>Роль</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as TokenCategory)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tokenCategories.map((item) => (
                  <SelectItem key={item} value={item}>
                    {categoryLabels[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ImagePickerField
            id="new-character-token"
            label="Картинка для токена"
            picker={tokenPicker}
          />
          <ImagePickerField
            id="new-character-scene"
            label="Картинка для сцены"
            picker={figurePicker}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={
              !name.trim() || tokenPicker.isBusy || figurePicker.isBusy
            }
            onClick={submit}
          >
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Диалог нового состояния персонажа: название, токен для карты и полноростовая
 * иллюстрация для сцены. После подтверждения состояние сразу становится активным
 * (это делает стор), поэтому токен и сцена обновляются мгновенно.
 *
 * Картинки можно не выбирать: у нового варианта останутся картинки «Обычного» —
 * так «Раненый» с той же иллюстрацией создаётся одним названием.
 */
export function AddCharacterStateDialog({
  open,
  character,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  character: Character | null
  onOpenChange: (open: boolean) => void
  onSubmit: (state: Omit<CharacterState, "id">) => void
}) {
  const [name, setName] = useState("")
  const tokenPicker = useImagePicker()
  const figurePicker = useImagePicker()

  function submit() {
    onSubmit({
      name,
      avatarSrc: tokenPicker.preview,
      fullBodyPngSrc: figurePicker.preview,
    })
    setName("")
    tokenPicker.reset()
    figurePicker.reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новое состояние</DialogTitle>
          <DialogDescription>
            {character
              ? `${character.name} · вариант внешнего вида для токена и сцены`
              : "Выберите персонажа"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="character-state-name">Название состояния</Label>
            <Input
              id="character-state-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Раненый, В ярости, Без плаща…"
            />
          </div>

          <ImagePickerField
            id="character-state-avatar"
            label="Токен на карте"
            picker={tokenPicker}
            currentSrc={character?.avatarSrc}
          />
          <ImagePickerField
            id="character-state-figure"
            label="Иллюстрация для сцены (полный рост)"
            picker={figurePicker}
            currentSrc={character?.fullBodyPngSrc}
          />

          <p className="text-xs text-muted-foreground">
            Без выбранных картинок вариант останется с картинками «Обычного».
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={!character || tokenPicker.isBusy || figurePicker.isBusy}
            onClick={submit}
          >
            Добавить состояние
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RenameCharacterDialog({
  open,
  initialName,
  onOpenChange,
  onRename,
}: {
  open: boolean
  initialName: string
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => void
}) {
  const [name, setName] = useState(initialName)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Переименовать персонажа</DialogTitle>
          <DialogDescription>
            Инициалы на токене обновятся автоматически.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="rename-character-name">Имя</Label>
          <Input
            id="rename-character-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Имя персонажа"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              onRename(name)
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

export function ReplaceCharacterImageDialog({
  open,
  character,
  onOpenChange,
  onReplace,
}: {
  open: boolean
  character: Character | null
  onOpenChange: (open: boolean) => void
  onReplace: (patch: CharacterImagePatch) => void
}) {
  const avatarPicker = useImagePicker()
  const figurePicker = useImagePicker()

  function submit() {
    const patch: CharacterImagePatch = {}
    if (avatarPicker.preview) patch.avatarSrc = avatarPicker.preview
    if (figurePicker.preview) patch.fullBodyPngSrc = figurePicker.preview
    onReplace(patch)
    avatarPicker.reset()
    figurePicker.reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Заменить изображение</DialogTitle>
          <DialogDescription>
            {character ? `${character.name} · ${character.role}` : "Выберите файлы"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <ImagePickerField
            id="replace-avatar"
            label="Аватар в рельсе"
            picker={avatarPicker}
            currentSrc={character?.avatarSrc}
          />
          <ImagePickerField
            id="replace-figure"
            label="Фигура на сцене (полный рост)"
            picker={figurePicker}
            currentSrc={character?.fullBodyPngSrc}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={
              (!avatarPicker.preview && !figurePicker.preview) ||
              avatarPicker.isBusy ||
              figurePicker.isBusy
            }
            onClick={submit}
          >
            Обновить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Куда пишем настройки: персонаж целиком или конкретное состояние. */
export type CharacterAppearanceTarget = "all" | `state:${string}`

export type CharacterAppearanceResult = {
  target: CharacterAppearanceTarget
  patch: CharacterAppearance
}

/**
 * Настройки выбранной цели «как есть». Для «всех состояний» это поле самого
 * персонажа, для состояния — его собственное переопределение (может быть пустым:
 * тогда значения наследуются).
 */
function appearanceSource(
  character: Character | null,
  target: string
): CharacterAppearance | undefined {
  if (!character) return undefined
  if (target === "all") return character.appearance
  return characterStates(character).find((state) => state.id === target)
    ?.appearance
}

/**
 * Диалог звука и эффекта появления персонажа. Одна форма на два уровня:
 * настройка персонажа («Все состояния») и переопределение конкретного состояния.
 *
 * В стор уходит **только изменённое**: иначе «умолчания» формы (once/slide,
 * пустой звук) перекрыли бы настройку персонажа, и, например, унаследованный
 * звук молча отключился бы.
 */
export function CharacterAppearanceDialog({
  open,
  character,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  character: Character | null
  onOpenChange: (open: boolean) => void
  onSubmit: (result: CharacterAppearanceResult) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {character ? (
          /*
           * `key` по персонажу: форма монтируется заново на каждое открытие,
           * поэтому поля всегда начинаются с настроек выбранной цели — без
           * «синхронизирующих» эффектов и мигания состояний.
           */
          <CharacterAppearanceForm
            key={character.id}
            character={character}
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

/** Поля формы появления: звук, режим и эффект для выбранной цели. */
function CharacterAppearanceForm({
  character,
  onCancel,
  onSubmit,
}: {
  character: Character
  onCancel: () => void
  onSubmit: (result: CharacterAppearanceResult) => void
}) {
  const [target, setTarget] = useState("all")
  const [soundSrc, setSoundSrc] = useState(character.appearance?.soundSrc ?? "")
  const [soundMode, setSoundMode] = useState<AppearanceSoundMode>(
    character.appearance?.soundMode ?? "once"
  )
  const [effect, setEffect] = useState<AppearanceEffect>(
    character.appearance?.effect ?? "slide"
  )
  const [fileName, setFileName] = useState("")
  const [error, setError] = useState("")
  const [isBusy, setIsBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** Смена цели перечитывает настройки: у состояния они свои. */
  function changeTarget(value: string) {
    setTarget(value)
    const next = appearanceSource(character, value)
    setSoundSrc(next?.soundSrc ?? "")
    setSoundMode(next?.soundMode ?? "once")
    setEffect(next?.effect ?? "slide")
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
    const source = appearanceSource(character, target) ?? {}
    const trimmed = soundSrc.trim()
    const patch: CharacterAppearance = {}
    if ((source.soundSrc ?? "") !== trimmed) patch.soundSrc = trimmed
    if ((source.soundMode ?? "once") !== soundMode) patch.soundMode = soundMode
    if ((source.effect ?? "slide") !== effect) patch.effect = effect
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
        <DialogTitle>Звук и эффект появления</DialogTitle>
        <DialogDescription>
          {character.name} · что играет при выходе и как фигура появляется
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="appearance-target">Где применить</Label>
          <Select value={target} onValueChange={changeTarget}>
            <SelectTrigger id="appearance-target" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все состояния персонажа</SelectItem>
              {characterStates(character).map((state) => (
                <SelectItem key={state.id} value={state.id}>
                  Только состояние «{state.name}»
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {target === "all"
              ? "Настройка станет базовой для всех состояний персонажа."
              : "Состояние переопределяет только изменённые поля, остальное наследуется от персонажа."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="appearance-sound">Звук появления</Label>
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
                id="appearance-sound"
                value={soundSrc}
                onChange={(event) => setSoundSrc(event.target.value)}
                placeholder="/assets/episodes/<slug>/soundpad/appear.mp3"
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
              ? "При экспорте файл ляжет в папку soundpad выпуска, в JSON уедет путь"
              : "Звука нет — появление пройдёт молча"}
          </p>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="appearance-mode">Когда проигрывать</Label>
          <Select
            value={soundMode}
            onValueChange={(value) => setSoundMode(value as AppearanceSoundMode)}
          >
            <SelectTrigger id="appearance-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="once">Только при первом появлении</SelectItem>
              <SelectItem value="always">Всегда</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="appearance-effect">Эффект появления</Label>
          <Select
            value={effect}
            onValueChange={(value) => setEffect(value as AppearanceEffect)}
          >
            <SelectTrigger id="appearance-effect" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slide">Обычный выезд</SelectItem>
              <SelectItem value="sharp">Резкий выезд</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            «Резкий» — фигура выезжает с масштабом и небольшим перелётом.
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

