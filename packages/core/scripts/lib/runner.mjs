/**
 * ONE way to spawn a core script, on every platform.
 *
 * Three files needed this — the CLI (bin/synclair.mjs), index.mjs, refresh.mjs
 * — and all three had their own copy of the same two lines. All three were
 * wrong in the same way, which is the argument for this file existing at all
 * (see lib/api-surface.mjs for the same lesson learned the same way).
 *
 * The wrong two lines were `node_modules/.bin/tsx`. That shim is
 * EXTENSIONLESS: a sh script, which Windows cannot exec — spawning it there
 * fails ENOENT, so every .ts step died silently and the CLI exited 1 with no
 * output at all. Its `.cmd` twin is not a fix either; execFile/spawn without a
 * shell throws EINVAL on a .cmd in current Node. The one form that works
 * everywhere is to run tsx's real JS ENTRY through `process.execPath`, which is
 * what this returns.
 *
 * The entry is read from tsx's own package.json `bin` rather than hardcoded, so
 * a layout change in tsx is FOLLOWED rather than guessed at — the failure mode
 * of a guess here is the silent ENOENT we just got done fixing.
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

/** tsx's JS entry under `dir/node_modules/tsx`, or null if it isn't there. */
function tsxEntry(dir) {
  const pkgDir = path.join(dir, "node_modules", "tsx")
  try {
    const { bin } = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"))
    const rel = typeof bin === "string" ? bin : bin?.tsx
    if (!rel) return null
    const abs = path.join(pkgDir, rel)
    return existsSync(abs) ? abs : null
  } catch {
    // Not installed here, or an unreadable/odd package.json — try the next dir.
    return null
  }
}

/**
 * The first installed tsx among `searchDirs`, or null.
 *
 * Callers pass the layouts core actually ships in: the package's own
 * node_modules (isolated install), the hub root's when vendored as
 * packages/core (hoisted), and the hub root's when installed from the registry
 * (the caller's cwd IS the hub root — the one rule the CLI guarantees).
 */
export function resolveTsx(searchDirs) {
  for (const dir of searchDirs) {
    const entry = tsxEntry(dir)
    if (entry) return entry
  }
  return null
}

/**
 * `[bin, argv]` for spawning one script — hand it straight to
 * execFileSync/spawn with a spread. Plain .mjs runs under node; .ts runs under
 * tsx. With no tsx installed anywhere we still fall back to a bare `tsx` on
 * PATH, which is what this did before and is better than refusing to try.
 */
export function runner(script, args, searchDirs) {
  if (!script.endsWith(".ts")) return [process.execPath, [script, ...args]]
  const tsx = resolveTsx(searchDirs)
  return tsx ? [process.execPath, [tsx, script, ...args]] : ["tsx", [script, ...args]]
}
