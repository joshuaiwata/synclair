/**
 * EXTENSION-CONTRIBUTED MCP TOOLS (docs/extensibility.md).
 *
 * Extensions may contribute tools to the hub's MCP server the same way they
 * contribute nav to the sidebar — and with the same gate: a tool is served
 * ONLY while its extension is enabled in `data/extensions.json` (fail-open to
 * the extension's default, mirroring lib/system/extensions.ts). State is read
 * per request, so toggling an extension in Settings applies to agents without
 * an MCP server restart.
 *
 * Rules, per the contract:
 *  - every tool name carries its extension's prefix (`memories_*`);
 *  - tools that WRITE follow the extension's own authorization design — the
 *    submit tool below requires the same explicit human confirmation the
 *    HTTP API demands, and no approve/merge tool exists at all.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

/** Mirrors each manifest's `defaultEnabled` (lib/system/extensions-manifest.ts). */
const EXTENSION_DEFAULTS = {}

export function extensionEnabled(hubRoot, id) {
  // Mirrors lib/system/extensions.ts: "on"/"off" everywhere, "local" only off
  // the hosted hub (SYNCLAIR_HOSTED=1 in the deployed image); legacy booleans
  // read as on/off.
  const hosted = process.env.SYNCLAIR_HOSTED === "1"
  try {
    const raw = JSON.parse(
      readFileSync(path.join(hubRoot, "data", "extensions.json"), "utf8")
    )
    const value = raw?.extensions?.[id]
    if (typeof value === "boolean") return value
    if (value === "on") return true
    if (value === "off") return false
    if (value === "local") return !hosted
  } catch {
    // Missing or malformed state file = defaults, same as the hub.
  }
  return EXTENSION_DEFAULTS[id] ?? true
}

/**
 * Tools contributed by enabled extensions, merged into the core registry by
 * `mcp-tools.mjs`. Empty in the foundation — an extension adds a branch here
 * (or a module this imports), guarded by `extensionEnabled(hubRoot, id)`.
 *
 * Two rules from the contract:
 *  - every tool name carries its extension's prefix (`myext_*`), so an agent
 *    can see which capability a tool came from;
 *  - a tool that WRITES follows its extension's own authorization design.
 *    Gating on "the extension is on" is not authorization.
 */
export function extensionTools(hubRoot) {
  void hubRoot
  return {}
}
