export { cn } from "cn"

/** «Мост Мясников.mp3» → «Мост Мясников» — запасное название трека и сцены. */
export function fileNameWithoutExtension(name: string) {
  return name.replace(/\.[^.]+$/, "").trim() || name
}
