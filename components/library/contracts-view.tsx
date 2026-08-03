import { Badge } from "@/components/ui/badge"
import type { ContractsReport } from "@/lib/system/contracts"
import { mayAssertUnused } from "@/lib/system/contracts"

/**
 * CONTRACTS — the derived join between callers and the endpoints they call.
 *
 * This needs its own tab rather than being folded into the API list, and the
 * reason is a real number: the authored `api[]` on a live clone documents 25
 * endpoints while the scanner finds 80. Enriching those 25 rows with a "called
 * by" column left 24 of them reading "not seen" and hid every link we actually
 * found. Two datasets of different size and different provenance want two
 * surfaces — one authored and curated, one derived and complete.
 *
 * Everything here is DERIVED: no model wrote it, and re-running the scan
 * reproduces it exactly. That is also why it can be blunt about what it does not
 * know — the diagnostics are part of the answer, not an appendix.
 */
export function ContractsView({ contracts }: { contracts: ContractsReport }) {
  const { providers = [], links = [], diagnostics } = contracts

  // Grouped by service pair: "which app depends on which" is the question a
  // reviewer asks, not which of nine files does the fetching.
  const pairs = new Map<string, { n: number; scope?: string }>()
  for (const l of links) {
    const key =
      l.scope === "cross-app" ? `${l.consumerApp} → ${l.providerApp}` : `${l.consumerApp} → its own API`
    const prev = pairs.get(key)
    pairs.set(key, { n: (prev?.n ?? 0) + 1, scope: l.scope })
  }

  const callersByPath = new Map<string, Set<string>>()
  for (const l of links) {
    const k = `${l.method} ${l.path}`
    if (!callersByPath.has(k)) callersByPath.set(k, new Set())
    callersByPath.get(k)!.add(l.consumerApp)
  }

  const reasons = Object.entries(diagnostics?.unmatchedByReason ?? {}).sort((a, b) => b[1] - a[1])
  const REASON_MEANS: Record<string, string> = {
    no_provider: "the caller asks for a path nothing in this system serves — often a real bug",
    internal_only: "provider and caller are the same file — a local helper, not a seam",
    method_mismatch: "the path exists but not with that verb",
    external_host: "a third-party API (Stripe, Google…), correctly not one of ours",
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-xs">
        Derived by <code>scan:contracts</code> — it reads route handlers and call sites and records
        where they name the same path. It changes no application code and creates no coupling;
        it only notices what the source already says.
      </p>

      <div className="flex flex-wrap gap-2">
        <Stat label="Endpoints found" value={providers.length} />
        <Stat label="Calls linked" value={links.length} />
        <Stat label="Service pairs" value={pairs.size} />
      </div>

      {pairs.size > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Who calls whom</h3>
          <div className="flex flex-col gap-1.5">
            {[...pairs.entries()]
              .sort((a, b) => b[1].n - a[1].n)
              .map(([pair, { n, scope }]) => (
                <div
                  key={pair}
                  className="bg-card flex items-center gap-2 rounded border px-3 py-1.5 text-xs"
                >
                  <span className="font-mono">{pair}</span>
                  {scope === "cross-app" && (
                    <span
                      className="text-muted-foreground/60 text-2xs"
                      title="Crosses a service boundary — can break on someone else's deploy"
                    >
                      ↗
                    </span>
                  )}
                  <span className="text-muted-foreground ml-auto tabular-nums">{n} call(s)</span>
                </div>
              ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          Every endpoint the scanner found{" "}
          <span className="text-muted-foreground text-xs font-normal">
            ({providers.length}, vs the {"{"}authored{"}"} digest on the API tab)
          </span>
        </h3>
        <div className="overflow-hidden rounded-lg border">
          <div className="max-h-[28rem] overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {providers.map((p, i) => {
                  const callers = callersByPath.get(`${p.method} ${p.path}`)
                  return (
                    <tr key={`${p.method}${p.path}${i}`} className="border-b last:border-0">
                      <td className="w-20 px-3 py-1.5">
                        <Badge variant="secondary" className="text-3xs font-mono">
                          {p.method}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 font-mono">{p.path}</td>
                      <td className="text-muted-foreground px-2 py-1.5 text-right">
                        {callers ? (
                          [...callers].join(", ")
                        ) : mayAssertUnused(contracts) ? (
                          <span className="text-muted-foreground/70">no caller found</span>
                        ) : (
                          <span className="text-muted-foreground/50">not seen</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/**
       * The diagnostics are the honest half. A seam that silently drops what it
       * couldn't parse reads exactly like a clean one, so what we could NOT
       * resolve is shown with the same weight as what we could.
       */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">What this scan could not resolve</h3>
        <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
          {diagnostics?.opaqueCalls ? (
            <li>
              <span className="text-foreground tabular-nums">{diagnostics.opaqueCalls}</span> call(s)
              build their URL at runtime — excluded, not assumed absent.
            </li>
          ) : null}
          {reasons.map(([reason, n]) => (
            <li key={reason}>
              <span className="text-foreground tabular-nums">{n}</span>{" "}
              <code className="text-2xs">{reason}</code> — {REASON_MEANS[reason] ?? "unmatched"}
            </li>
          ))}
          {!mayAssertUnused(contracts) && (
            <li className="text-warning-foreground">
              Unused-endpoint check withheld: {diagnostics?.orphanConfidence?.why}. A static scan
              cannot prove absence, so nothing here should be deleted on its say-so.
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card rounded-lg border px-4 py-2">
      <div className="text-muted-foreground text-2xs tracking-wide uppercase">{label}</div>
      <div className="text-lg tabular-nums">{value}</div>
    </div>
  )
}
