import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import type { RegistryComponent } from "./components"

/**
 * Where a catalog item is actually USED, derived from the import graph — the
 * "is this part of our build?" signal behind the library's usage filter.
 *
 * A file "uses" an item when it imports the item's source, directly or
 * transitively through other components (a view that renders `StatCard` is
 * using `card` too). Usage is split by origin:
 * - product  — non-hub app code (files under `app/` outside `app/synclair/`).
 *   Mostly relevant to co-located product code; in a companion clone the
 *   product's real usage comes from the host catalog (`data/external-catalog.json`).
 * - Synclair — its own UI (`app/synclair/`).
 *
 * Colocated `*.docs.tsx` files are excluded — documenting a component in the
 * library is not using it in a design.
 */

export interface ItemUsage {
  /** Product-app files that use the item (directly or transitively). */
  productFiles: string[]
  /** Synclair's own files that use it. */
  hubFiles: string[]
  /** Catalog items whose own source imports it directly. */
  usedByItems: string[]
  /** True when the item is reachable from non-hub app code — the filter's "in use". */
  inProduct: boolean
}

const SCAN_DIRS = ["app", "components"]
const IMPORT_RE = /from\s+["']@\/components\/([^"']+)["']/g

const HUB_PREFIX = `app${path.sep}synclair${path.sep}`

function isProductFile(file: string): boolean {
  return file.startsWith(`app${path.sep}`) && !file.startsWith(HUB_PREFIX)
}

function isHubFile(file: string): boolean {
  return file.startsWith(HUB_PREFIX)
}

/** Recursively collect repo-relative .ts/.tsx source files, skipping docs modules. */
async function collectFiles(root: string, dir: string, out: string[]): Promise<void> {
  let entries
  try {
    entries = await readdir(path.join(root, dir), { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue
      await collectFiles(root, rel, out)
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".docs.tsx")) {
      out.push(rel)
    }
  }
}

/**
 * Compute usage for every catalog item in one pass over the source tree.
 * Returned map is keyed by item name; items nobody imports get empty usage.
 */
export async function getUsageMap(
  catalog: RegistryComponent[]
): Promise<Map<string, ItemUsage>> {
  const root = process.cwd()
  const files: string[] = []
  for (const dir of SCAN_DIRS) await collectFiles(root, dir, files)
  const fileSet = new Set(files)

  // file -> files that import it (reverse edges of the import graph)
  const importers = new Map<string, Set<string>>()
  await Promise.all(
    files.map(async (file) => {
      let src: string
      try {
        src = await readFile(path.join(root, file), "utf8")
      } catch {
        return
      }
      for (const m of src.matchAll(IMPORT_RE)) {
        const target = path.join("components", ...m[1].split("/")) + ".tsx"
        if (!fileSet.has(target)) continue
        let set = importers.get(target)
        if (!set) importers.set(target, (set = new Set()))
        set.add(file)
      }
    })
  )

  // External (host-app) items are outside this repo's import graph entirely —
  // their `files` are HOST-relative paths that could collide with local ones,
  // fabricating usage. They get no usage entry (host usage is cataloged data).
  const localItems = catalog.filter((c) => c.origin !== "external")

  // item source file -> owning item, for the "used by" chips
  const itemByFile = new Map<string, string>()
  for (const item of localItems) {
    for (const f of item.files) {
      const normalized = f.split("/").join(path.sep)
      if (!itemByFile.has(normalized)) itemByFile.set(normalized, item.name)
    }
  }

  const usage = new Map<string, ItemUsage>()
  for (const item of localItems) {
    const ownFiles = new Set(item.files.map((f) => f.split("/").join(path.sep)))
    const product = new Set<string>()
    const hub = new Set<string>()
    const usedByItems = new Set<string>()

    // A template's own source is an app route — it is part of the build itself.
    for (const f of ownFiles) if (isProductFile(f)) product.add(f)

    // Reverse BFS: everything that (transitively) imports this item's files.
    const queue = [...ownFiles]
    const visited = new Set(queue)
    while (queue.length > 0) {
      const current = queue.pop()!
      const isOwn = ownFiles.has(current)
      for (const importer of importers.get(current) ?? []) {
        // Direct importers that are themselves catalog items -> "used by" chips.
        if (isOwn) {
          const owner = itemByFile.get(importer)
          if (owner && owner !== item.name) usedByItems.add(owner)
        }
        if (visited.has(importer)) continue
        visited.add(importer)
        if (isProductFile(importer)) product.add(importer)
        else if (isHubFile(importer)) hub.add(importer)
        queue.push(importer)
      }
    }

    const productFiles = [...product].map((f) => f.split(path.sep).join("/")).sort()
    const hubFiles = [...hub].map((f) => f.split(path.sep).join("/")).sort()
    usage.set(item.name, {
      productFiles,
      hubFiles,
      usedByItems: [...usedByItems].sort(),
      inProduct: productFiles.length > 0,
    })
  }
  return usage
}

/** "app/(marketing)/quotes/page.tsx" -> "/quotes"; non-page files pass through as paths. */
export function routeLabel(file: string): string {
  if (!file.startsWith("app/") || !file.endsWith("/page.tsx")) return file
  const route = file
    .slice("app".length, -"/page.tsx".length)
    .split("/")
    .filter((seg) => seg && !(seg.startsWith("(") && seg.endsWith(")")))
    .join("/")
  return `/${route}`.replace(/\/+/g, "/")
}
