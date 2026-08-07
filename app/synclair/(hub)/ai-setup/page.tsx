import { Plus } from "lucide-react"

import { AgentAsk } from "@/components/agent-ask"
import { SourceEditorProvider } from "@/components/blocks/source-editor"
import { PageBody, PageTitle } from "@/components/hub-page"
import { PageHeader } from "@/components/page-header"
import { StepLadder } from "@/components/step-ladder"
import { Badge } from "@/components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getAgents } from "@/lib/system/agents"
import { getGlobalCapabilities } from "@/lib/system/global-skills"
import { isHostedRuntime } from "@/lib/system/hub-identity"
import { getMcpServers } from "@/lib/system/mcp-servers"
import { getSkills } from "@/lib/system/skills"
import {
  compositionLadder,
  priorityLadder,
  viewLoop,
} from "@/lib/synclair-data"

import { CapabilityTables } from "./capability-tables"
import { McpServerTables } from "./mcp-tables"

export const dynamic = "force-dynamic"

export default async function AiSetupPage() {
  // Personal & global reads the VIEWER'S ~/.claude — a per-machine view with
  // no hosted equivalent (the container has no "you"). Local only, by nature.
  const hosted = isHostedRuntime()
  const [skills, agents, global] = await Promise.all([
    getSkills(),
    getAgents(),
    hosted ? Promise.resolve([]) : getGlobalCapabilities(),
  ])
  const servers = getMcpServers()

  return (
    <>
      <PageHeader title="AI Setup">
        <AgentAsk
          label="Add capability"
          icon={<Plus />}
          title="Add a skill or agent"
          prompt="Add a new skill or agent to this project — check first that no existing capability already covers it."
          note="synclair skill · capability gate"
          align="end"
        />
      </PageHeader>

      <SourceEditorProvider>
        <PageBody>
          <PageTitle
            title="AI Setup"
            lead={
              <>
                What your agents build with — this repo&rsquo;s skills, agents,
                connected services, and the method they follow. Skills and
                agents read live from{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  .claude/
                </code>
                ; click any row to read or edit its markdown in place. The{" "}
                <span className="font-medium text-foreground">Origin</span> tag
                marks what ships with the Synclair foundation (and syncs from
                upstream) vs. what&rsquo;s this repo&rsquo;s own — personal
                &amp; global capabilities are on their own tab.
              </>
            }
          />

          <Tabs defaultValue="skills" className="gap-6">
            <TabsList>
              {[
                { value: "skills", label: "Skills", count: skills.length },
                { value: "agents", label: "Agents", count: agents.length },
                { value: "mcp", label: "MCP servers", count: servers.length },
                {
                  value: "method",
                  label: "How we build",
                  count: priorityLadder.length,
                },
                ...(hosted
                  ? []
                  : [
                      {
                        value: "global",
                        label: "Personal & global",
                        count: global.length,
                      },
                    ]),
              ].map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                  <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                    {t.count}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="skills" className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">
                Project skills from{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  .claude/skills/
                </code>{" "}
                — reusable know-how any agent reads before a matching task,
                grouped by what they&rsquo;re for.
              </p>
              <CapabilityTables kind="skill" label="Skill" rows={skills} />
            </TabsContent>

            <TabsContent value="agents" className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">
                Project agents from{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  .claude/agents/
                </code>{" "}
                — diggers and specialists that run in their own context, grouped
                by what they&rsquo;re for.
              </p>
              <CapabilityTables kind="agent" label="Agent" rows={agents} />
            </TabsContent>

            <TabsContent value="mcp" className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">
                The servers an agent in this repo can call. Click one to see
                everything it serves — the synclair server&rsquo;s list is live
                from the same registry both its transports share.
              </p>
              <McpServerTables servers={servers} />
            </TabsContent>

            <TabsContent value="method" className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">
                The foundation-first method any agent applies to every view it
                builds or documents. Figma binds PRDs to the front end as a
                guide for intent — it informs, never restricts. Every view
                decision walks this ladder.
              </p>
              <StepLadder items={priorityLadder} orientation="horizontal" />
              <Accordion type="single" collapsible>
                <AccordionItem value="composition">
                  <AccordionTrigger>
                    Composition ladder — every piece of a view
                  </AccordionTrigger>
                  <AccordionContent>
                    <StepLadder items={compositionLadder} />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="loop">
                  <AccordionTrigger>
                    Per-view loop — the five steps
                  </AccordionTrigger>
                  <AccordionContent>
                    <StepLadder
                      items={viewLoop.map((s) => ({
                        title: s.step,
                        detail: s.detail,
                      }))}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>

            <TabsContent value="global" className="flex flex-col gap-3">
              <div className="overflow-hidden rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-52">Name</TableHead>
                      <TableHead className="w-24">Kind</TableHead>
                      <TableHead>Purpose</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {global.map((row) => (
                      <TableRow key={`${row.kind}-${row.name}`}>
                        <TableCell className="font-medium">
                          {row.name}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.kind === "plugin" ? "secondary" : "outline"
                            }
                          >
                            {row.kind}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-normal text-muted-foreground">
                          {row.purpose}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground/70">
                Personal skills from{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  ~/.claude/skills/
                </code>{" "}
                plus enabled plugins. Marketplace-enabled skills are managed
                separately and aren&rsquo;t listed here.
              </p>
            </TabsContent>
          </Tabs>
        </PageBody>
      </SourceEditorProvider>
    </>
  )
}
