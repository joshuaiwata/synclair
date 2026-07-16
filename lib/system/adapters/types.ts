import type { ReactNode } from "react"

import type { Preview } from "../doc-types"

/**
 * The swappable platform seam (see `docs/foundation-model.md` §5).
 *
 * Synclair's hub UI is always Next + shadcn, but WHAT it governs — the app's
 * design system — can target a different platform. Everything platform-specific
 * lives behind this interface, so retargeting the hub (e.g. at React Native) is
 * a one-line swap of the active adapter in `./index.ts`.
 */
export interface PlatformAdapter {
  /** e.g. "web-shadcn" | "react-native" | "swiftui". */
  id: string

  /** How a `Preview` is depicted in the gallery. */
  renderPreview(preview: Preview): ReactNode

  // Future seams (see §5): exportToken(token), distribution.install(name).
}
