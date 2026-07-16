import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowUpRight,
  Bot,
  Component,
  FileText,
  GitCommitHorizontal,
  Library,
  Palette,
  PencilRuler,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Waypoints,
} from "lucide-react"

import { HubPage } from "@/components/hub-page"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { groupByCategory } from "@/lib/system/capability-categories"
import { getAgents } from "@/lib/system/agents"
import { synclair } from "@/lib/system/routes"
import { getSkills } from "@/lib/system/skills"
import { project } from "@/lib/system/seed/project"

import { FlywheelDiagram, RobotHead, SharedSurfaceDiagram, TwoRenderingsDiagram } from "./diagrams"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: `How it works — Synclair`,
  description:
    "What Synclair is and how it works — the shared surface between a product team and the AI they build with. The knowledge flywheel, the agent crew, and the FAQ.",
}

/** A titled band: an eyebrow, a heading, an optional lead, then content. */
function Section({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string
  title: string
  lead?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {eyebrow}
        </span>
        <h2 className="text-xl font-semibold tracking-tight text-balance">{title}</h2>
        {lead && <p className="text-body-content max-w-2xl text-sm leading-relaxed">{lead}</p>}
      </div>
      {children}
    </section>
  )
}

/** The kinds of agents Synclair fields — a few types, not a roster. */
const AGENT_TYPES = [
  {
    icon: ScanSearch,
    name: "Explorers",
    what: "Survey a whole codebase, PRD or Figma file and bring back the gist — so the hub starts full, not blank.",
  },
  {
    icon: FileText,
    name: "Retrievers",
    what: "Fetch just the requirements or design for the task at hand, reading the heavy source so you don't have to.",
  },
  {
    icon: PencilRuler,
    name: "Builders",
    what: "Turn requirements into views and components, on the design system — then document them as they go.",
  },
  {
    icon: ShieldCheck,
    name: "Reviewers",
    what: "Adversarially check the work — visual QA, library health, doc quality — before it's called done.",
  },
]

const HUB_SECTIONS = [
  { icon: Library, label: "Knowledge", desc: "specs, PRDs & distilled briefs", href: synclair("/knowledge") },
  { icon: Waypoints, label: "System Map", desc: "what the codebase is made of", href: synclair("/system") },
  { icon: Component, label: "Library", desc: "components, blocks & templates", href: synclair("/components") },
  { icon: Palette, label: "Foundations", desc: "design tokens & theme", href: synclair("/foundations") },
  { icon: Bot, label: "AI Setup", desc: "the skills, agents & MCP servers", href: synclair("/ai-setup") },
  { icon: GitCommitHorizontal, label: "GitHub", desc: "recent commits — git is the DB", href: synclair("/github") },
]

const FAQ = [
  {
    q: "Is Synclair part of my app?",
    a: "No. Synclair documents your app's design system and context — it doesn't execute it. It's not a runtime dependency, not a package your app imports, and not a live playground bound to your stack. It's a workbench that sits beside the product and describes it.",
  },
  {
    q: "Do I have to move my docs and designs into it?",
    a: "No — link, don't copy. PRDs, decks and Figma files stay canonical in Drive, Figma and GitHub, and Synclair links to them. What lives in the repo is the distilled digest, not a pasted 40-page dump that goes stale the day the doc is edited.",
  },
  {
    q: "What's a 'digger'?",
    a: "A narrow retrieval agent — an Explorer or Retriever. Instead of one all-knowing assistant, Synclair sends a specialist to read a heavy source in a throwaway context and return just the distilled result, so the main conversation stays clean.",
  },
  {
    q: "How does the AI stay in sync with the team?",
    a: "Every fact lives once in the repo and is projected two ways — a page for humans and a machine-readable form for agents. Because both come from the same bytes, the docs a person browses and the context an agent loads can't drift apart.",
  },
  {
    q: "Does it only work for web apps?",
    a: "The workbench UI is always web (Next + shadcn), but what it documents is platform-agnostic. A swappable 'adapter' handles how tokens are exported, how components are previewed, and how they're distributed — so the same hub can front a React Native or native project.",
  },
  {
    q: "Where is everything stored?",
    a: "In git. Synclair is multiplayer without a server: each person runs the hub from a clone and the repo is the shared database. If a change deserves a commit message it's a file in git; sync is git pull / git push.",
  },
  {
    q: "How do improvements reach my project?",
    a: "Each project is a clone of the Synclair foundation and diverges freely — nothing syncs automatically. When you want foundation updates you pull them as an ordinary git merge; your project's own brand and knowledge (the 'seed') never sync in either direction.",
  },
]

