import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { cn } from "@/lib/utils"

/**
 * Тосты приложения (Sonner). Тема зафиксирована тёмной: приложение живёт в
 * dark-теме (`class="dark"` на `<html>`), поэтому `next-themes` здесь не нужен.
 * Позиция «сверху по центру» и `richColors` заданы по умолчанию, но их можно
 * переопределить пропсами — панель Мастера включает тосты как есть.
 */
function Toaster({
  className,
  position = "top-center",
  richColors = true,
  ...props
}: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position={position}
      richColors={richColors}
      className={cn("toaster group", className)}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
