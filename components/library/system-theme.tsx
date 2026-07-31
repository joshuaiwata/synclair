"use client"

/** Registry-exempt (infra): the Foundations Theme frame — a composed screen rendered in a token system's own skin, plumbing for the style-guide pages, never product UI. */
import * as React from "react"

import { SpecimenFonts } from "@/components/library/specimen-fonts"
import type { TokenSystem } from "@/lib/system/token-systems"

/**
 * A token system's vocabulary COMPOSED AS A SCREEN.
 *
 * The predecessor showed four labeled atom tiles (header, buttons, pills, a
 * field). Atoms tell you what the values are; they don't tell you how the
 * system FEELS, because feel comes from the things atoms-in-boxes can't show —
 * density, hierarchy, how much air sits between a nav and its content, what a
 * table looks like when twelve rows of it stack up. So this renders one
 * plausible product screen instead: app bar, sidebar, page header, a stat row,
 * a table, a form, an aside.
 *
 * The layout is generic and lives in the Brain; every system renders the SAME
 * screen through its own `sample` slots, which is what makes two systems
 * directly comparable — flip between the tabs and only the skin changes. All
 * styling is inline CSS custom properties scoped to the frame, so a companion
 * system can never leak into the hub's own chrome.
 *
 * Systems that genuinely define dark values (`sample.darkVars`) get a toggle;
 * ones that don't, correctly don't — the absence is information.
 */