export default async function HowItWorksPage() {
  const [skills, agents] = await Promise.all([getSkills(), getAgents()])
  const skillTeams = groupByCategory(skills, (s) => s.category)

  return (
    <HubPage title="How it works" className="gap-16 pb-24">
        {/* Hero — the why, up front. */}
        <section className="flex flex-col gap-6 pt-2">
          <div className="flex flex-col gap-4">
            <Badge variant="secondary" className="w-fit gap-1.5">
              <Sparkles className="size-3" />
              What is Synclair?
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              One shared surface for your product team and the AI they build with.
            </h1>
            <p className="text-body-content max-w-2xl text-base leading-relaxed">
              Synclair was born from a real need. Product teams now build alongside AI — but
              the people live in Figma, Notion and Drive, while the AI starts every session
              blank, re-deriving context and drifting from the design system. Synclair is the
              one place both read from: design tokens, components, and project knowledge, kept
              in sync so humans and agents are never working from different truths.
            </p>
          </div>
          <SharedSurfaceDiagram />
        </section>

        {/* Why it exists — before / after. */}
        <Section
          eyebrow="The problem"
          title="Humans and AI were building from different truths"
          lead="The gap isn't talent — it's context. Everyone has the information somewhere; nobody shares one surface. Synclair closes that gap."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Without a shared surface
              </span>
              <ul className="text-body-content flex flex-col gap-2 text-sm">
                <li>Knowledge scattered across Figma, Drive, Notion &amp; heads</li>
                <li>The AI starts blank every session, re-deriving what&rsquo;s already known</li>
                <li>Generated code drifts from the real design system</li>
                <li>Docs for humans and context for agents fall out of sync</li>
              </ul>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <span className="text-foreground text-xs font-medium tracking-wide uppercase">
                With Synclair
              </span>
              <ul className="text-body-content flex flex-col gap-2 text-sm">
                <li>One aligned source of truth — tokens, components, knowledge</li>
                <li>Agents load the same context every time and never start blank</li>
                <li>Guardrails keep generated work on the system</li>
                <li>Every fact is projected to both a human page and an agent-readable form</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* How it works — the knowledge flywheel. */}
        <Section
          eyebrow="How it works"
          title="A knowledge flywheel that spins faster the more you build"
          lead="First, diggers explore — they read the code, the PRDs and the designs to seed the hub. From then on it&rsquo;s a loop: whatever you build documents itself into the shared surface as you go, so the next thing you build starts from everything built before it. Nobody stops to write docs — the knowledge accrues on its own."
        >
          <FlywheelDiagram />
        </Section>

        {/* Teams of experts — the robot crew. */}
        <Section
          eyebrow="The crew"
          title="A crew of specialist agents, not one know-it-all"
          lead={
            <>
              Each agent is a specialist that runs in its <span className="text-foreground font-medium">own</span>{" "}
              context window and hands back only what matters — so the main conversation never
              fills up. Today this project fields{" "}
              <span className="text-foreground font-medium">{agents.length} agents</span>, and they
              come in a few types:
            </>
          }
        >
          <div className="flex flex-col items-center gap-2 py-2">
            <RobotHead className="text-primary h-28 w-auto" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {AGENT_TYPES.map((t) => (
              <div key={t.name} className="flex items-start gap-3 rounded-lg border p-4">
                <span className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                  <t.icon className="size-4" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{t.name}</span>
                  <span className="text-muted-foreground text-xs leading-snug">{t.what}</span>
                </span>
              </div>
            ))}
          </div>
          <Link
            href={synclair("/ai-setup")}
            className="text-muted-foreground hover:text-foreground group flex w-fit items-center gap-1.5 text-sm transition-colors"
          >
            See the full crew on AI Setup
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </Section>

        {/* One source, two renderings. */}
        <Section
          eyebrow="The core idea"
          title="One source, two renderings — they can't drift"
          lead="Every token and every component's usage lives once in the repo. Synclair projects it two ways: an HTML page a person browses, and a machine-readable form an agent loads. Same bytes, so they stay in lockstep."
        >
          <TwoRenderingsDiagram />
        </Section>

        {/* Skills — the shared playbook, kept light. */}
        <Section
          eyebrow="The shared playbook"
          title="Skills — reusable know-how, loaded only when it's needed"
          lead="A skill is a short guide any agent reads before a matching task. Its one-line description is always in context (cheap); the full body loads only when it's relevant — so a big playbook costs almost nothing until the moment it applies."
        >
          <div className="flex flex-wrap gap-2">
            {skillTeams.flatMap((team) => team.items).map((s) => (
              <span
                key={s.name}
                title={s.summary}
                className="bg-muted/50 hover:bg-muted flex items-center rounded-md border px-2 py-1 font-mono text-xs transition-colors"
              >
                {s.name}
              </span>
            ))}
          </div>
          <Link
            href={synclair("/ai-setup")}
            className="text-muted-foreground hover:text-foreground group flex w-fit items-center gap-1.5 text-sm transition-colors"
          >
            Read any skill on AI Setup
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </Section>

        {/* What's inside the hub — a mini map. */}
        <Section
          eyebrow="Explore"
          title="What's inside the hub"
          lead={`Every panel of ${project.name}'s workbench reads live from the repo. Jump in anywhere.`}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {HUB_SECTIONS.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="group hover:bg-muted/40 flex items-start gap-3 rounded-lg border p-4 transition-colors"
              >
                <s.icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    {s.label}
                    <ArrowUpRight className="text-muted-foreground size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="text-muted-foreground text-xs">{s.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </Section>

        {/* FAQ. */}
        <Section eyebrow="FAQ" title="Common questions">
          <Accordion type="single" collapsible className="rounded-lg border px-4">
            {FAQ.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent className="text-body-content leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Section>

        <p className="text-muted-foreground/70 border-t pt-6 text-xs leading-relaxed">
          Synclair is the foundation this project is built on — one aligned source of truth for
          humans and agents. The agent count and skills above read live from{" "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-2xs">.claude/</code>; the
          rest of the hub reads live from the repo. This page is the shared surface explaining
          the shared surface.
        </p>
    </HubPage>
  )
}
