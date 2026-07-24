/**
 * Turbopack/webpack loader — the Path A "host self-alias" bridge.
 *
 * A companion-mode host that follows the shadcn convention imports its OWN
 * modules through the `@/` path alias (`@/lib/utils`, `@/components/ui`,
 * `@/screens/*`, `@/shell/*`). When those host files are pulled into the hub's
 * module graph (Path A live previews), Turbopack resolves their specifiers
 * against SYNCLAIR's tsconfig — where `@/*` → `./*` means the HUB root, which
 * owns different `lib/` and `components/` trees. So the host's `@/…` imports
 * collide head-on with the hub's own and hard-fail.
 *
 * This loader rewrites a HOST file's own `@/x` specifiers onto the hub's
 * `@host/*` alias (e.g. `@host/src/x`, or `@host/x` for hosts whose `@/`
 * points at the repo root), so they resolve to the real host modules — while
 * the hub's own `@/` (its files never pass through this rewrite) is untouched.
 *
 * Scope: keyed on `*.ts`/`*.tsx` by basename (Turbopack rules keys are
 * basename globs), but the resourcePath guard makes it a strict no-op for
 * everything that isn't host source — the hub's own files, node_modules, etc.
 * — so it only ever transforms the host modules a preview reaches.
 *
 * How host trees are found (all containment by RESOLVED paths, never path
 * substrings — a repo may be NAMED `*-synclair-*`, and a host may have no
 * `src/` dir at all, so substring checks misfire in the fleet):
 *
 *   1. Loader `options.hosts` (`[{ root, srcBase? }]`, roots relative to the
 *      hub root), when the clone's next.config.ts passes them explicitly.
 *   2. Otherwise, the hub tsconfig's `@host/*` path targets (the same alias
 *      the rewrite lands on — one source of truth). Per-surface variants
 *      (`@host-<surface>/*`) are honored too and rewrite onto their own alias.
 *
 * The rewrite prefix under the alias is the host's OWN `@/*` target expressed
 * relative to the alias target: a shadcn host mapping `@/*` → `./src/*` gets
 * `@/x` → `@host/src/x`; a root-level host (`@/*` → `./*`, e.g. Papermark's
 * top-level components/) gets `@/x` → `@host/x`. Read from the host's
 * tsconfig/jsconfig (walking up from the alias target, stopping at its repo
 * root); if none is readable, fall back to "has a src/ dir → src, else root".
 *
 * Dependency-free CJS on purpose — loaders load before anything is installed
 * conditionally, and clones sync this file as-is. Node builtins only.
 */
const fs = require("node:fs")
const path = require("node:path")

// The hub root is wherever this loader physically lives (<hub>/scripts/..) —
// true in the mother repo, standalone clones, and embedded/co-located clones.
const HUB_ROOT = path.resolve(__dirname, "..")

/** True when `p` is `root` or lives inside it — by resolved path segments. */
function contains(root, p) {
  const rel = path.relative(root, p)
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

/**
 * Read a tsconfig-flavored JSON file: tolerate line and block comments and
 * trailing commas (string-aware scan — no naive regex over string contents).
 * Returns the parsed object, or null when unreadable/unparsable.
 */
function readJsonc(file) {
  let text
  try {
    text = fs.readFileSync(file, "utf8")
  } catch {
    return null
  }
  let out = ""
  let i = 0
  let inString = false
  while (i < text.length) {
    const c = text[i]
    if (inString) {
      out += c
      if (c === "\\") {
        out += text[i + 1] ?? ""
        i += 2
        continue
      }
      if (c === '"') inString = false
      i += 1
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      i += 1
      continue
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1
      continue
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1
      i += 2
      continue
    }
    out += c
    i += 1
  }
  try {
    return JSON.parse(out.replace(/,\s*([}\]])/g, "$1"))
  } catch {
    return null
  }
}

/** Strip a trailing `*` (and its slash) from a tsconfig path-pattern. */
const dropStar = (pattern) => pattern.replace(/\/?\*$/, "")

