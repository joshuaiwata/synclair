import { HubPage } from "@/components/hub-page"
import { getGitDates } from "@/lib/system/git-dates"
import { readArchivedSources } from "@/lib/system/knowledge/archived-sources"
import { getKnowledgeSources } from "@/lib/system/knowledge/sources"
import { readSummaryContent, readSummaryIndex } from "@/lib/system/knowledge/summary"
import { readSummaryQueue } from "@/lib/system/knowledge/summary-queue"

import { SourcesTable } from "./sources-table"
import type { SummaryItem } from "./summary-section"

export const dynamic = "force-dynamic"

// A summary is stale when any knowledge input was committed after it was
// generated: the manifest, the distilled digests, or raw-source mirrors under
// data/knowledge/. Projects with more inputs (a domain skill, extra digest
// skills) extend this list when they reseed.
const KNOWLEDGE_INPUTS = [
  "lib/system/knowledge/sources.ts", // the manifest, not the machinery around it
  ".claude/skills/product-spec/",
  "data/knowledge/",
]

// …but the summaries' own outputs don't count as inputs, or generating one
// summary would mark every other one stale.
const SUMMARY_OUTPUTS = ["data/knowledge/summaries/", "data/knowledge/summary-queue.json"]

async function latestKnowledgeChange(): Promise<number> {
  const dates = await getGitDates()
  let latest = 0
  for (const [file, { updatedAt }] of dates) {
    if (SUMMARY_OUTPUTS.some((p) => file.startsWith(p))) continue
    if (!KNOWLEDGE_INPUTS.some((p) => file.startsWith(p))) continue
    const t = Date.parse(updatedAt)
    if (!Number.isNaN(t) && t > latest) latest = t
  }
  return latest
}

async function getSummaries(): Promise<SummaryItem[]> {
  const [index, queue, knowledgeChangedAt] = await Promise.all([
    readSummaryIndex(),
    readSummaryQueue(),
    latestKnowledgeChange(),
  ])

  return Promise.all(
    index.summaries.map(async (def) => {
      const version = def.versions.find((v) => v.id === def.current) ?? null
      const content = version ? await readSummaryContent(version.id) : null
      return {
        id: def.id,
        title: def.title,
        kind: def.kind,
        instructions: def.instructions,
        archived: def.archived,
        current: version && content !== null ? { version, content } : null,
        versions: [...def.versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        queued: queue.some((r) => r.summaryId === def.id),
        stale: !!version && knowledgeChangedAt > Date.parse(version.createdAt),
      }
    })
  )
}

export default async function KnowledgePage() {
  const sources = getKnowledgeSources()
  const [archivedSourceIds, summaries] = await Promise.all([
    readArchivedSources(),
    getSummaries(),
  ])
  const activeCount = sources.filter((s) => !archivedSourceIds.includes(s.id)).length

  return (
    <HubPage
      title="Knowledge"
      meta={
        <span className="text-muted-foreground text-xs">
          {activeCount} source{activeCount === 1 ? "" : "s"}
        </span>
      }
      lead={
        <>
          The project&rsquo;s sources of truth — specs, PRDs, Figma, and decks — so agents never
          start blank. Sources are <strong>linked, never copied</strong>: the raw docs stay
          canonical in Drive/Figma; the repo holds the distilled digest (the{" "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">Distilled into</code>{" "}
          column). Read the digest first; dig into the raw source only when it&rsquo;s not enough —
          then write the durable part back.
        </>
      }
    >
      <section className="flex flex-col gap-3">
        <SourcesTable sources={sources} archivedIds={archivedSourceIds} summaryItems={summaries} />
        <p className="text-muted-foreground/70 text-xs">
          Add a source per area of the app as you locate it. The schema is source-agnostic on
          purpose — a project&rsquo;s knowledge is a combo of written specs, Figma, and decks. The{" "}
          <strong>Summary</strong> tab is the distilled onboarding brief — reprocess it after adding
          knowledge.
        </p>
      </section>
    </HubPage>
  )
}
