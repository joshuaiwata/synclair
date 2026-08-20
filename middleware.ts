import { NextResponse } from "next/server"

/**
 * Deliberate no-op. In embedded (co-located) mode `turbopack.root` points at
 * the HOST repo (Path A live imports need the ancestor root), and Next then
 * discovers a middleware.ts at that root — the HOST'S middleware — and
 * compiles it into the hub: auth guards meant for the product wrap the hub's
 * routes, and any host-only dependency kills the build. (Found intaking an
 * open-source host whose root middleware imports its auth stack; this repo's
 * host has no root middleware, which is the only reason it never bit here.)
 * Shipping our own middleware pins Next to THIS file. The matcher matches
 * nothing, so there is no runtime cost.
 */
export function middleware() {
  return NextResponse.next()
}

export const config = {
  matcher: ["/__synclair-middleware-noop-never-matches__"],
}
