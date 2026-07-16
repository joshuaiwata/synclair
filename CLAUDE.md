# Synclair — project router (Claude Code)

The router is **agent-neutral** and lives in **[`AGENTS.md`](AGENTS.md)** so every
agent (Claude Code, Codex, Cursor, Copilot, Gemini, …) reads the same map. It is
imported here so it loads every Claude Code session:

@AGENTS.md

## Claude Code specifics

- **Skills** — the capabilities listed in `AGENTS.md` auto-surface via their
  descriptions; invoke by name with the Skill tool (no need to open the file first).
- **Memory** — non-obvious project facts are indexed in
  [`memory/MEMORY.md`](memory/MEMORY.md); recalled entries reflect what was true when
  written, so verify before relying on file/flag names.

_Editing the router?_ Change **`AGENTS.md`** (the shared source), not this file.