export function SystemThemeBlock({ system }: { system: TokenSystem }) {
  const sample = system.sample
  const [dark, setDark] = React.useState(false)
  if (!sample) return null

  const hasDark = Boolean(sample.darkVars && Object.keys(sample.darkVars).length > 0)
  const vars = dark && sample.darkVars ? { ...sample.vars, ...sample.darkVars } : sample.vars
  const family = sample.fontFamily?.split(",")[0]?.replace(/["']/g, "").trim()

  const frame: React.CSSProperties = {
    ...(vars as React.CSSProperties),
    background: "var(--sys-bg, var(--sys-surface))",
    color: "var(--sys-text)",
    fontFamily: sample.fontFamily,
  }

  return (
    <div className="flex flex-col gap-3">
      <SpecimenFonts families={[family]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-xs">
          One screen, rendered in this system&rsquo;s own values — the same
          layout every system renders, so flipping between them shows only the
          skin. Sandboxed to this frame; it never touches the hub&rsquo;s
          chrome.
        </p>
        {hasDark ? (
          <div className="flex shrink-0 items-center gap-1 rounded-full border p-0.5">
            {(["light", "dark"] as const).map((mode) => {
              const active = (mode === "dark") === dark
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDark(mode === "dark")}
                  className={`rounded-full px-2.5 py-0.5 font-mono text-2xs transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode}
                </button>
              )
            })}
          </div>
        ) : (
          <span className="text-muted-foreground shrink-0 font-mono text-2xs">
            light only — no dark values defined
          </span>
        )}
      </div>

      <div
        className="overflow-hidden rounded-xl border"
        style={frame}
        /* The system's own dark selectors are usually written against this
           attribute, so setting it makes seed CSS work without rewriting. */
        data-theme={dark ? "dark" : "light"}
      >
        {/* Recipe CSS verbatim from the system's stylesheet — the structural
            treatments (highlighter, glass, chamfer) that hexes can't carry. */}
        {sample.css && <style>{sample.css}</style>}
        <AppBar />
        <div style={{ display: "flex", minHeight: 520 }}>
          <SideRail />
          <main style={{ display: "flex", flex: 1, flexDirection: "column", gap: 20, minWidth: 0, padding: 20 }}>
            <PageHead heading={sample.classes?.heading} kicker={sample.classes?.kicker} />
            <StatRow />
            <RequestTable />
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <FormCard />
              <ActivityCard />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

/* ----------------------------- shared recipes ----------------------------- */

const surface: React.CSSProperties = {
  background: "var(--sys-surface)",
  border: "1px solid var(--sys-line)",
  borderRadius: "var(--sys-radius, 8px)",
  boxShadow: "var(--sys-shadow, none)",
}

const muted = "var(--sys-text-muted)"

const kicker: React.CSSProperties = {
  color: muted,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
}

function btn(kind: "primary" | "secondary" | "ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: "var(--sys-radius, 8px)",
    cursor: "default",
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 14px",
  }
  if (kind === "primary")
    return {
      ...base,
      background: "var(--sys-primary)",
      border: "1px solid transparent",
      color: "var(--sys-on-primary, var(--sys-surface))",
    }
  if (kind === "secondary")
    return {
      ...base,
      background: "var(--sys-surface)",
      border: "1px solid var(--sys-line)",
      color: "var(--sys-text)",
      fontWeight: 500,
    }
  return { ...base, background: "transparent", border: "1px solid transparent", color: muted, fontWeight: 500 }
}

function pill(fg: string, bg: string): React.CSSProperties {
  return {
    background: bg,
    borderRadius: 999,
    color: fg,
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 9px",
    whiteSpace: "nowrap",
  }
}

/* -------------------------------- the screen ------------------------------- */

function AppBar() {
  return (
    <header
      style={{
        alignItems: "center",
        background: "var(--sys-surface)",
        borderBottom: "1px solid var(--sys-line)",
        display: "flex",
        gap: 16,
        padding: "10px 16px",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
        {/* The brand hue lives here — an accent, not necessarily the button fill. */}
        <span
          style={{
            background: "var(--sys-accent, var(--sys-primary))",
            borderRadius: 6,
            display: "inline-block",
            height: 18,
            width: 18,
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 700 }}>Acme</span>
      </div>
      <nav style={{ display: "flex", gap: 4, marginLeft: 8 }}>
        {["Overview", "Requests", "People"].map((item, i) => (
          <span
            key={item}
            style={{
              borderRadius: "var(--sys-radius, 8px)",
              color: i === 0 ? "var(--sys-text)" : muted,
              fontSize: 13,
              fontWeight: i === 0 ? 600 : 500,
              padding: "5px 10px",
              ...(i === 0 ? { background: "var(--sys-sunken, var(--sys-bg))" } : null),
            }}
          >
            {item}
          </span>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <div
        style={{
          ...surface,
          boxShadow: "none",
          color: muted,
          fontSize: 12,
          padding: "5px 10px",
          width: 150,
        }}
      >
        Search…
      </div>
      <span
        style={{
          background: "var(--sys-sunken, var(--sys-bg))",
          border: "1px solid var(--sys-line)",
          borderRadius: 999,
          height: 26,
          width: 26,
        }}
      />
    </header>
  )
}

function SideRail() {
  const items = ["Home", "Requests", "Schedule", "People", "Reports", "Settings"]
  return (
    <aside
      style={{
        borderRight: "1px solid var(--sys-line)",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        flexShrink: 0,
        padding: 12,
        width: 168,
      }}
    >
      <span style={{ ...kicker, padding: "4px 8px 8px" }}>Workspace</span>
      {items.map((item, i) => (
        <span
          key={item}
          style={{
            borderRadius: "var(--sys-radius, 8px)",
            color: i === 1 ? "var(--sys-text)" : muted,
            fontSize: 13,
            fontWeight: i === 1 ? 600 : 500,
            padding: "6px 8px",
            ...(i === 1 ? { background: "var(--sys-sunken, var(--sys-bg))" } : null),
          }}
        >
          {item}
        </span>
      ))}
    </aside>
  )
}

function PageHead({ heading, kicker: kickerClass }: { heading?: string; kicker?: string }) {
  return (
    <div style={{ alignItems: "flex-end", display: "flex", gap: 12, justifyContent: "space-between" }}>
      <div style={{ alignItems: "flex-start", display: "flex", flexDirection: "column", gap: 6 }}>
        {/* One eyebrow — a kicker recipe is a single accent, not a label style. */}
        {kickerClass ? (
          <span className={kickerClass}>This week</span>
        ) : (
          <span style={kicker}>This week</span>
        )}
        <span className={heading} style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>Requests</span>
        <span style={{ color: muted, fontSize: 13 }}>12 active · 3 pending this week</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={btn("secondary")}>
          Export
        </button>
        <button type="button" style={btn("primary")}>
          New request
        </button>
      </div>
    </div>
  )
}

function StatRow() {
  const stats = [
    { label: "Open", value: "42" },
    { label: "Filled this week", value: "12" },
    { label: "Avg. days to fill", value: "3.4" },
    { label: "Escalated", value: "1" },
  ]
  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
      {stats.map((s) => (
        <div key={s.label} style={{ ...surface, display: "flex", flexDirection: "column", gap: 4, padding: "14px 16px" }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>{s.value}</span>
          <span style={kicker}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

function RequestTable() {
  const rows = [
    { name: "Site electrician", owner: "R. Alvarez", status: "open" as const },
    { name: "Night-shift welder", owner: "T. Okafor", status: "staged" as const },
    { name: "Crane operator", owner: "M. Lindqvist", status: "closed" as const },
    { name: "Safety inspector", owner: "J. Park", status: "flagged" as const },
  ]
  const tone = {
    open: pill("var(--sys-ok, var(--sys-text))", "var(--sys-ok-soft, var(--sys-sunken, var(--sys-bg)))"),
    staged: pill("var(--sys-on-accent, var(--sys-text))", "var(--sys-primary-soft, var(--sys-sunken, var(--sys-bg)))"),
    closed: pill(muted, "var(--sys-sunken, var(--sys-bg))"),
    flagged: pill("var(--sys-danger, var(--sys-text))", "var(--sys-danger-soft, var(--sys-sunken, var(--sys-bg)))"),
  }
  const cell: React.CSSProperties = { fontSize: 13, padding: "10px 14px", textAlign: "left" }
  return (
    <div style={{ ...surface, overflow: "hidden" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "var(--sys-sunken, var(--sys-bg))" }}>
            {["Role", "Owner", "Status"].map((h) => (
              <th key={h} style={{ ...cell, ...kicker, padding: "8px 14px" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} style={i > 0 ? { borderTop: "1px solid var(--sys-line)" } : undefined}>
              <td style={{ ...cell, fontWeight: 500 }}>{r.name}</td>
              <td style={{ ...cell, color: muted }}>{r.owner}</td>
              <td style={cell}>
                {/* Status carries a label, never color alone. */}
                <span style={tone[r.status]}>{r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FormCard() {
  return (
    <div style={{ ...surface, display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
      <span style={kicker}>New request</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Role title</span>
        <div
          style={{
            background: "var(--sys-bg, var(--sys-surface))",
            border: "1px solid var(--sys-line)",
            borderRadius: "var(--sys-radius, 8px)",
            color: muted,
            fontSize: 13,
            padding: "8px 10px",
          }}
        >
          e.g. Site electrician
        </div>
        <span style={{ color: muted, fontSize: 12 }}>Appears on the public board.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Market</span>
        <div
          style={{
            alignItems: "center",
            background: "var(--sys-bg, var(--sys-surface))",
            border: "1px solid var(--sys-line)",
            borderRadius: "var(--sys-radius, 8px)",
            color: "var(--sys-text)",
            display: "flex",
            fontSize: 13,
            justifyContent: "space-between",
            padding: "8px 10px",
          }}
        >
          Greater Manchester
          <span style={{ color: muted }}>▾</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, paddingTop: 2 }}>
        <button type="button" style={btn("primary")}>
          Post request
        </button>
        <button type="button" style={btn("ghost")}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function ActivityCard() {
  const events = [
    { who: "R. Alvarez", what: "moved 2 candidates to interview", when: "10m" },
    { who: "System", what: "matched 4 profiles to Night-shift welder", when: "1h" },
    { who: "T. Okafor", what: "closed Crane operator — filled", when: "3h" },
  ]
  return (
    <div style={{ ...surface, display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
      <span style={kicker}>Activity</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {events.map((e) => (
          <div key={e.what} style={{ display: "flex", gap: 10 }}>
            <span
              style={{
                background: "var(--sys-accent, var(--sys-primary))",
                borderRadius: 999,
                flexShrink: 0,
                height: 7,
                marginTop: 5,
                width: 7,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{e.who}</span> {e.what}
              </span>
              <span style={{ color: muted, fontSize: 11 }}>{e.when} ago</span>
            </div>
          </div>
        ))}
      </div>
      <span style={{ color: "var(--sys-info, var(--sys-text))", fontSize: 12, fontWeight: 500 }}>
        View all activity →
      </span>
    </div>
  )
}
