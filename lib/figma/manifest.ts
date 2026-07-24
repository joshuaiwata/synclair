import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

const TEAM_ID = "771029011017334846"
const API_BASE = "https://api.figma.com/v1"
const SNAPSHOT_DIR = path.join(process.cwd(), "data", "figma-manifest")

export interface ManifestFile {
  key: string
  name: string
  projectId: string
  projectName: string
  lastModified: string
}

export interface Snapshot {
  /** YYYY-MM-DD, local date the snapshot represents */
  date: string
  takenAt: string
  teamId: string
  teamName: string
  files: ManifestFile[]
}

export interface FileChange {
  kind: "added" | "modified" | "removed"
  file: ManifestFile
  /** for modified files: the lastModified recorded in the base snapshot */
  previousModified?: string
}

export interface ManifestDiff {
  baseDate: string
  changes: FileChange[]
}

export interface SnapshotSummary {
  date: string
  takenAt: string
  fileCount: number
  added: number
  modified: number
  removed: number
}

export interface ManifestReport {
  ok: boolean
  error?: string
  teamName: string
  takenAt: string
  files: ManifestFile[]
  projects: { id: string; name: string; fileCount: number }[]
  /** live state vs the most recent snapshot from a previous day */
  diff: ManifestDiff | null
  history: SnapshotSummary[]
}

function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * GET a Figma endpoint, retrying on 429 (rate limit). Figma limits the
 * `/projects/:id/files` endpoint tightly, so a burst of project fetches will
 * get throttled; we back off (honoring `Retry-After` when present) instead of
 * failing the whole sync on the first 429.
 */
async function figmaGet<T>(endpoint: string, attempt = 0): Promise<T> {
  const token = process.env.FIGMA_TOKEN
  if (!token) throw new Error("FIGMA_TOKEN is not set — add it to .env")
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "X-Figma-Token": token },
    cache: "no-store",
  })
  if (res.status === 429 && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after"))
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt
    await sleep(waitMs)
    return figmaGet<T>(endpoint, attempt + 1)
  }
  if (!res.ok) throw new Error(`Figma API ${res.status} on ${endpoint}`)
  return res.json() as Promise<T>
}

/** Run `fn` over `items` with at most `limit` in flight — keeps request bursts
 *  under Figma's rate limit instead of firing all projects at once. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function fetchLiveSnapshot(): Promise<Snapshot> {
  const team = await figmaGet<{
    name: string
    projects: { id: string; name: string }[]
  }>(`/teams/${TEAM_ID}/projects`)
  const perProject = await mapPool(team.projects, 3, async (p) => {
    const res = await figmaGet<{
      files: { key: string; name: string; last_modified: string }[]
    }>(`/projects/${p.id}/files`)
    return res.files.map((f): ManifestFile => ({
      key: f.key,
      name: f.name,
      projectId: p.id,
      projectName: p.name,
      lastModified: f.last_modified,
    }))
  })
  const takenAt = new Date().toISOString()
  return {
    date: localDate(takenAt),
    takenAt,
    teamId: TEAM_ID,
    teamName: team.name,
    files: perProject
      .flat()
      .sort((a, b) => b.lastModified.localeCompare(a.lastModified)),
  }
}

function diffSnapshots(base: Snapshot, current: Snapshot): ManifestDiff {
  const baseByKey = new Map(base.files.map((f) => [f.key, f]))
  const currentKeys = new Set(current.files.map((f) => f.key))
  const changes: FileChange[] = []

  for (const file of current.files) {
    const prev = baseByKey.get(file.key)
    if (!prev) changes.push({ kind: "added", file })
    else if (prev.lastModified !== file.lastModified)
      changes.push({
        kind: "modified",
        file,
        previousModified: prev.lastModified,
      })
  }
  for (const file of base.files) {
    if (!currentKeys.has(file.key)) changes.push({ kind: "removed", file })
  }
  return { baseDate: base.date, changes }
}

async function readSnapshots(): Promise<Snapshot[]> {
  await mkdir(SNAPSHOT_DIR, { recursive: true })
  const entries = (await readdir(SNAPSHOT_DIR)).filter((f) =>
    /^\d{4}-\d{2}-\d{2}\.json$/.test(f)
  )
  // Per-file tolerance: one corrupt day-file must not reject the whole
  // Promise.all and silently blank the entire snapshot history.
  const snapshots = await Promise.all(
    entries.map(async (f) => {
      try {
        return JSON.parse(await readFile(path.join(SNAPSHOT_DIR, f), "utf8")) as Snapshot
      } catch {
        console.error(`figma manifest: skipping corrupt snapshot ${f}`)
        return null
      }
    })
  )
  return snapshots
    .filter((s): s is Snapshot => s !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Latest stored snapshot's files — a lightweight, network-free read for
 * surfaces (like the Overview's Recent feed) that just need "what Figma files
 * exist and when they last changed" without triggering a live sync. Empty when
 * no snapshot has been written yet.
 */
