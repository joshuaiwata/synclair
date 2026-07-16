import type { ReactNode } from "react"

import { synclair } from "./routes"

/**
 * How a component or usage example is DEPICTED in the gallery.
 *
 * This is the platform seam (see `docs/foundation-model.md` §4a). The active
 * platform adapter turns a `Preview` into what the gallery renders:
 * - `live`  — a real node rendered inline. The default for the web-shadcn
 *             adapter, and reachable on React Native via react-native-web for
 *             presentational components.
 * - `image` — a screenshot of RENDERED CODE (a host component, an RN screen),
 *             for components that can't run in the browser (e.g. RN components
 *             that touch native modules). Never a Figma export — designs stay
 *             canonical in Figma and are linked, not copied (AGENTS.md rules);
 *             an exported PNG goes stale invisibly. Wireframes are built live
 *             from the wireframe-kit primitives, not images.
 * - `embed` — a Storybook / Expo Snack / device-preview iframe.
 * - `code`  — snippet only, no visual.
 *
 * Authors use the `live()` shorthand for the common case: `preview: live(<Foo/>)`.
 */
export type Preview =
  | { kind: "live"; node: ReactNode }
  | { kind: "image"; src: string; alt?: string }
  | { kind: "embed"; url: string; title?: string; height?: number }
  | { kind: "code" }

/** Ergonomic shorthand for a live preview: `preview: live(<Foo/>)`. */
export const live = (node: ReactNode): Preview => ({ kind: "live", node })

/**
 * REAL render of a self-referential block via its standalone preview scene:
 * `scene("app-sidebar")` embeds `/synclair/preview/app-sidebar` — a chrome-free
 * route rendering the block's actual composition with real data (registered in
 * `components/library/preview-scenes.tsx`). This is how blocks that can't
 * mount twice inside the hub chrome (the app shell, the library shell, the doc
 * view itself) still render for real instead of degrading to a wireframe.
 * Bonus: inside the ViewportFrame the iframe viewport IS the device width, so
 * `md:`/`lg:` media queries genuinely fire. Register the scene in the same
 * change that calls scene() — check:previews verifies the pairing.
 */
export const scene = (name: string, opts?: { title?: string; height?: number }): Preview => ({
  kind: "embed",
  url: synclair(`/preview/${name}`),
  title: opts?.title ?? `${name} — live preview`,
  height: opts?.height,
})

/**
 * REAL render of a TEMPLATE via the running route itself: `route("/orders")`
 * embeds the actual page — chrome, data, providers and all — in an iframe, so
 * the doc never has to mount a full screen inside itself. This is the canonical
 * Example for templates (a template's registered source IS a route, so one
 * always exists): the view renders exactly as shipped, and inside the
 * ViewportFrame the iframe viewport IS the device width, so `md:`/`lg:` media
 * queries genuinely fire. Pass a CONCRETE path — for dynamic routes, a real
 * instantiation (`route("/orders/1042")`), never the `[param]` pattern.
 * Hub routes go through the `synclair()` helper: `route(synclair("/components"))`.
 * check:previews verifies the path resolves to a route in the app tree.
 */
export const route = (path: string, opts?: { title?: string; height?: number }): Preview => ({
  kind: "embed",
  url: path,
  title: opts?.title ?? `${path} — live route`,
  height: opts?.height,
})

/**
 * The shape every colocated `<name>.docs.tsx` default-exports. Authored next to
 * the component in the same change that creates or modifies it, and rendered
 * generically by the tier's `/[name]` page via the active platform adapter.
 * Registered in `lib/system/docs.ts`.
 */
export interface DocExample {
  title: string
  description?: string
  /** Optional source snippet shown under the preview. */
  code?: string
  /** How this example is depicted — usually `live(<Foo/>)`. */
  preview: Preview
  /**
   * Whether this example renders inside the device-width switcher
   * (mobile / tablet / desktop). Defaults by tier — blocks and templates get
   * the switcher, components don't. Set explicitly to override either way.
   */
  viewports?: boolean
}

export interface DocProp {
  name: string
  type: string
  default?: string
  description?: string
}

export interface DocState {
  /** e.g. "Empty", "Loading", "Error". */
  name: string
  description?: string
  /** How this state is depicted — usually `live(<Foo/>)`. */
  preview: Preview
}

/** A labeled region of a block/template's anatomy wireframe. */
export interface DocRegion {
  /** e.g. "Letterhead", "Filter rail", "Primary CTA". */
  name: string
  /** What lives there and why — one sentence. */
  purpose: string
}

/**
 * Structural anatomy: named regions and what each is for, optionally headed by
 * a skeleton wireframe (built LIVE from the wireframe-kit primitives — never a
 * Figma image export). The REAL render always leads the page (Examples come
 * first); anatomy is the labeled map under it. Blocks usually need only
 * `regions` — reach for a wireframe when structure is genuinely non-obvious.
 * Never a block's only visual: Examples must render the real thing (live or
 * scene) — check:previews enforces it.
 */
export interface DocAnatomy {
  /** Optional wireframe: `live(<built from wireframe-kit primitives/>)`. */
  preview?: Preview
  description?: string
  regions?: DocRegion[]
}

/**
 * One interaction row: what the user does, what happens, where it lands.
 * Data, not prose — so engineers scan it and agents can reason over it.
 */
export interface DocInteraction {
  /** e.g. "Click a row", "⌘K", "Drag a card to another column". */
  trigger: string
  /** What the UI does in response. */
  behavior: string
  /** End state / destination, when it isn't obvious from the behavior. */
  result?: string
  /** Keyboard path for the same interaction, when it differs from the trigger. */
  keyboard?: string
}

/** The three canonical doc viewports — same vocabulary as the ViewportFrame. */
export type DocViewport = "mobile" | "tablet" | "desktop"

/** Per-viewport behavior: how the layout adapts at each canonical width. */
export interface DocResponsiveRule {
  viewport: DocViewport
  /** What changes at this width — collapses, reflows, hides, switches. */
  behavior: string
}

export interface ComponentDoc {
  /** Live, labelled usage examples — at minimum the default variants. */
  examples: DocExample[]
  /** Props / API table. */
  props?: DocProp[]
  /** Data states — expected for blocks and templates (empty / loading / error). */
  states?: DocState[]
  /** Markdown: intended behavior, edge cases, and deliberate Figma deviations. */
  notes?: string
  /**
   * Markdown: the JOB this piece does — why it exists, who it serves, when to
   * reach for it (and when not to). Written for stakeholders and agents, not
   * just engineers. Required for stable blocks and templates.
   */
  intent?: string
  /** Skeleton wireframe + labeled regions. Required for stable templates. */
  anatomy?: DocAnatomy
  /** Interaction table. Required for stable blocks and templates. */
  interactions?: DocInteraction[]
  /** Responsive behavior table. Required for stable blocks and templates. */
  responsive?: DocResponsiveRule[]
}
