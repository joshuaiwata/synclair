import type { Preview } from "../doc-types"
import { getSurface, type SurfacePlatform } from "../surfaces"
import { reactNativeAdapter } from "./react-native"
import type { PlatformAdapter } from "./types"
import { webShadcnAdapter } from "./web-shadcn"

/**
 * Platform adapters, keyed by surface platform (see `docs/foundation-model.md`
 * §5 and `lib/system/surfaces.ts`).
 *
 * Multi-surface projects have adapters COEXISTING — a web `button` and an RN
 * `button` each depicted by their own adapter — so resolution is per item
 * (`adapterFor(item.surface)`), not a global swap. Single-surface projects
 * resolve to `web-shadcn` everywhere, exactly the old singleton behavior.
 */
const fallbackAdapter: PlatformAdapter = {
  // Platforms without live rendering in the hub (yet): screenshots/embeds/code.
  id: "static",
  renderPreview(preview: Preview) {
    return preview.kind === "live" ? null : webShadcnAdapter.renderPreview(preview)
  },
}

const ADAPTERS: Record<SurfacePlatform, PlatformAdapter> = {
  web: webShadcnAdapter,
  "react-native": reactNativeAdapter,
  swiftui: fallbackAdapter,
  android: fallbackAdapter,
}

/**
 * Resolve the adapter for an item's surface. Unknown/absent surface (every
 * single-surface project) → `web-shadcn`, today's behavior.
 */
export function adapterFor(surfaceId?: string): PlatformAdapter {
  const platform = getSurface(surfaceId)?.platform
  return platform ? ADAPTERS[platform] : webShadcnAdapter
}

export type { PlatformAdapter } from "./types"