export async function getStoredFigmaFiles(): Promise<ManifestFile[]> {
  try {
    const snapshots = await readSnapshots()
    return snapshots.at(-1)?.files ?? []
  } catch {
    return []
  }
}

/**
 * How fresh a stored snapshot must be to serve it without hitting Figma. The
 * design workspace doesn't change by the minute, so an hourly live-sync on load
 * is plenty — this keeps us well under Figma's rate limit. Manual Refresh
 * (`force`) always syncs now.
 */
const SYNC_TTL_MS = 60 * 60 * 1000 // 1 hour

/** Assemble a report around one "current" snapshot + the diff vs the most recent
 *  prior-day snapshot. Shared by the cached, live, and fallback paths. */
function buildReport(
  current: Snapshot,
  history: Snapshot[],
  extra: { ok: boolean; error?: string } = { ok: true }
): ManifestReport {
  const others = history.filter((s) => s.date !== current.date)
  const base = [...others].reverse().find((s) => s.date < current.date) ?? null
  return {
    ok: extra.ok,
    error: extra.error,
    teamName: current.teamName,
    takenAt: current.takenAt,
    files: current.files,
    projects: summarizeProjects(current.files),
    diff: base ? diffSnapshots(base, current) : null,
    history: summarizeHistory([...others, current]),
  }
}

/**
 * The main entry: report the Figma manifest. Serves the stored snapshot as-is
 * when it's still fresh (< SYNC_TTL_MS old); only fetches live state — and
 * persists a new snapshot — when the snapshot is stale or `force` is set (the
 * Refresh button). Falls back to the last stored snapshot if a live sync fails.
 */
export async function getManifestReport({
  force = false,
}: { force?: boolean } = {}): Promise<ManifestReport> {
  let history: Snapshot[] = []
  try {
    history = await readSnapshots()
  } catch {
    history = []
  }

  const latest = history.at(-1)
  const ageMs = latest ? Date.now() - new Date(latest.takenAt).getTime() : Infinity

  // Fresh enough — serve it without touching Figma.
  if (!force && latest && ageMs < SYNC_TTL_MS) {
    return buildReport(latest, history)
  }

  let live: Snapshot
  try {
    live = await fetchLiveSnapshot()
  } catch (e) {
    // Offline / rate-limited / token trouble: fall back to the last snapshot so
    // the view still renders, flagged as a failed sync.
    const error = e instanceof Error ? e.message : String(e)
    if (latest) return buildReport(latest, history, { ok: false, error })
    return {
      ok: false,
      error,
      teamName: "Design",
      takenAt: "",
      files: [],
      projects: [],
      diff: null,
      history: summarizeHistory(history),
    }
  }

  // Persist: today's file always reflects the latest look at the workspace.
  // Best-effort — a read-only data/ dir (permissions, deployed env) must not
  // 500 the page; the live report still renders from memory.
  try {
    await mkdir(SNAPSHOT_DIR, { recursive: true })
    await writeFile(
      path.join(SNAPSHOT_DIR, `${live.date}.json`),
      JSON.stringify(live, null, 2) + "\n"
    )
  } catch (err) {
    console.error(`figma manifest: could not persist snapshot: ${err instanceof Error ? err.message : err}`)
  }

  return buildReport(live, history)
}

function summarizeProjects(files: ManifestFile[]) {
  const byProject = new Map<
    string,
    { id: string; name: string; fileCount: number }
  >()
  for (const f of files) {
    const entry = byProject.get(f.projectId) ?? {
      id: f.projectId,
      name: f.projectName,
      fileCount: 0,
    }
    entry.fileCount += 1
    byProject.set(f.projectId, entry)
  }
  return [...byProject.values()].sort((a, b) => b.fileCount - a.fileCount)
}

function summarizeHistory(snapshots: Snapshot[]): SnapshotSummary[] {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  return sorted
    .map((snap, i) => {
      const prev = sorted[i - 1]
      const diff = prev ? diffSnapshots(prev, snap) : null
      return {
        date: snap.date,
        takenAt: snap.takenAt,
        fileCount: snap.files.length,
        added: diff?.changes.filter((c) => c.kind === "added").length ?? 0,
        modified:
          diff?.changes.filter((c) => c.kind === "modified").length ?? 0,
        removed: diff?.changes.filter((c) => c.kind === "removed").length ?? 0,
      }
    })
    .reverse()
}
