import { TOOLS, toolList } from "@synclair/core/scripts/mcp-tools.mjs"

import type { CapabilityLayer } from "@/lib/system/capability-categories"
import {
  mcpServers as connectedServices,
  type Status,
} from "@/lib/synclair-data"

/**
 * The AI Setup MCP tab's data — every server an agent in this repo can reach,
 * on the same Origin axis skills and agents use: the hub's OWN server
 * (foundation — it ships with Synclair, stdio locally and /api/mcp hosted)
 * versus the project's connected services (curated in lib/synclair-data.ts).
 *
 * The synclair server's tool list is read LIVE from the shared registry
 * (scripts/mcp-tools.mjs) — the same table both transports serve — so this
 * page can never disagree with what an agent actually sees. Extension-
 * contributed tools are the ones beyond the core TOOLS table; their state is
 * read per call, so a Settings toggle shows here immediately.
 */

export interface McpTool {
  name: string
  description: string
  /** True when contributed by an enabled extension rather than the core set. */
  fromExtension: boolean
}

export interface McpServerEntry {
  name: string
  layer: CapabilityLayer
  status: Status
  statusLabel: string
  role: string
  /** Live tool list — present only for servers whose registry we can read. */
  tools?: McpTool[]
}

export function getMcpServers(): McpServerEntry[] {
  const core = new Set(Object.keys(TOOLS))
  const tools: McpTool[] = toolList().map((tool) => ({
    name: tool.name,
    description: tool.description,
    fromExtension: !core.has(tool.name),
  }))

  return [
    {
      name: "synclair",
      layer: "foundation",
      status: "success",
      statusLabel: "Serving",
      role:
        "The hub's own tools — the agent-facing view of everything on this site. Local agents " +
        "reach it over stdio (registered in .mcp.json); agents without a clone use the hosted " +
        "/api/mcp endpoint. One registry serves both.",
      tools,
    },
    ...connectedServices.map((service) => ({
      name: service.name,
      layer: "project" as CapabilityLayer,
      status: service.status,
      statusLabel: service.statusLabel,
      role: service.role,
    })),
  ]
}
