import type { Preview } from "../doc-types"
import { getSurfaces } from "../surfaces"
import type { PlatformAdapter } from "./types"
import { webShadcnAdapter } from "./web-shadcn"

/**
 * The react-native adapter — depicts an RN surface's components in the (web)
 * hub so designers can audit them in the browser.
 *
 * Tiered on purpose (foundation-model §4a/§7):
 * - `image` / `embed` / `code` render exactly like the web adapter — a HOST
 *   app's RN components are documented entities (screenshots, Expo-web or
 *   Storybook embeds, snippets) and need ZERO extra dependencies. This is the
 *   default, and the audit path that works on any machine.
 * - `live` renders real RN nodes via react-native-web, but ONLY when a surface
 *   opts in (`liveRender: true` in `lib/system/seed/surfaces.ts`) AND
 *   `react-native-web` is installed (`npm i react-native-web`). Live previews
 *   apply to components REGISTERED IN THIS CLONE (e.g. ported through the
 *   invention gate) whose `.docs.tsx` hands back RN elements — host components
 *   never live-render (their source is never imported; foundation-model §1).
 *
 * Enabling live rendering is a per-project intake decision, not a foundation
 * default — see the existing-project-intake skill.
 */

function liveEnabled(): boolean {
  return getSurfaces().some((s) => s.platform === "react-native" && s.liveRender)
}

/** True once react-native-web is installed in this clone. */
function rnWebAvailable(): boolean {
  try {
    // Resolve without importing — previews render server-side, and a missing
    // optional dep must degrade to the code fallback, not crash the gallery.
    // The specifier is computed (not a string literal) so the bundler doesn't
    // statically try to resolve this OPTIONAL dep at build time and fail when a
    // web-only project (no react-native-web) declares a mobile surface.
    const rnWeb = ["react-native", "web"].join("-")
    require.resolve(rnWeb)
    return true
  } catch {
    return false
  }
}

export const reactNativeAdapter: PlatformAdapter = {
  id: "react-native",

  renderPreview(preview: Preview) {
    if (preview.kind !== "live") {
      // Screenshots, Expo-web/Storybook embeds, and code render identically on
      // every platform — delegate rather than duplicate.
      return webShadcnAdapter.renderPreview(preview)
    }
    if (liveEnabled() && rnWebAvailable()) {
      // react-native-web maps RN primitives (View/Text/Pressable/Image) to the
      // DOM, so a presentational RN node renders inline like any React node.
      // Components touching native modules can't — their docs should hand back
      // `image`/`embed` previews instead.
      return preview.node
    }
    return (
      <span className="text-muted-foreground font-mono text-xs">
        live RN preview off — set <code>liveRender: true</code> on the surface and{" "}
        <code>npm i react-native-web</code>
      </span>
    )
  },
}
