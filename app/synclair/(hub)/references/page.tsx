import { BookMarked, ExternalLink } from "lucide-react"

import { HubPage } from "@/components/hub-page"
import { SectionHeader } from "@/components/section-header"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getReferences } from "@/lib/system/references"
import type { ReferenceCategory } from "@/lib/system/references"
import { synclair } from "@/lib/system/routes"

export const dynamic = "force-dynamic"

// Display order + human labels for the category groups.
const CATEGORY_ORDER: ReferenceCategory[] = [
  "domain",
  "product",
  "pattern",
  "research",
  "article",
]

const CATEGORY_LABEL: Record<ReferenceCategory, string> = {
  domain: "Domain prior art",
  product: "Comparable products",
  pattern: "Patterns & solutions",
  research: "Findings & recommendations",
  article: "Articles & write-ups",
}

export default function ReferencesPage() {
  const references = getReferences()
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: references.filter((r) => r.category === category),
  })).filter((g) => g.items.length > 0)

  return (
    <HubPage
      title="References"
      meta={
        <span className="text-muted-foreground text-xs">
          {references.length} reference{references.length === 1 ? "" : "s"}
        </span>
      }
      lead={
        <>
          A <strong>living library</strong> this project builds over time — domain prior art,
          comparable products, patterns and solutions we adopt, findings, and useful write-ups. It
          grows as project files are added, knowledge grows, and agents research or land on
          recommendations. Distinct from{" "}
          <a href={synclair("/knowledge")} className="underline underline-offset-2">
            Knowledge
          </a>{" "}
          (our own sources of truth) and{" "}
          <a href={synclair("/environment")} className="underline underline-offset-2">
            Environment
          </a>{" "}
          (the framework/tool docs). Backed by{" "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
            lib/system/references.ts
          </code>
          .
        </>
      }
    >
      {groups.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookMarked />
              </EmptyMedia>
              <EmptyTitle>No references yet</EmptyTitle>
              <EmptyDescription>
                This library starts empty and fills as the project grows. Agents
                append here as they research the domain, study comparable
                products, or land on a solution worth remembering — see the
                append convention in <code>lib/system/references.ts</code>.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          groups.map((group) => (
            <section key={group.category} className="flex flex-col gap-3">
              <SectionHeader
                title={CATEGORY_LABEL[group.category]}
                hint={`${group.items.length}`}
              />
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-64">Reference</TableHead>
                      <TableHead>Why it&rsquo;s here</TableHead>
                      <TableHead className="w-40">Added</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.items.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="align-top font-medium">
                          {r.url ? (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline-offset-2 hover:underline"
                            >
                              {r.title}
                            </a>
                          ) : (
                            r.title
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground align-top text-xs whitespace-normal">
                          {r.note ?? "—"}
                        </TableCell>
                        <TableCell className="align-top">
                          {r.addedBy && (
                            <Badge
                              variant="outline"
                              className="text-muted-foreground font-normal"
                            >
                              {r.addedBy}
                            </Badge>
                          )}
                          {r.addedOn && (
                            <span className="text-muted-foreground/70 mt-1 block font-mono text-3xs">
                              {r.addedOn}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          {r.url && (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:text-foreground inline-flex"
                              aria-label={`Open ${r.title}`}
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))
        )}
    </HubPage>
  )
}
