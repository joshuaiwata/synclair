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

import { randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

/** Mirrors each manifest's `defaultEnabled` (lib/system/extensions-manifest.ts). */
const EXTENSION_DEFAULTS = { "collaborative-memory": true }

function extensionEnabled(hubRoot, id) {
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

/** Minimal KEY=VALUE parse of .env.local — values may themselves contain "=". */
function readEnvLocal(hubRoot) {
  const p = path.join(hubRoot, ".env.local")
  if (!existsSync(p)) return {}
  const env = {}
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return env
}

function collaborativeMemoryTools(hubRoot) {
  return {
    memories_submit_thought: {
      description:
        "Prepare and submit a Thought (a proposed change) against a project Memory (a configured PRD). " +
        "BEFORE calling: follow the `submit-thought` skill — interview the user (target memory, claim, " +
        "why it matters, evidence), format title imperative ≤80 chars and body as claim → consequence → evidence, " +
        "then read the exact final text back to the user. Set confirmed_by_user only after they approve it verbatim. " +
        "Returns the created proposal and its review URL. NOTE: the current provider is the local emulator — the " +
        "Thought lives in the dev server's memory, not on GitHub. There is deliberately no tool to approve or merge.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short title naming the decision or observation." },
          body: {
            type: "string",
            description: "What is missing or should change, why it matters, and any evidence.",
          },
          memory_path: {
            type: "string",
            description:
              'Repo-relative path of the target Memory PRD, e.g. ".prds/Billing_PRD.md". Omit for the canonical default.',
          },
          sources: {
            type: "array",
            items: { type: "string" },
            description: "Optional supporting links or document names.",
          },
          confirmed_by_user: {
            type: "boolean",
            description: "Must be true, and only after the human approved the exact content.",
          },
          server_url: {
            type: "string",
            description: "Base URL of the running Synclair dev server. Default http://localhost:4100.",
          },
        },
        required: ["title", "body", "confirmed_by_user"],
      },
      run: async (args) => {
        if (args.confirmed_by_user !== true) {
          throw new Error(
            "Refusing to submit: confirmed_by_user must be true, set only after the human approved the exact content."
          )
        }
        if (!args.title?.trim() || !args.body?.trim()) {
          throw new Error("Both title and body are required.")
        }

        const env = readEnvLocal(hubRoot)
        const projectId = env.SYNCLAIR_COLLABORATION_PROJECT_ID?.trim()
        let token
        try {
          token = JSON.parse(env.SYNCLAIR_COLLABORATION_DEV_AGENT_CREDENTIALS ?? "[]")[0]?.token
        } catch {
          token = undefined
        }
        if (!projectId || !token) {
          throw new Error(
            "Collaboration is not configured for agents on this machine: synclair/.env.local needs " +
              "SYNCLAIR_COLLABORATION_PROJECT_ID and SYNCLAIR_COLLABORATION_DEV_AGENT_CREDENTIALS " +
              "(see /synclair/settings/collaborative-memory)."
          )
        }

        const serverUrl = (args.server_url ?? "http://localhost:4100").replace(/\/+$/, "")
        const response = await fetch(`${serverUrl}/api/collaboration/ideas`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
            "idempotency-key": randomUUID(),
          },
          body: JSON.stringify({
            projectId,
            title: args.title.trim(),
            body: args.body.trim(),
            sources: args.sources,
            targetMemoryPath: args.memory_path,
            confirmedByUser: true,
          }),
        })
        const body = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(
            `Submission rejected (${response.status}): ${body?.error?.message ?? "unknown error"}`
          )
        }
        return {
          ...body,
          review_url: `${serverUrl}/synclair/ideas/${body.proposalId}`,
          note: "Local emulator: this Thought lives in the dev server's memory only — a restart clears it.",
        }
      },
    },
  }
}

/** All tools from enabled extensions, evaluated fresh per call. */
export function extensionTools(hubRoot) {
  const tools = {}
  if (extensionEnabled(hubRoot, "collaborative-memory")) {
    Object.assign(tools, collaborativeMemoryTools(hubRoot))
  }
  return tools
}
