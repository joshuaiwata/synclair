/**
 * THE SEAM — which screens call which endpoints.
 *
 * `pages-map` knows what screens exist; `system-map` knows what the API offers.
 * Nothing joins them, so nobody can answer the questions that actually come up
 * in review: change this endpoint and what breaks? which endpoints does no
 * screen call any more? which screens call something the backend never
 * provides? Synclair is the only tool holding both halves — a code indexer has
 * the routes but no pages map.
 *
 * METHOD (borrowed, not code): extract providers and consumers SEPARATELY, then
 * match them, and publish why a match failed. The alternative — walking calls
 * from the UI and hoping — silently under-reports, and an under-reported seam
 * reads as a clean one.
 *
 * DELIBERATELY CONSERVATIVE. A missed endpoint leaves a gap someone can see; an
 * invented one puts fiction on the page and gets the whole view distrusted. So
 * only patterns that are unambiguous in the source are recognised, everything
 * else is reported as unmatched with a reason, and no path is ever guessed.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage", "out",
  "__tests__", "__mocks__", ".turbo", ".cache",
])

/** A route or call that exists only in a test is a fixture, not a contract. */
const TEST_FILE = /(^|[./])(test|spec|e2e)\.[tj]sx?$|\.(test|spec|e2e)\.[tj]sx?$|^conftest\./i

/** Third-party hosts are not this system's services. */
const EXTERNAL_HOST = /^https?:\/\/(?!localhost|127\.0\.0\.1)/i

function walk(dir, out = [], depth = 0) {
  if (depth > 12 || !existsSync(dir)) return out
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".prds") continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(p, out, depth + 1)
    } else if (/\.[tj]sx?$/.test(e.name) && !TEST_FILE.test(e.name)) {
      try {
        if (statSync(p).size < 512_000) out.push(p)
      } catch {
        /* unreadable — skip */
      }
    }
  }
  return out
}

/**
 * Normalise a path for matching: parameters lose their names, trailing slashes
 * go. `/users/:id`, `/users/${userId}` and `/users/[id]` are the same endpoint,
 * and matching them literally would report three unmatched consumers.
 */
export function normalisePath(p) {
  if (typeof p !== "string") return null
  let s = p.trim()
  if (!s) return null
  s = s.replace(/[?#].*$/, "")
  s = s.replace(/\$\{[^}]*\}/g, ":p")
  s = s.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ":p")
  s = s.replace(/\[\.\.\.[^\]]+\]/g, ":p").replace(/\[[^\]]+\]/g, ":p")
  if (!s.startsWith("/")) s = "/" + s
  s = s.replace(/\/{2,}/g, "/").replace(/\/$/, "")
  return s || "/"
}

const join = (...parts) =>
  normalisePath(
    "/" + parts.filter((p) => typeof p === "string" && p.trim()).map((p) => p.replace(/^\/|\/$/g, "")).join("/")
  )

/**
 * PROVIDERS — endpoints this system serves.
 *
 * NestJS: `@Controller('prefix')` on the class, `@Get('sub')` on the method.
 * The prefix must be stitched on before matching, or every consumer of
 * `/claim/status` fails to find `@Get('status')` inside `@Controller('claim')`.
 *
 * Next route handlers: the directory path is the route, exported verbs are the
 * methods.
 */
