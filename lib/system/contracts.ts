import { readContractsArtifact } from "@/lib/artifacts/contracts"

/**
 * THE SEAM, read side — which screens call which endpoints.
 *
 * `.synclair/cache/contracts.json` is written by `npm run scan:contracts` and is DERIVED
 * end to end: no model, no network, re-runnable on a hook. That is what makes it
 * different from the System Map's authored `api[]` list, which is one person's
 * reading at one moment and rots invisibly.
 *
 * Everything here degrades to "we don't know" rather than to zero. A clone that
 * has never run the scan has no seam, which is not the same as a product whose
 * screens call nothing — and the difference decides whether someone deletes a
 * live endpoint.
 */


export interface ContractProvider {
  method: string
  path: string
  source: string
  kind?: string
}

export interface ContractLink {
  method: string
  path: string
  /** Repo-relative file containing the call. */
  consumer: string
  consumerApp: string
  providers: string[]
  providerApp: string
  /** `cross-app` crosses a deployment boundary; `intra-app` is a screen calling its own API. */
  scope?: "cross-app" | "intra-app"
  matchType?: "exact" | "candidate"
}

export interface ContractsReport {
  generatedAt: string
  generator?: string
  scanned?: string[]
  providers: ContractProvider[]
  links: ContractLink[]
  diagnostics?: {
    opaqueCalls?: number
    unmatchedByReason?: Record<string, number>
    /**
     * `null` means the unused-endpoint claim was WITHHELD, not that there are
     * none. Never render a null as an empty list — see `orphanConfidence`.
     */
    orphanProviders?: ContractProvider[] | null
    orphanConfidence?: { trustworthy: boolean; why: string | null; coverage?: number }
  }
}

/** Read the seam. `null` (not a throw) when the scan has never run.
 *  Validation lives in the artifact module (one owner — B3). */
export async function getContracts(): Promise<ContractsReport | null> {
  return (readContractsArtifact() as ContractsReport | null) ?? null
}

const key = (method: string, p: string) => `${method.toUpperCase()} ${p}`

/**
 * Callers of each endpoint, indexed for a table render. Endpoints with no
 * recorded caller are simply absent — the caller decides how to say "none
 * found", because that phrasing depends on whether the scan was trustworthy.
 */
export function callersByEndpoint(report: ContractsReport | null): Map<string, ContractLink[]> {
  const out = new Map<string, ContractLink[]>()
  for (const l of report?.links ?? []) {
    const k = key(l.method, l.path)
    const list = out.get(k)
    if (list) list.push(l)
    else out.set(k, [l])
  }
  return out
}

/**
 * Endpoints called from a given set of source files — the pages-map side of the
 * join. A route passes its own source closure and gets back what it talks to.
 */
export function endpointsForFiles(
  report: ContractsReport | null,
  files: string[]
): ContractLink[] {
  if (!report || files.length === 0) return []
  const set = new Set(files)
  const seen = new Set<string>()
  const out: ContractLink[] = []
  for (const l of report.links) {
    if (!set.has(l.consumer)) continue
    const k = key(l.method, l.path)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(l)
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
}

/**
 * Whether this report may assert that an endpoint is unused.
 *
 * Mirrors the scanner's own gate so the page cannot make a claim the data
 * refused to. A static scan cannot prove absence, and "no caller found" must
 * never render as "safe to delete".
 */
export function mayAssertUnused(report: ContractsReport | null): boolean {
  return report?.diagnostics?.orphanConfidence?.trustworthy === true
}
