import { cache } from "react"

import { readdir } from "node:fs/promises"
import path from "node:path"

/**
 * The NATIVE tier of the library: upstream shadcn/ui primitives vendored in
 * `components/ui/`. They are part of the project's design vocabulary and
 * surface in the Components gallery with `origin: "native"` — so designers can
 * see the full palette available by default, filtered apart from what we
 * invented. Source of truth is the FILESYSTEM (what's actually installed), not
 * a hand-maintained list; the map below only decorates known names with a
 * category and description.
 */

const UI_DIR = "components/ui"

export interface NativePrimitiveMeta {
  title: string
  description: string
  category: string
}

/** Decoration for known upstream primitives. Unknown files still surface with a generic entry. */
const NATIVE_META: Record<string, NativePrimitiveMeta> = {
  accordion: {
    title: "Accordion",
    description: "Vertically stacked disclosure sections that expand one panel of content at a time.",
    category: "disclosure",
  },
  alert: {
    title: "Alert",
    description: "Callout for important inline messages — info, success, or destructive tones.",
    category: "feedback",
  },
  "alert-dialog": {
    title: "Alert Dialog",
    description: "Modal confirmation dialog that interrupts the user for a destructive or important action.",
    category: "overlays",
  },
  avatar: {
    title: "Avatar",
    description: "User or entity image with an automatic text fallback.",
    category: "data-display",
  },
  badge: {
    title: "Badge",
    description: "Small inline label for statuses, counts, and categories.",
    category: "data-display",
  },
  breadcrumb: {
    title: "Breadcrumb",
    description: "Hierarchical path navigation with separators.",
    category: "navigation",
  },
  button: {
    title: "Button",
    description: "The action primitive — variants for default, secondary, outline, ghost, destructive, and link.",
    category: "inputs",
  },
  calendar: {
    title: "Calendar",
    description: "Date grid for picking single dates or ranges.",
    category: "inputs",
  },
  card: {
    title: "Card",
    description: "Bordered content container with header, content, and footer slots.",
    category: "layout",
  },
  checkbox: {
    title: "Checkbox",
    description: "Binary toggle input with indeterminate support.",
    category: "inputs",
  },
  command: {
    title: "Command",
    description: "Command-menu list with fuzzy filtering — the engine behind ⌘K palettes.",
    category: "navigation",
  },
  dialog: {
    title: "Dialog",
    description: "Modal window overlaid on the page, with header/footer composition.",
    category: "overlays",
  },
  "dropdown-menu": {
    title: "Dropdown Menu",
    description: "Menu of actions or options revealed by a trigger.",
    category: "overlays",
  },
  form: {
    title: "Form",
    description: "react-hook-form wiring — field, label, description, and message composition.",
    category: "inputs",
  },
  input: {
    title: "Input",
    description: "Single-line text field.",
    category: "inputs",
  },
  "input-group": {
    title: "Input Group",
    description: "Composes an input with leading/trailing addons, buttons, or text.",
    category: "inputs",
  },
  label: {
    title: "Label",
    description: "Accessible caption tied to a form control.",
    category: "inputs",
  },
  popover: {
    title: "Popover",
    description: "Floating panel anchored to a trigger, for rich non-modal content.",
    category: "overlays",
  },
  progress: {
    title: "Progress",
    description: "Determinate progress bar.",
    category: "feedback",
  },
  "radio-group": {
    title: "Radio Group",
    description: "Single-choice option set.",
    category: "inputs",
  },
  "scroll-area": {
    title: "Scroll Area",
    description: "Custom-styled scroll container with cross-browser scrollbars.",
    category: "layout",
  },
  select: {
    title: "Select",
    description: "Dropdown single-select input.",
    category: "inputs",
  },
  separator: {
    title: "Separator",
    description: "Horizontal or vertical dividing rule.",
    category: "layout",
  },
  sheet: {
    title: "Sheet",
    description: "Slide-in panel from any screen edge — the drawer primitive.",
    category: "overlays",
  },
  sidebar: {
    title: "Sidebar",
    description: "Composable app-shell sidebar with collapsing, groups, and menu items.",
    category: "navigation",
  },
  skeleton: {
    title: "Skeleton",
    description: "Loading placeholder that mirrors the shape of incoming content.",
    category: "feedback",
  },
  slider: {
    title: "Slider",
    description: "Draggable value selection along a track.",
    category: "inputs",
  },
  sonner: {
    title: "Sonner (Toast)",
    description: "Stacked toast notifications.",
    category: "feedback",
  },
  switch: {
    title: "Switch",
    description: "On/off toggle control.",
    category: "inputs",
  },
  table: {
    title: "Table",
    description: "Semantic data-table elements with consistent density and borders.",
    category: "data-display",
  },
  tabs: {
    title: "Tabs",
    description: "Switch between peer content panels.",
    category: "navigation",
  },
  textarea: {
    title: "Textarea",
    description: "Multi-line text field.",
    category: "inputs",
  },
  toggle: {
    title: "Toggle",
    description: "Pressed/unpressed two-state button.",
    category: "inputs",
  },
  tooltip: {
    title: "Tooltip",
    description: "Short hover/focus hint anchored to an element.",
    category: "overlays",
  },
}

/** "input-group" -> "Input Group" for names outside the meta map. */
function fallbackTitle(name: string): string {
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export interface NativePrimitive {
  /** Registry-style name, e.g. "button". */
  name: string
  title: string
  description: string
  category: string
  /** Repo-relative source path, e.g. "components/ui/button.tsx". */
  file: string
  /** Upstream documentation for the primitive. */
  docsUrl: string
}

/**
 * The installed upstream primitives — every `components/ui/*.tsx` file.
 * Filesystem-derived so it never drifts from what `npx shadcn add` installed.
 */
/** Request-memoised — one build per render pass (react cache). */
export const getNativePrimitives = cache(getNativePrimitivesUncached)

async function getNativePrimitivesUncached(): Promise<NativePrimitive[]> {
  let entries: string[]
  try {
    entries = await readdir(path.join(process.cwd(), UI_DIR))
  } catch {
    return []
  }
  return entries
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".docs.tsx"))
    .map((f) => f.replace(/\.tsx$/, ""))
    .sort()
    .map((name) => {
      const meta = NATIVE_META[name]
      return {
        name,
        title: meta?.title ?? fallbackTitle(name),
        description: meta?.description ?? "Upstream shadcn/ui primitive.",
        category: meta?.category ?? "primitives",
        file: `${UI_DIR}/${name}.tsx`,
        docsUrl: `https://ui.shadcn.com/docs/components/${name}`,
      }
    })
}