export function extractProviders(repoRoot, rel) {
  const abs = path.join(repoRoot, rel)
  const out = []
  for (const file of walk(abs)) {
    const relFile = path.relative(repoRoot, file).split(path.sep).join("/")
    let src
    try {
      src = readFileSync(file, "utf8")
    } catch {
      continue
    }

    if (/@Controller\s*\(/.test(src)) {
      // One file can hold several controllers; track the prefix in source order.
      const marks = [...src.matchAll(/@Controller\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g)]
      const verbs = [...src.matchAll(/@(Get|Post|Put|Patch|Delete)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g)]
      for (const v of verbs) {
        const before = marks.filter((m) => m.index < v.index).pop()
        out.push({
          method: v[1].toUpperCase(),
          path: join(before?.[1] ?? "", v[2] ?? ""),
          source: relFile,
          kind: "nest",
        })
      }
      continue
    }

    if (/(^|\/)route\.[tj]s$/.test(relFile)) {
      const routePath = "/" + relFile
        .replace(/^.*?(?:src\/)?app\//, "")
        .replace(/\/route\.[tj]s$/, "")
        .replace(/\((?:[^/]+)\)\//g, "") // Next route groups are not URL segments
      for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
        out.push({ method: m[1], path: normalisePath(routePath), source: relFile, kind: "next" })
      }
      for (const m of src.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g)) {
        out.push({ method: m[1], path: normalisePath(routePath), source: relFile, kind: "next" })
      }
    }
  }
  return out
}

/**
 * CONSUMERS — calls this system makes to an HTTP path.
 *
 * Only `fetch`/`axios` with a literal or template-literal URL: enough to be
 * certain what path is being called. A call whose URL is built by a helper is
 * NOT guessed at — it is left out, and the diagnostics say how many were skipped
 * so "no consumers" can never be confused with "we couldn't read them".
 */
export function extractConsumers(repoRoot, rel) {
  const abs = path.join(repoRoot, rel)
  const out = []
  let opaque = 0
  for (const file of walk(abs)) {
    const relFile = path.relative(repoRoot, file).split(path.sep).join("/")
    let src
    try {
      src = readFileSync(file, "utf8")
    } catch {
      continue
    }

    for (const m of src.matchAll(/\bfetch\s*\(\s*(['"`])([^'"`]*)\1/g)) {
      const raw = m[2]
      if (!raw.trim()) { opaque++; continue }
      const method = /method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)/i.exec(
        src.slice(m.index, m.index + 400)
      )?.[1]?.toUpperCase() ?? "GET"
      out.push({
        method,
        path: normalisePath(raw.replace(/^\$\{[^}]*\}/, "")),
        rawUrl: raw,
        external: EXTERNAL_HOST.test(raw),
        source: relFile,
      })
    }
    for (const m of src.matchAll(/\baxios\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]*)\2/g)) {
      out.push({
        method: m[1].toUpperCase(),
        path: normalisePath(m[3]),
        rawUrl: m[3],
        external: EXTERNAL_HOST.test(m[3]),
        source: relFile,
      })
    }
    /**
     * Client-wrapper calls: `api.post('/claim/submit')`, `http.get('/health')`.
     *
     * This is how real codebases actually call their own services — raw `fetch`
     * with a literal URL is the exception, not the rule. Scanning only `fetch`
     * found 2 calls in a repo with 80 endpoints, which would have reported 79
     * endpoints as unused when the truth was that we could not see the callers.
     *
     * The path must start with `/` so this cannot mistake `array.get('key')` or
     * a map lookup for an HTTP call.
     */
    for (const m of src.matchAll(
      /\b(?:[A-Za-z_$][\w$]*\.)+(get|post|put|patch|delete|request)\s*\(\s*(['"`])(\/[^'"`]*)\2/g
    )) {
      out.push({
        method: m[1].toUpperCase(),
        path: normalisePath(m[3]),
        rawUrl: m[3],
        external: false,
        source: relFile,
        via: "client",
      })
    }

    /**
     * Bare helper calls with a literal path: `write('/api/areas', {...})`.
     *
     * A local wrapper function is extremely common and has no dot to key on.
     * Missing it is how a real app's `/api/areas` POST/PATCH/DELETE — all three
     * plainly called through `write(...)` — got reported as unused endpoints.
     *
     * The false-positive risk is deliberately accepted: the argument must be a
     * string literal beginning with `/`, and an over-eager CONSUMER can only
     * ever produce an extra link or a `no_provider` note. An under-eager one
     * produces "this endpoint is dead", which is the output that gets live code
     * deleted. The asymmetry decides the trade.
     */
    for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(\s*(['"`])(\/[A-Za-z0-9_\-./:$?{}[\]]*)\2/g)) {
      const fn = m[1]
      if (fn === "fetch" || fn === "require" || fn === "import") continue
      const method = /method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)/i.exec(
        src.slice(m.index, m.index + 300)
      )?.[1]?.toUpperCase() ?? "GET"
      out.push({
        method,
        path: normalisePath(m[3]),
        rawUrl: m[3],
        external: false,
        source: relFile,
        via: "helper",
      })
    }

    // Calls whose URL is a bare identifier: counted, never invented.
    opaque += [...src.matchAll(/\bfetch\s*\(\s*[A-Za-z_$][\w$]*\s*[,)]/g)].length
  }
  return { consumers: out, opaque }
}

/**
 * Match consumers to providers, and explain every failure.
 *
 * Reasons, so "no link" is never a shrug:
 *   external_host — a third-party API, correctly not a service of ours
 *   no_provider   — nothing in this system serves that path (often a real bug)
 *   internal_only — the only provider is in the same app; intra-app, not a seam
 *   method_mismatch — the path exists, the verb doesn't
 */
export function matchContracts(providers, consumers) {
  const byPath = new Map()
  for (const p of providers) {
    const k = p.path
    if (!byPath.has(k)) byPath.set(k, [])
    byPath.get(k).push(p)
  }

  const links = []
  const unmatched = []

  for (const c of consumers) {
    if (c.external) {
      unmatched.push({ ...c, reason: "external_host" })
      continue
    }
    const candidates = byPath.get(c.path)
    if (!candidates?.length) {
      unmatched.push({ ...c, reason: "no_provider" })
      continue
    }
    const verbMatch = candidates.filter((p) => p.method === c.method)
    if (!verbMatch.length) {
      unmatched.push({ ...c, reason: "method_mismatch" })
      continue
    }
    /**
     * A link forms whenever the caller and the handler are DIFFERENT FILES.
     *
     * The earlier rule required them to be in different workspace apps, which
     * silently discarded the most common shape there is: a Next.js app whose
     * screens call its own `/api/*` routes. On a real single-app repo that
     * produced 42 calls and ZERO links, and then reported 35 endpoints as
     * unused — the seam we most want to show, thrown away as "internal".
     *
     * App boundaries still matter, so they are recorded as `scope` rather than
     * used as a filter: a cross-app call is a service contract, an intra-app one
     * is a screen calling its own backend. Both are the seam; only one crosses a
     * deployment boundary.
     */
    const distinct = verbMatch.filter((p) => p.source !== c.source)
    if (!distinct.length) {
      // Same file provides and calls it — not a seam, just a local helper.
      unmatched.push({ ...c, reason: "internal_only" })
      continue
    }
    const cross = distinct.filter((p) => appOf(p.source) !== appOf(c.source))
    const chosen = cross.length ? cross : distinct
    // One provider is an exact link; several is a candidate we won't pick between.
    links.push({
      method: c.method,
      path: c.path,
      consumer: c.source,
      consumerApp: appOf(c.source),
      providers: chosen.map((p) => p.source),
      providerApp: appOf(chosen[0].source),
      scope: cross.length ? "cross-app" : "intra-app",
      matchType: chosen.length === 1 ? "exact" : "candidate",
    })
  }

  const linkedPaths = new Set(links.map((l) => `${l.method} ${l.path}`))
  /** Also count intra-app calls: an endpoint its own app uses is not unused. */
  const usedPaths = new Set(consumers.map((c) => `${c.method} ${c.path}`))
  const orphans = providers.filter(
    (p) => !linkedPaths.has(`${p.method} ${p.path}`) && !usedPaths.has(`${p.method} ${p.path}`)
  )

  return { links, unmatched, orphans }
}

/**
 * Can we honestly claim an endpoint is unused?
 *
 * Only if we could actually read the calls. On a codebase that routes through a
 * client wrapper we cannot resolve, consumer extraction finds almost nothing —
 * and "79 endpoints nobody calls" would then be pure fiction, of the most
 * damaging kind: it invites someone to delete a live endpoint.
 *
 * So orphan claims are GATED on coverage, and when the gate closes the report
 * says "we couldn't tell" instead of "nothing uses these". Same rule
 * `rank:hygiene` applies to reach and `impact` applies to unmapped surfaces:
 * unknown outranks proven-zero.
 */
export function orphanConfidence({ resolved, opaque, providers, orphans }) {
  const total = resolved + opaque
  const coverage = total === 0 ? 0 : resolved / total
  const orphanRate = providers === 0 ? 0 : orphans / providers

  /**
   * Nothing to assert is not a failure to assert it. A clone with no endpoints
   * — a blank seed, a frontend-only repo — would otherwise print "unused-
   * endpoint check skipped" forever, which is exactly the kind of noise a fresh
   * clone must never see.
   */
  if (providers === 0) return { trustworthy: true, coverage, orphanRate, why: null }

  /**
   * The orphan RATE is the load-bearing signal, and it is self-calibrating.
   *
   * Counting unresolvable calls only catches the ones we noticed — a call we
   * never recognised as a call isn't in that count at all. But if almost every
   * endpoint looks unused, the conclusion to draw is about the SCANNER, not the
   * API: a real system does not ship 94% dead endpoints. On the reference
   * monorepo this is exactly what happened — 19 resolvable calls, 75 of 80
   * endpoints "unused" — and the naive coverage check passed it happily.
   */
  /**
   * 0.35, not 0.6.
   *
   * The first threshold was picked by eye and a real repo landed at 56% — just
   * under it — while every one of those "unused" endpoints was in fact called
   * through a one-line local helper the scanner didn't recognise. The number has
   * to sit well below what a plausible dead-code rate looks like, because the
   * cost of the two errors is nowhere near symmetric: a suppressed finding costs
   * a feature, a false one costs a live endpoint.
   */
  if (providers >= 10 && orphanRate > 0.35) {
    return {
      trustworthy: false,
      coverage,
      orphanRate,
      why:
        `${orphans} of ${providers} endpoints have no visible caller (${Math.round(orphanRate * 100)}%) — `
        + `a real system does not ship that many dead endpoints, so the callers are invisible to this scanner, not absent`,
    }
  }
  // Too few resolved calls to say anything about a provider surface.
  if (providers > 0 && resolved < Math.max(5, providers * 0.1)) {
    return {
      trustworthy: false,
      coverage,
      orphanRate,
      why:
        resolved === 0 && opaque === 0
          // No calls AT ALL is a different statement from "we couldn't read
          // them", and blurring the two would misdescribe every backend-only or
          // frontend-only repo in the fleet.
          ? `no call sites were found in the scanned roots — this repo may not call its own API, or its callers live elsewhere`
          : `only ${resolved} call site(s) could be resolved against ${providers} endpoint(s) — most calls go through a client this scanner can't follow`,
    }
  }
  if (coverage < 0.5) {
    return {
      trustworthy: false,
      coverage,
      orphanRate,
      why: `${opaque} of ${total} call site(s) had URLs that can't be resolved statically`,
    }
  }
  return { trustworthy: true, coverage, orphanRate, why: null }
}

/** The workspace app a file belongs to — `apps/customer-web/...` → `customer-web`. */
export function appOf(relFile) {
  const m = /^(?:apps|packages|services)\/([^/]+)\//.exec(relFile ?? "")
  return m ? m[1] : (relFile ?? "").split("/")[0] || "(root)"
}
