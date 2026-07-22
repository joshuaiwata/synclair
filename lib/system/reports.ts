import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { getCatalog } from "./components"

/**
 * REPORTS — the hub's build/coverage reports, as DATA.
 *
 * Each report is one JSON file in `data/reports/<id>.json` (id = the filename,
 * conventionally a date like `2026-07-14` or `2026-07-14-post-fixes`). Reports
 * are **append-only**: a fresh run writes a NEW file, it never overwrites an
 * existing one — so the archive is the full history and you can re-run after
 * fixes (or have an agent update recommendation `status`) without losing the
 * prior baseline. The `/synclair/reports` page renders the latest by default and
 * lets you open any past one.
 *
 * COUNTS DON'T DRIFT: a report's numeric stats are *verified* against the hub's
 * own data at render (`verifyReportCounts`) — the same `getCatalog()` the
 * library reads — so the report can't claim "15 components" while the library
 * shows a different number. A mismatch surfaces in the UI instead of lying.
 *
 * This is the foundation MECHANISM; the report content itself is SEED (a
 * project's `data/reports/*.json`, written by the `build-report` skill).
 */

export type ReportStatusKind = "mapped" | "partial" | "gap" | "missing"
export type RecommendationStatus = "open" | "in-progress" | "done"

export interface ReportStat {
  label: string
  value: string
  accent?: boolean
  /** Ties this stat to a live hub count so it's verified, not asserted. */
  derivedFrom?: "components" | "blocks" | "templates"
}

export interface ReportSurface {
  name: string
  note?: string
  kind?: "web" | "native" | string
  scope?: string
}

export interface ReportPillar {
  name: string
  hint?: string
  /**
   * Readiness on a 0–5 rubric — the scale report generators naturally author,
   * and the honest precision for a qualitative judgment (not a fake
   * percentage). Rendered as `n/5` beside a bar filled to n/5 of full width.
   */
  score: number
}

export interface ReportArea {
  id: string
  name: string
  status: ReportStatusKind
  /** Hub-relative path to the area's tab (already `synclair()`-prefixed). */
  href?: string
  found: string
  gap?: string
  next?: string
}

export interface ReportRecommendation {
  id: string
  track: string
  /** The area id this rec surfaces on. */
  area?: string
  title: string
  detail: string
  /** Progress across re-runs — a later report (or agent) flips this. */
  status?: RecommendationStatus
  /** Impact hint, e.g. "+18". */
  delta?: string
}

export interface ReportDoc {
  /** = filename stem; unique + orderable. */
  id: string
  type: string
  subject: string
  date: string
  lens?: string
  headline: string
  dek?: string
  stats?: ReportStat[]
  surfaces?: ReportSurface[]
  pillars?: ReportPillar[]
  areas: ReportArea[]
  recommendations: ReportRecommendation[]
}

const REPORTS_DIR = path.join(process.cwd(), "data", "reports")

/** All reports, newest first (the archive). Empty when none exist. */
export async function listReports(): Promise<ReportDoc[]> {
  let files: string[]
  try {
    files = (await readdir(REPORTS_DIR)).filter((f) => f.endsWith(".json"))
  } catch {
    return [] // no dir yet → no reports
  }
  const docs = await Promise.all(
    files.map(async (f) => {
      try {
        const raw = await readFile(path.join(REPORTS_DIR, f), "utf8")
        const doc = JSON.parse(raw) as ReportDoc
        return { ...doc, id: doc.id ?? f.replace(/\.json$/, "") }
      } catch {
        return null
      }
    })
  )
  return docs
    .filter((d): d is ReportDoc => d !== null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)))
}

export async function getLatestReport(): Promise<ReportDoc | null> {
  return (await listReports())[0] ?? null
}

export async function getReport(id: string): Promise<ReportDoc | null> {
  return (await listReports()).find((d) => d.id === id) ?? null
}

/** Live counts from the hub's own data — the source of truth a report is checked against. */
export async function liveReportCounts(): Promise<Record<"components" | "blocks" | "templates", number>> {
  const catalog = await getCatalog()
  const of = (kind: string) => catalog.filter((c) => c.kind === kind && c.layer === "project").length
  return { components: of("component"), blocks: of("block"), templates: of("template") }
}

export interface CountMismatch {
  label: string
  claimed: string
  actual: number
}

/**
 * Verify a report's count-bearing stats against the live hub data. Any stat with
 * a `derivedFrom` whose value doesn't equal the live count is returned as a
 * mismatch (the page flags these) — so "X here / Y there" can't ship silently.
 */
export async function verifyReportCounts(report: ReportDoc): Promise<CountMismatch[]> {
  const live = await liveReportCounts()
  const out: CountMismatch[] = []
  for (const s of report.stats ?? []) {
    if (!s.derivedFrom) continue
    const actual = live[s.derivedFrom]
    if (String(actual) !== s.value.replace(/[^0-9]/g, "")) {
      out.push({ label: s.label, claimed: s.value, actual })
    }
  }
  return out
}
