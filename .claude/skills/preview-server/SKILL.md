---
name: preview-server
category: tooling
layer: foundation
description: Reliably start, stop, and recover the Synclair dev/preview server (port 4100). Use whenever bringing up the preview, when preview_start fails (any error — spawn failures, Turbopack panics, "Another next dev server is already running"), or when the preview window is blank or stuck on "Awaiting server". Prevents the port-collision, symlink-panic, and .next-poisoning failures that recur across agents/sessions.
---

# Running the Synclair preview server

The dev server runs on the port in **`.claude/launch.json`** — **4100 by default**, but read the file rather than assuming: an **embedded** clone (Synclair inside a host repo / monorepo — `docs/setup-modes.md`) commonly runs on **4101/4102** because the host app and other `apps/*` already hold the lower ports. Everywhere this skill writes "4100," read "the port from `launch.json`." Two hard rules:

- **The port from `launch.json` is dedicated to THIS clone.** Reclaiming *that* port is safe. **But do not assume 4100 is ours** — in embedded/monorepo mode the process on 4100 is often the **host app**, not Synclair. Confirm the listener's `cwd` is this repo before reclaiming any port (the helper script does this; the "Wrong app" section below is the check).
- **Port 3000 is reserved by another app on this machine — never touch it.** Never `pkill -f "next dev"` or kill by port 3000; that hits the wrong process. Only ever kill `next` processes whose cwd is this repo (the helper script does exactly that).

## Why it keeps failing (read this first)

**Next.js allows only ONE dev server per project directory.** And the **Claude desktop app supervises that one server itself** — it launches `npm run dev` on 4100 and **auto-restarts it** if it dies. So:

- When another agent/tab already has the preview up, a second `preview_start` runs its own `next dev`, Next.js sees the existing one, and aborts with **"Another next dev server is already running."** This is expected, not a code bug — **the server is already running and healthy.**
- **Killing that server does NOT help** — the app respawns it within a second, and your `preview_start` still collides. Chasing it with `reclaim` starts a respawn war you cannot win.

So the golden rule is **reuse, don't restart**. Only reclaim a server that is genuinely *wedged* (holding the port but not serving HTTP 200) — never a healthy one.

**Exception — the harness keeps demanding `preview_start`:** if the desktop app repeatedly retries `preview_start` against a healthy server (repeated "Another next dev server is already running" turns), the squatter is usually an **orphaned Bash-started server from an earlier agent turn**, not app-supervised — and "reuse it" answers won't stop the retries, because the MCP screenshot/eval tools don't own that server. Verified 2026-07-10: kill the specific PIDs (the `next dev` parent + `next-server` child, cwd-checked), confirm the port STAYS free for ~2s (no respawn ⇒ it wasn't supervised), then call `preview_start` once — it starts cleanly and the tools regain ownership. If the port is instantly re-occupied, it IS supervised: reuse, per the golden rule.

(A secondary, unrelated failure: running a production build in this dir poisons the dev cache and makes the first compile hang — blank / "Awaiting server". That one is fixed with `clean`.)

## The helper

`scripts/preview-server.sh` does the things the harness can't. It does **not** start the server (start it with a background Bash `npm run dev -- -p 4100` — see the procedure), and it **refuses to kill a healthy server** by default:

```
scripts/preview-server.sh doctor    # diagnose + tell you the exact next action
scripts/preview-server.sh reclaim   # kill only a WEDGED server this repo owns (refuses if http 200)
scripts/preview-server.sh clean     # reclaim --force + rm -rf .next  (blank / hung compile)
scripts/preview-server.sh status    # raw state of :4100
```

## Procedure (follow in order)

1. **Always run `scripts/preview-server.sh doctor` FIRST.**
   - `OK: healthy` → a server is already up on 4100 (probably app-supervised). **Reuse it — do NOT start anything, do NOT reclaim.** Curl `http://localhost:4100/<route>` to confirm content is current; that is the working state, stop here. (The screenshot/eval MCP tools may not own this server — that's fine, the preview window itself is live.)
   - `DOWN` → **start via Bash, not `preview_start`** (see below).
   - `WEDGED` → `scripts/preview-server.sh clean`, then start via Bash.
2. **Starting: use a background Bash command, NOT `preview_start`.** `preview_start`
   has recurring failures across every project on this machine (PATH/spawn bugs,
   sandbox panics — see the known-failures list). Instead:
   ```
   npm run dev -- -p 4100        # Bash tool, run_in_background: true
   ```
   then wait ~6s and curl `http://localhost:4100/` for a 200 + correct `<title>`
   before calling it up. Point the user's preview/browser at `localhost:4100`.
   If the Bash start dies with `EADDRINUSE`, something (often the app's own
   supervisor) grabbed 4100 first — re-run `doctor`; if it's healthy and serving
   current content, that IS the running server: reuse it.
3. **Blank / stuck on "Awaiting server":** first compile is still running or the cache is poisoned. Wait ~10s once; if still blank, `scripts/preview-server.sh clean`, then start via Bash. First compile after a clean `.next` takes ~10s — **wait before screenshotting**.
4. **To stop:** kill the specific PID on 4100 you've confirmed belongs to this repo (or `preview_stop` if the MCP owns it).

## Known startup failures

- **Turbopack panic: "Symlink [project]/node_modules is invalid, it points out of
  the filesystem root"** — `node_modules` is a symlink to a directory outside the
  project (the preview sandbox can't follow absolute symlinks). Fix: `rm
  node_modules && npm install` (a real directory, not a link). Never symlink
  `node_modules` across repos to save an install.
- **Wrong app on the port** — a *different checkout* of this foundation, or (in
  embedded/monorepo mode) the **host app** itself, can be on the port you expected
  (check the listener's `cwd`: `lsof -p <pid> | awk '$4=="cwd"'` and the served
  `<title>`). If its cwd is not this repo, **do not kill it** — it's the host app
  or another project; let this clone take its own `launch.json` port instead (Next
  auto-bumps, or set the port explicitly). Only kill a PID you've confirmed is a
  stale checkout of *this* repo.
- **`preview_start` spawn/PATH failures** — a known desktop-app bug class; don't
  debug it, use the Bash start above.

## Multiple agents on one repo

Because Next.js allows one dev server per directory, **two agents/tabs working in this same repo share the one app-supervised server** — the second cannot start its own. That's fine for viewing, but the second session may not get MCP screenshot control. For true isolation (each agent its own server + port), run the agent in a **git worktree** (a separate checkout dir), not the same directory.

## Never do this

- **Do not run `next build` / `next start` / `npm run build` in this working directory.** It writes production artifacts into `.next` that make the Turbopack **dev** server hang. To type/lint-check, use `npx tsc --noEmit` and `npx eslint .` — not a build. If a build already happened and dev is hanging, run `scripts/preview-server.sh clean`.
- **Do not kill processes by name or by port 3000.** Use the helper (kills only this repo's `next` processes by cwd) or kill a specific PID you've confirmed is on 4100.
