import { PageBody, PageLead, PageTitle } from "@/components/hub-page"
import { SectionHeader } from "@/components/section-header"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  examples: [
    {
      title: "A whole page",
      description:
        "The 90% case: the slim context bar, then the in-body PageTitle (display-scale h1 + right `meta` slot + one `lead` paragraph), then sections. Renders its own PageHeader, so it's shown as code (it needs the sidebar shell to run).",
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
      title: "Page title",
      description:
        "The in-body identity block — the page's real `<h1>` at display scale, the meta slot beside it, the lead beneath.",
      code: `<PageTitle
  title="Knowledge"
  meta={<span className="text-muted-foreground font-mono text-xs">4 sources</span>}
  lead="The project's sources of truth — so agents never start blank."
/>`,
      preview: live(
        <PageTitle
          title="Knowledge"
          meta={<span className="text-muted-foreground font-mono text-xs">4 sources</span>}
          lead="The project's sources of truth — so agents never start blank."
        />
      ),
    },
    {
      title: "Body only",
      description:
        "Compose `PageBody` + `PageTitle` directly when the body must sit inside a provider (e.g. an editor context) that the header stays outside of.",
      code: `<PageBody>
  <PageTitle title="AI Setup" lead="What your agents build with." />
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
    {
      name: "title",
      type: "string",
      description:
        "Page title — the muted context label in the top bar AND the display-scale in-body `<h1>`.",
    },
    {
      name: "meta",
      type: "ReactNode",
      description: "Right-aligned title slot — mono path text, a status badge, or an action.",
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
      description: "Overrides on the body column (e.g. a wider gap for a long-form page).",
    },
  ],
  notes:
    "The one scaffold every /synclair route composes from — it ended the per-page copy-paste of the header + `max-w-6xl` column + intro lead. The body enters with the `page-enter` move and runs a `gap-10` section rhythm; the real `<h1>` lives in the body (`PageTitle`) while the top bar carries a muted context label — the `<main>` landmark itself belongs to the sidebar shell. Exceptions by design: the library explorer (its own breadcrumb shell) opts out. Exports `HubPage` (all-in-one), plus `PageBody`, `PageTitle`, and `PageLead` for pages that need to wrap the body in a provider.",
}

export default doc
