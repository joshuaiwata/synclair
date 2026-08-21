import { createHash, timingSafeEqual } from "node:crypto"

import { handle } from "@synclair/core/scripts/mcp-tools.mjs"

/**
 * SYNCLAIR REMOTE MCP — the HTTP transport for the hub's MCP tools.
 *
 * The stdio server (`scripts/mcp-server.mjs`) serves agents working IN a clone;
 * this route serves agents who have no clone at all — a teammate's client
 * pointed at the hosted hub gets the exact same tools, because both transports
 * import the one registry in `scripts/mcp-tools.mjs`. Nothing is answered here
 * that stdio wouldn't answer identically; freshness is whatever the deployed
 * image was built from.
 *
 * Transport: MCP streamable-HTTP in its simplest legal form — every client
 * message arrives as a POST and gets a plain JSON response (the spec lets the
 * server choose JSON over SSE). Stateless on purpose: no session ids, no
 * server-initiated stream, nothing for a restart to lose.
 *
 * Auth: bearer tokens from SYNCLAIR_MCP_TOKENS (comma-separated). The tools are
 * read-only, but the data they read is the product's design + knowledge corpus,
 * so the door still has a lock:
 *
 *   unset/empty  → 404 on every request — the endpoint simply does not exist.
 *                  A clone that never configures tokens never exposes one.
 *   configured   → `Authorization: Bearer <token>` must match one entry.
 *
 * Comparison is over sha256 digests via timingSafeEqual — same-length inputs,
 * no early exit on mismatch. Deployment note: if the whole app sits behind a
 * browser-login gate, this path needs a carve-out at the ingress — an MCP
 * client cannot complete an interactive sign-in.
 */

export const dynamic = "force-dynamic"

function configuredTokens(): string[] {
  return (process.env.SYNCLAIR_MCP_TOKENS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
}

function authorized(request: Request, tokens: string[]): boolean {
  const header = request.headers.get("authorization") ?? ""
  if (!header.toLowerCase().startsWith("bearer ")) return false
  const presented = createHash("sha256").update(header.slice(7).trim()).digest()
  // Check every token unconditionally — no early exit for a timing side-channel.
  let match = false
  for (const t of tokens) {
    const expected = createHash("sha256").update(t).digest()
    if (timingSafeEqual(presented, expected)) match = true
  }
  return match
}

export async function POST(request: Request): Promise<Response> {
  const tokens = configuredTokens()
  if (tokens.length === 0) return new Response(null, { status: 404 })
  if (!authorized(request, tokens)) {
    return new Response(null, {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    })
  }

  let message: unknown
  try {
    message = await request.json()
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: body is not JSON" },
      },
      { status: 400 }
    )
  }

  // `handle` returns null for notifications — a batch of only notifications
  // (or a single one) gets 202 Accepted with no body, per the MCP spec.
  //
  // Each item is isolated: one malformed element used to throw out of
  // Promise.all and take the whole batch down as a bodiless 500, losing the
  // valid calls beside it. A bad item now answers as a JSON-RPC error and its
  // neighbours are unaffected — matching what the stdio transport does.
  const replies = (
    await Promise.all(
      (Array.isArray(message) ? message : [message]).map(async (m) => {
        try {
          return await handle(m)
        } catch (e) {
          return {
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32603,
              message: `Internal error: ${e instanceof Error ? e.message : String(e)}`,
            },
          }
        }
      })
    )
  ).filter((r: unknown) => r !== null && r !== undefined)

  if (replies.length === 0) return new Response(null, { status: 202 })
  return Response.json(Array.isArray(message) ? replies : replies[0], {
    headers: { "Cache-Control": "no-store" },
  })
}

/**
 * No server-initiated stream — this transport is stateless JSON responses.
 * Still 404s when no tokens are configured: an unconfigured clone must not
 * reveal that this path exists at all, on any method.
 */
export function GET(): Response {
  if (configuredTokens().length === 0)
    return new Response(null, { status: 404 })
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}

/** No sessions to terminate — see the stateless note above. */
export function DELETE(): Response {
  if (configuredTokens().length === 0)
    return new Response(null, { status: 404 })
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}
