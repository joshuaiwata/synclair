import { EmbedFrame } from "@/components/embed-frame"

import type { Preview } from "../doc-types"
import type { PlatformAdapter } from "./types"

/**
 * The default Synclair adapter. The hub and the app share a web/shadcn/Tailwind
 * stack, so `live` previews render inline as real React nodes. `image` / `embed`
 * are supported too, so a doc can fall back to a screenshot or Storybook frame
 * for anything not worth rendering live.
 */
export const webShadcnAdapter: PlatformAdapter = {
  id: "web-shadcn",

  renderPreview(preview: Preview) {
    switch (preview.kind) {
      case "live":
        return preview.node
      case "image":
        return (
          // eslint-disable-next-line @next/next/no-img-element -- doc thumbnails, not app content
          <img
            src={preview.src}
            alt={preview.alt ?? ""}
            className="max-h-full max-w-full object-contain"
          />
        )
      case "embed":
        // Zoom-to-fit iframe at the active viewport's LOGICAL width — a naive
        // width-constrained iframe would put responsive blocks into their
        // mobile layout inside the doc column.
        return (
          <EmbedFrame
            url={preview.url}
            title={preview.title}
            height={preview.height}
          />
        )
      case "code":
        return null
    }
  },
}
