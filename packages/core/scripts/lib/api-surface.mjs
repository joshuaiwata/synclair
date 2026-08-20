/**
 * ONE derivation of a repo's API surface, shared by everything that needs it.
 *
 * There were already three copies of the host-scan segment list in this
 * codebase, and they drifted — a documented hazard in this repo's own memory.
 * The endpoint derivation was on its way to the same place: `scan-system.mjs`
 * had it, the CI gate needed it, and a third copy would have meant a rule
 * tightened in one place and silently not in the others. So it lives here, and
 * both callers import it.
 *
 * Three conventions are recognised, and nothing else is guessed at:
 *
 *   NestJS HTTP   `@Controller('base')` + `@Get('sub')` on each handler
 *   NestJS RPC    `@MessagePattern(Consts.NAME)` — resolved to its wire literal
 *   Next router   exported HTTP verbs in a `route.ts`
 */

const HTTP = ["Get", "Post", "Put", "Patch", "Delete", "Options", "Head"]

/**
 * Wire-name lookup built from the shared pattern constants
 * (`export const FilePatterns = { FILE_UPLOAD: 'file.upload', … }`).
 *
 * Both `patterns.ts` and `<domain>-patterns.ts` occur; anchoring on the hyphen
 * alone silently misses the unprefixed one, which does not fail loudly — it
 * degrades every handler importing it to an unresolved symbol.
 *
 * Keyed both as `Object.MEMBER` and bare `MEMBER`: a handler may import the
 * object or destructure it, and the bare key is unambiguous in practice because
 * these constants are declared once, in one shared package, precisely so two
 * services cannot disagree about a wire name.
 */
export function patternConstants(files, read) {
  const table = new Map()
  const isPatternFile = (f) =>
    /(^|[/-])patterns\.ts$/.test(f) && !/\.(test|spec)\.ts$/.test(f)
  for (const f of files.filter(isPatternFile)) {
    const src = read(f)
    if (!src) continue
    const objRe = /export\s+const\s+(\w+)\s*=\s*\{([\s\S]*?)\n\}/g
    let obj
    while ((obj = objRe.exec(src)) !== null) {
      const memberRe = /(\w+)\s*:\s*['"`]([^'"`]+)['"`]/g
      let mem
      while ((mem = memberRe.exec(obj[2])) !== null) {
        table.set(`${obj[1]}.${mem[1]}`, mem[2])
        if (!table.has(mem[1])) table.set(mem[1], mem[2])
      }
    }
  }
  return table
}

/**
 * Endpoints declared by ONE file. `rel` is the repo-relative path used as
 * `source`; `src` is its contents; `patterns` is the table above.
 */
export function endpointsIn(rel, src, patterns = new Map()) {
  const out = []

  if (rel.endsWith(".controller.ts")) {
    const base = /@Controller\(\s*['"`]([^'"`]*)['"`]/.exec(src)?.[1] ?? ""
    for (const verb of HTTP) {
      const re = new RegExp(`@${verb}\\(\\s*(?:['"\`]([^'"\`]*)['"\`])?\\s*\\)`, "g")
      let m
      while ((m = re.exec(src)) !== null) {
        const sub = m[1] ?? ""
        const full = `/${[base, sub].filter(Boolean).join("/")}`.replace(/\/+/g, "/")
        out.push({ method: verb.toUpperCase(), path: full, source: rel })
      }
    }
    return out
  }

  /**
   * Source files only. Design notes and task logs quote handler code, and a
   * decorator inside a fenced block is a description of an endpoint, not one —
   * counting those inflates the surface with endpoints only ever proposed. Tests
   * quote `@MessagePattern(...)` inside assertion strings for the same reason, so
   * spec/test files are excluded here exactly as `patternConstants` excludes them.
   */
  if (
    /\.(ts|js|mts|cts)$/.test(rel) &&
    !/\.(test|spec)\.ts$/.test(rel) &&
    src.includes("@MessagePattern")
  ) {
    const re = /@MessagePattern\(\s*(?:['"`]([^'"`]+)['"`]|([\w.]+))\s*\)/g
    let m
    while ((m = re.exec(src)) !== null) {
      const literal = m[1]
      const resolved = literal ?? patterns.get(m[2])
      // An unresolved symbol is reported AS the symbol, flagged — never
      // dropped, and never guessed into a plausible-looking wire name.
      out.push({
        method: "RPC",
        path: resolved ?? `${m[2]} (unresolved)`,
        source: rel,
        ...(resolved ? {} : { unresolved: true }),
      })
    }
    return out
  }

  if (/(^|\/)route\.(ts|js)$/.test(rel)) {
    const routePath = `/${rel.replace(/^(src\/)?app\//, "").replace(/\/route\.(ts|js)$/, "")}`
      .replace(/\/\([^)]*\)/g, "")
      .replace(/\/+/g, "/")
    for (const verb of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${verb}\\b`).test(src)) {
        out.push({ method: verb, path: routePath, source: rel })
      }
    }
  }
  return out
}

/**
 * The endpoint keys one MAP ENTRY covers.
 *
 * RPC entries are written the way a person groups them — one row per handler,
 * its patterns separated by ` | ` — while the scan derives one row per pattern.
 * Comparing the joined string to a single derived name marks every grouped
 * pattern as undocumented: 38 false rows on a reference monorepo, which is
 * exactly the cry-wolf output that teaches people to ignore a check.
 */
export const endpointKeys = (e) =>
  String(e.path)
    .split("|")
    .map((p) => `${e.method} ${p.trim()}`)
    .filter((k) => k.length > String(e.method).length + 1)

/** True when a file could declare an endpoint at all — cheap pre-filter. */
export const declaresEndpoints = (rel) =>
  rel.endsWith(".controller.ts") ||
  /(^|\/)route\.(ts|js)$/.test(rel) ||
  /\.handler\.ts$/.test(rel)
