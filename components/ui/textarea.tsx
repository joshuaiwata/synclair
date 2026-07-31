import * as React from "react"

import { cn } from "@/lib/utils"

// Customized from upstream (bg-transparent → bg-card): this theme tints
// --background, so transparent fields on the canvas read same-color-on-same-
// color. On white cards bg-card is visually identical to stock transparent.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full rounded-lg border border-input bg-card px-3 py-2 text-base transition-colors outline-none field-sizing-content placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
