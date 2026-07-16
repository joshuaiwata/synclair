import { GitCommitHorizontal } from "lucide-react"

import { HubPage } from "@/components/hub-page"
import { SectionHeader } from "@/components/section-header"
import { StatusBadge } from "@/components/status-badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getRecentCommits, getRepoStatus } from "@/lib/system/git-log"

import { CommitsTable } from "./commits-table"

export const dynamic = "force-dynamic"

export default async function GithubPage() {
  const [commits, repo] = await Promise.all([getRecentCommits(50), getRepoStatus()])

  return (
    <HubPage
      title="GitHub"
      meta={
        <>
          <span className="text-muted-foreground font-mono text-xs">{repo.branch}</span>
          {repo.aheadCount > 0 && (
            <StatusBadge status="warning">
              {repo.aheadCount} commit{repo.aheadCount === 1 ? "" : "s"} not pushed
            </StatusBadge>
          )}
        </>
      }
      lead={
        <>
          The repo&rsquo;s recent history, read from local git — what changed, who changed it, and
          when. Click a commit to read its message and diff without leaving Synclair. Commits marked{" "}
          <strong>not pushed</strong> exist only on this machine until a{" "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">git push</code> —
          teammates can&rsquo;t see them yet.
        </>
      }
    >
      <section className="flex flex-col gap-3">
        <SectionHeader title="Recent commits" hint="local git · lib/system/git-log.ts" />
        {commits.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GitCommitHorizontal />
              </EmptyMedia>
              <EmptyTitle>No commits found</EmptyTitle>
              <EmptyDescription>
                This doesn&rsquo;t look like a git repository — commits appear here once there&rsquo;s
                local history to read.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <CommitsTable commits={commits} webUrl={repo.webUrl} />
        )}
      </section>
    </HubPage>
  )
}
