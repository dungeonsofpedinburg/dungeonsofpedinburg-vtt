import { useState } from "react"
import { ImagePlus } from "lucide-react"
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
import { prepareImageFile } from "@/lib/image-file"
import type { CharacterInput, CharacterImagePatch } from "@/store/useEpisodeStore"
import type { Character, TokenCategory } from "@/data/types"

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
