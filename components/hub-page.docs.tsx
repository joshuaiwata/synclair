import { PageBody, PageLead } from "@/components/hub-page"
import { SectionHeader } from "@/components/section-header"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  examples: [
    {
      title: "A whole page",
      description:
        "The 90% case: title, an optional right `meta` slot, one `lead` paragraph, then sections. Renders its own PageHeader, so it's shown as code (it needs the sidebar shell to run).",
      code: `<HubPage
  title="Environment"
  meta={<span className="text-muted-foreground font-mono text-xs">stack & services</span>}
  lead={<>The environment this runs in — the product itself, and Synclair beside it.</>}
>
  <section className="flex flex-col gap-3">
    <SectionHeader title="Stack" hint="what it's built on" />
    {/* … */}
  </section>
</HubPage>`,
      preview: { kind: "code" },
    },
    {
      title: "Lead",
      description: "The single muted intro paragraph that opens a page, capped at a readable width.",
      code: `<PageLead>The project's sources of truth — so agents never start blank.</PageLead>`,
      preview: live(
        <PageLead>The project&rsquo;s sources of truth — so agents never start blank.</PageLead>
      ),
    },
    {
      title: "Body only",
      description:
        "Compose `PageBody` + `PageLead` directly when `<main>` must sit inside a provider (e.g. an editor context) that the header stays outside of.",
      code: `<PageBody>
  <PageLead>What your agents build with.</PageLead>
  <SectionHeader title="Skills" hint=".claude/skills/" />
</PageBody>`,
      preview: live(
        <PageBody className="p-0">
          <PageLead>What your agents build with.</PageLead>
          <SectionHeader title="Skills" hint=".claude/skills/" />
        </PageBody>
      ),
    },
  ],
  props: [
    { name: "title", type: "string", description: "Page title, rendered in the sticky header." },
    {
      name: "meta",
      type: "ReactNode",
      description: "Right-aligned header slot — mono path text, a status badge, or an action.",
    },
    {
      name: "lead",
      type: "ReactNode",
      description: "The single intro paragraph. One lead per page; sections carry their own headers.",
    },
    { name: "children", type: "ReactNode", description: "The page's sections." },
    {
      name: "className",
      type: "string",
      description: "Overrides on the `<main>` (e.g. a wider gap for a long-form page).",
    },
  ],
  notes:
    "The one scaffold every /synclair route composes from — it ended the per-page copy-paste of the header + `max-w-6xl` main + intro lead. Exceptions by design: the library explorer (its own breadcrumb shell) opts out. Exports `HubPage` (all-in-one), plus `PageBody` and `PageLead` for pages that need to wrap `<main>` in a provider.",
}

export default doc
