import { SURFACES } from "./seed/surfaces"
import { project } from "./seed/project"

/**
 * SURFACES — the project's distinct app frontends (Brain mechanism; the list
 * itself is seed, `lib/system/seed/surfaces.ts`).
 *
 * A Surface is one deployable frontend: "the responsive web app", "the React
 * Native companion app". Most projects have exactly one, and declare NOTHING —
 * `getSurfaces()` then returns a single implicit surface and `isMultiSurface()`
 * is false, which every piece of multi-surface UI gates on. Multi-frontend
 * projects (monorepo or sibling host repos) declare one entry per frontend;
 * component catalogs, system-map areas, and knowledge sources may then carry a
 * surface id, and the library shows one isolated view per surface.
 *
 * See docs/foundation-model.md § "Surfaces — coexisting platforms".
 */

export type SurfacePlatform = "web" | "react-native" | "swiftui" | "android"

export interface Surface {
  /** Stable id used in data files, URLs (`?surface=`), and screenshot dirs — e.g. "web", "mobile". */
  id: string
  /** Human label — "Web app", "Companion app". */
  label: string
  platform: SurfacePlatform
  /**
   * Host root for this surface, relative to THIS repo (existing-project mode).
   * Monorepo workspace: "../acme/apps/mobile"; sibling repo: "../acme-mobile".
   * Omit in new-project mode (the surface lives in this clone).
   */
  root?: string
  /** One-liner stack, e.g. "Next.js 15", "Expo SDK 52". */
  framework?: string
  /**
   * Enable live in-browser rendering for this surface's REGISTERED components
   * (react-native adapter via react-native-web). Off by default — a per-project
   * intake decision. Host (external) components never live-render regardless.
   */
  liveRender?: boolean
  /**
   * SELF-CONTAINED surface: it does NOT consume the shared package(s), so shared
   * items must NOT bleed into its scoped library (see `inheritsShared`). Default
   * (undefined/false) keeps the normal monorepo assumption — a platform-matched
   * surface inherits the shared design system. Set true when a surface ships its
   * OWN component set and is deliberately decoupled from `packages/ui` (e.g. a
   * prototype kept isolated pending a design-review / extraction gate).
   */
  standalone?: boolean
}

/** The single implicit surface every project has when the seed declares none. */
export const DEFAULT_SURFACE_ID = "app"

/**
 * Reserved surface id for monorepo code consumed by SEVERAL frontends
 * (e.g. packages/ui). A membership value on catalog items/hosts — never a
 * declared Surface. Mirrors the system map's "shared" tag. Shared items show
 * inside every scoped surface view (badged), and as their own root in the
 * library tree.
 */
export const SHARED_SURFACE_ID = "shared"

const IMPLICIT: Surface = { id: DEFAULT_SURFACE_ID, label: project.name, platform: "web" }

/** All declared surfaces; a single implicit web surface when the seed is empty. */
export function getSurfaces(): Surface[] {
  return SURFACES.length > 0 ? SURFACES : [IMPLICIT]
}

/** The one gate all multi-surface UI checks — false = render today's single-app UI. */
export function isMultiSurface(): boolean {
  return SURFACES.length > 1
}

export function getSurface(id: string | undefined): Surface | undefined {
  if (!id) return undefined
  return getSurfaces().find((s) => s.id === id)
}

/** Human label for a surface id; falls back to the id itself for unknown ids. */
export function surfaceLabel(id: string | undefined): string {
  if (!id) return getSurfaces()[0].label
  if (id === SHARED_SURFACE_ID) return "Shared"
  return getSurface(id)?.label ?? id
}

/** The id items default to when they carry no surface field. */
export function defaultSurfaceId(): string {
  return getSurfaces()[0].id
}

/**
 * Platform of the Shared packages (e.g. `packages/ui`). The shared design
 * system is web today, so only web surfaces inherit it — a React Native surface
 * can't consume web components and shows only its own items. Centralized here:
 * one edit if Shared ever ships a native package (or make it per-item).
 */
export const SHARED_PLATFORM: SurfacePlatform = "web"

/**
 * Whether a surface inherits the Shared packages. Shared items show inside a
 * scoped surface (badged) only when the platforms match — so Mobile (RN) isn't
 * shown the web design system.
 */
export function inheritsShared(surfaceId: string | undefined): boolean {
  const s = getSurface(surfaceId)
  // A standalone surface ships its own components and does not consume the
  // shared package — shared items must not bleed into its scoped library.
  return !!s && s.platform === SHARED_PLATFORM && !s.standalone
}

/** Short badge text per platform, for cards and search sublabels. */
export const PLATFORM_BADGE: Record<SurfacePlatform, string> = {
  web: "Web",
  "react-native": "RN",
  swiftui: "SwiftUI",
  android: "Android",
}
