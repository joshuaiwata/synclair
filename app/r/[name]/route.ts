import { readFile } from "node:fs/promises"
import path from "node:path"

import registry from "@/registry.json"

/**
 * Per-item registry endpoints — `/r/<name>.json` in the shadcn registry-item
 * schema. This is what lets external tools consume OUR components: the shadcn
 * CLI (`npx shadcn add @synclair/<name>`, via the `registries` entry in
 * components.json), the shadcn MCP server, and "Open in v0".
 *
 * Served dynamically from registry.json + the live source files, so the
 * endpoint can never drift from the repo (the static alternative,
 * `npx shadcn build` → public/r/, would need regenerating on every change).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name: raw } = await params
  const name = raw.replace(/\.json$/, "")
  const item = registry.items.find((i) => i.name === name)
  if (!item) {
    return Response.json(
      { error: `No registry item named "${name}". See registry.json for the index.` },
      { status: 404 }
    )
  }

  // Containment: registry.json is repo data, and this is the one
  // unauthenticated file-reader — a crafted `path` must not escape the repo
  // (same idiom as file-actions.ts / doc-actions.ts).
  const root = process.cwd()
  const files = await Promise.all(
    item.files.map(async (f) => {
      const resolved = path.resolve(root, f.path)
      const rel = path.relative(root, resolved)
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`Registry entry "${item.name}" points outside the repo: ${f.path}`)
      }
      return { ...f, content: await readFile(resolved, "utf8") }
    })
  ).catch(() => null)
  if (!files) {
    return Response.json(
      { error: `Registry item "${name}" has an unreadable or out-of-repo file path.` },
      { status: 500 }
    )
  }

  return Response.json({
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    ...item,
    files,
  })
}
