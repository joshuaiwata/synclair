import { readFile } from "node:fs/promises"
import path from "node:path"
import { cache } from "react"

/**
 * Foundation hygiene for the HOST codebase — the drift Storybook has no organ
 * for (docs/rendering-parity.md). The component catalog tracks whether the hub
 * matches the host; hygiene tracks whether the host matches ITS OWN foundation:
 * inline styles, raw hex/color functions, Tailwind arbitrary values, and native
 * elements used where a design-system primitive exists.
 *
 * Advisory by design — these are conversation starters for the team ("we said
 * tokens; here's where we didn't"), never build failures on someone else's repo.
 *
 * Source of truth: `data/host-hygiene.json`, written by
 * `scripts/scan-host-hygiene.mjs` (`npm run scan:hygiene`). Blank in the mother
 * repo; regenerate whenever the report's `scannedAt` drifts behind the host.
 */

export type HygieneRuleId =
  | "inline-style"
  | "raw-hex-color"
  | "color-function"
  | "arbitrary-value"
  | "raw-color-utility"
  | "important"
  | "native-element"

export interface HygieneRuleMeta {
  label: string
  /** What the rule flags and why it matters — shown on /synclair/hygiene. */
  description: string
}

export const HYGIENE_RULES: Record<HygieneRuleId, HygieneRuleMeta> = {
  "inline-style": {
    label: "Inline styles",
    description:
      "style={{…}} attributes — styling that bypasses the design system entirely; invisible to tokens, themes, and dark mode.",
  },
  "raw-hex-color": {
    label: "Raw hex colors",
    description:
      "Hardcoded #hex values in components — colors that won't follow a re-theme and drift from the palette silently.",
  },
  "color-function": {
    label: "Raw color functions",
    description: "rgb()/hsl()/oklch() literals in component code instead of a token.",
  },
  "arbitrary-value": {
    label: "Arbitrary Tailwind values",
    description:
      "Bracketed one-off class values (a fixed pixel width, a literal hex background) that step outside the scale the foundation defines.",
  },
  "raw-color-utility": {
    label: "Raw color utilities",
    description:
      "Tailwind's built-in literal color classes (text-white, bg-black, text-blue-500…) used instead of a semantic token — they bypass the palette and won't follow a re-theme, same as a raw hex.",
  },
  important: {
    label: "!important",
    description: "Specificity escalations — usually a symptom of fighting the system instead of extending it.",
  },
  "native-element": {
    label: "Native elements bypassing primitives",
    description:
      "Raw <button>/<input>/<select>/<textarea> in feature code while the host has a design-system primitive for it — inconsistent focus states, sizes, and a11y.",
  },
}

export interface HygieneFinding {
  rule: HygieneRuleId
  /** Path relative to the host root. */
  hostPath: string
  line: number
  /** The offending line, trimmed. */
  snippet: string
}

export interface HygieneRuleSummary {
  rule: HygieneRuleId
  count: number
  /** Distinct files with at least one finding. */
  files: number
  /** Findings beyond the stored cap (report keeps a sample, counts stay true). */
  truncated: number
}

export interface HygieneTopFile {
  hostPath: string
  count: number
  byRule: Partial<Record<HygieneRuleId, number>>
}

export interface HostHygieneReport {
  /** ISO date the scan ran. */
  scannedAt: string
  hosts: { name: string; root: string; commit?: string }[]
  totals: { findings: number; files: number; scannedFiles: number }
  rules: HygieneRuleSummary[]
  topFiles: HygieneTopFile[]
  /** Capped sample per rule — see each rule's `truncated` for what's not shown. */
  findings: HygieneFinding[]
}

const REPORT_PATH = path.join(process.cwd(), "data", "host-hygiene.json")

/** The persisted hygiene report, or null when no scan has run (a valid blank). */
export const getHostHygiene = cache(async (): Promise<HostHygieneReport | null> => {
  try {
    const raw = await readFile(REPORT_PATH, "utf8")
    const parsed = JSON.parse(raw) as HostHygieneReport
    if (!parsed || typeof parsed.scannedAt !== "string" || !Array.isArray(parsed.rules)) return null
    return parsed
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(
        "[host-hygiene] data/host-hygiene.json unreadable — treating as absent:",
        e instanceof Error ? e.message : e
      )
    }
    return null
  }
})
