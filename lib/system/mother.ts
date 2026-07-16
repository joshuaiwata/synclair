import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

/**
 * CALL HOME — the opt-in freshness check against the mother Synclair repo,
 * the shadcn-style "your copy can ask upstream what's new" seam.
 *
 * Every clone owns its code outright (clone, don't subscribe — foundation-model
 * §8); nothing auto-updates. But a clone that WANTS to know when the foundation
 * moved can opt in, and Synclair will compare its recorded baseline against the
 * mother repo's `main` via GitHub's public compare API — no git remote, no
 * auth, no telemetry (the call sends nothing but the baseline sha in the URL).
 * Updates still land the deliberate way: the `synclair-sync` skill.
 *
 * Source of truth is `data/mother.json` (SEED — per-clone, never syncs):
 *   { "callHome": false, "commit": "<mother sha at last sync>", "syncedAt": "" }
 *
 * - `callHome` — the opt-in. Absent/false ⇒ Synclair never phones anywhere.
 * - `commit`   — the foundation BASELINE: the mother-repo sha this clone last
 *   synced to. Stamped by `scripts/synclair-sync.sh pull`, or recorded by hand
 *   with `npm run call-home -- --anchor <sha|latest>`.
 *
 * Blank in the mother repo itself — the mother has no one to call.
 */

/** The mother repo, `owner/name` — the upstream every clone syncs from. */
export const MOTHER_REPO = "joshuaiwata/synclair"
export const MOTHER_URL = `https://github.com/${MOTHER_REPO}`

const MOTHER_PATH = path.join(process.cwd(), "data", "mother.json")

export interface MotherRecord {
  /** The opt-in: false/absent ⇒ never call home. */
  callHome: boolean
  /** Mother-repo sha this clone's foundation was last synced to ("" = unanchored). */
  commit: string
  /** ISO date the baseline was recorded. */
  syncedAt?: string
}

export interface FoundationCommit {
  sha: string
  title: string
  url: string
  date?: string
}

export type FoundationStatus =
  /** Call-home is off (the default) — nothing was checked. */
  | { state: "off"; record: MotherRecord }
  /** Opted in but no baseline recorded yet — nothing to compare against. */
  | { state: "unanchored"; record: MotherRecord }
  /** Opted in, but the mother repo couldn't be reached (offline, rate-limited). */
  | { state: "unreachable"; record: MotherRecord }
  /** Baseline matches the mother's main. */
  | { state: "current"; record: MotherRecord }
  /** The mother's main has moved past the baseline. */
  | {
      state: "behind"
      record: MotherRecord
      behindBy: number
      /** Newest-first; capped by the API page (enough to read, not a changelog). */
      commits: FoundationCommit[]
      /** Human diff view on GitHub (baseline...main). */
      compareUrl: string
    }

/**
 * The mother repo is private (for now), so the compare call needs a GitHub
 * identity that can read it: `GITHUB_TOKEN`/`GH_TOKEN` env first, then the
 * local `gh` CLI's active account. Falls through to anonymous — which starts
 * working the day the repo goes public. Cached per server process.
 */
let tokenPromise: Promise<string | null> | undefined
function getGithubToken(): Promise<string | null> {
  tokenPromise ??= (async () => {
    const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
    if (env) return env
    try {
      const { stdout } = await promisify(execFile)("gh", ["auth", "token"], { timeout: 3000 })
      return stdout.trim() || null
    } catch {
      return null
    }
  })()
  return tokenPromise
}

export async function getMotherRecord(): Promise<MotherRecord> {
  try {
    const raw = JSON.parse(await readFile(MOTHER_PATH, "utf8"))
    return {
      callHome: raw.callHome === true,
      commit: typeof raw.commit === "string" ? raw.commit : "",
      syncedAt: typeof raw.syncedAt === "string" ? raw.syncedAt : undefined,
    }
  } catch {
    return { callHome: false, commit: "" }
  }
}

/**
 * The one network call, and only when opted in: GitHub's public compare API
 * (`/compare/<baseline>...main`). Cached for an hour so the hub doesn't hit
 * the unauthenticated rate limit; failures degrade to `unreachable`, never
 * an error surface.
 */
export async function getFoundationStatus(): Promise<FoundationStatus> {
  const record = await getMotherRecord()
  if (!record.callHome) return { state: "off", record }
  if (!record.commit) return { state: "unanchored", record }

  try {
    const token = await getGithubToken()
    const res = await fetch(
      `https://api.github.com/repos/${MOTHER_REPO}/compare/${record.commit}...main`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(4000),
        next: { revalidate: 3600 },
      }
    )
    if (!res.ok) return { state: "unreachable", record }
    const data = (await res.json()) as {
      ahead_by?: number
      html_url?: string
      commits?: { sha: string; html_url: string; commit: { message: string; committer?: { date?: string } } }[]
    }
    const behindBy = data.ahead_by ?? 0
    if (behindBy === 0) return { state: "current", record }
    const commits = (data.commits ?? [])
      .map((c) => ({
        sha: c.sha,
        title: c.commit.message.split("\n")[0],
        url: c.html_url,
        date: c.commit.committer?.date,
      }))
      .reverse()
    return {
      state: "behind",
      record,
      behindBy,
      commits,
      compareUrl: data.html_url ?? `${MOTHER_URL}/compare/${record.commit}...main`,
    }
  } catch {
    return { state: "unreachable", record }
  }
}