/**
 * What the HOST maps its own `@/` to, expressed relative to `aliasTarget`
 * ("" for the alias target itself, "src" for the shadcn default, …).
 * Walks up from the alias target looking for a tsconfig/jsconfig `@/*`
 * mapping, stopping once a `.git` boundary (the host's repo root) has been
 * checked — never wanders into unrelated parent directories.
 */
function hostSrcBase(aliasTarget) {
  let dir = aliasTarget
  for (;;) {
    for (const name of ["tsconfig.json", "jsconfig.json"]) {
      const cfg = readJsonc(path.join(dir, name))
      const target = cfg?.compilerOptions?.paths?.["@/*"]?.[0]
      if (typeof target === "string") {
        const abs = path.resolve(dir, dropStar(target))
        const rel = path.relative(aliasTarget, abs)
        // A mapping that lands outside the alias tree can't be expressed
        // under `@host/*` — fall through to the heuristic below.
        if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
          return rel.split(path.sep).join("/")
        }
      }
    }
    const atRepoRoot = fs.existsSync(path.join(dir, ".git"))
    const parent = path.dirname(dir)
    if (atRepoRoot || parent === dir) break
    dir = parent
  }
  // No readable `@/*` mapping — assume the conventional layout: a src/ dir
  // means `@/*` → `./src/*`, otherwise `@/` points at the tree root.
  try {
    if (fs.statSync(path.join(aliasTarget, "src")).isDirectory()) return "src"
  } catch {
    /* no src/ dir */
  }
  return ""
}

/** Build one host-tree entry: its resolved root + the full rewrite prefix. */
function hostEntry(alias, root, srcBase) {
  const base = srcBase == null ? hostSrcBase(root) : srcBase.replace(/^\/+|\/+$/g, "")
  return { root, prefix: `${alias}/${base ? `${base}/` : ""}` }
}

// Derived once per process (the loader runs per module — don't re-read
// tsconfigs for every file). Options are read on the first call.
let cachedHosts = null

/** Resolve the host trees this hub can live-import from. */
function hostTrees(options) {
  if (cachedHosts) return cachedHosts
  const entries = []
  if (options && Array.isArray(options.hosts)) {
    // Explicit wiring from next.config.ts wins.
    for (const h of options.hosts) {
      if (!h || typeof h.root !== "string") continue
      entries.push(
        hostEntry(
          typeof h.alias === "string" ? h.alias : "@host",
          path.resolve(HUB_ROOT, h.root),
          typeof h.srcBase === "string" ? h.srcBase : null,
        ),
      )
    }
  } else {
    // Same source of truth the rewrite resolves against: the hub tsconfig's
    // `@host/*` (or `@host-<surface>/*`) path targets.
    const paths = readJsonc(path.join(HUB_ROOT, "tsconfig.json"))?.compilerOptions?.paths ?? {}
    for (const [key, targets] of Object.entries(paths)) {
      const m = /^(@host(?:-[A-Za-z0-9_-]+)?)\/\*$/.exec(key)
      if (!m || !Array.isArray(targets)) continue
      for (const target of targets) {
        if (typeof target !== "string") continue
        entries.push(hostEntry(m[1], path.resolve(HUB_ROOT, dropStar(target)), null))
      }
    }
  }
  cachedHosts = entries
  return entries
}

module.exports = function hostSelfAliasLoader(source) {
  if (!this.resourcePath || source.indexOf("@/") === -1) return source
  const abs = path.resolve(this.resourcePath)
  // Dependencies are never host source, wherever they sit.
  if (abs.split(path.sep).includes("node_modules")) return source
  // The hub's own files keep their own `@/` (the hub tsconfig owns it). This
  // also covers the embedded topology, where HUB_ROOT sits INSIDE a host root.
  if (contains(HUB_ROOT, abs)) return source
  const options =
    typeof this.getOptions === "function"
      ? this.getOptions()
      : this.query && typeof this.query === "object"
        ? this.query
        : null
  const host = hostTrees(options).find((h) => contains(h.root, abs))
  if (!host) return source
  // Rewrite `@/` only in module-specifier position (import/export-from and
  // dynamic import), never inside arbitrary string literals.
  return source.replace(/(from\s*["']|import\s*\(\s*["'])@\//g, `$1${host.prefix}`)
}
