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

  const files = await Promise.all(
    item.files.map(async (f) => ({
      ...f,
      content: await readFile(path.join(process.cwd(), f.path), "utf8"),
    }))
  )

  return Response.json({
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    ...item,
    files,
  })
}
