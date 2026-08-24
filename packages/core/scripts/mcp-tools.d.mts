/**
 * Declarations for the MCP tool surface the hub app imports
 * (`@synclair/core/scripts/mcp-tools.mjs`). In the vendored workspace the
 * symlinked .mjs typechecked as in-project JS; a registry install lives in
 * node_modules, where TypeScript requires a declaration file. This types
 * exactly the consumed surface — the implementation stays plain JS.
 */

export interface McpToolDefinition {
  description: string
  inputSchema?: Record<string, unknown>
  run: (args: Record<string, unknown>) => unknown | Promise<unknown>
  [key: string]: unknown
}

export interface McpToolListEntry {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
}

export interface McpToolResult {
  isError?: boolean
  content: { type: "text"; text: string }[]
}

export declare const HUB_ROOT: string
export declare const SERVER_INFO: { name: string; version: string }
export declare const TOOLS: Record<string, McpToolDefinition>
export declare const allTools: () => Record<string, McpToolDefinition>
export declare const toolList: () => McpToolListEntry[]
export declare function callTool(name: string, args?: unknown): Promise<McpToolResult>
/** JSON-RPC 2.0 entry point: one request object in, one response object out. */
export declare function handle(msg: unknown): Promise<Record<string, unknown>>
