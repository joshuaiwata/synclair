import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  examples: [
    {
      title: "Title only",
      code: `<PageHeader title="Component Library" />`,
      preview: live(
        <div className="bg-card w-full overflow-hidden rounded-lg border">
          <PageHeader title="Component Library" />
        </div>
      ),
    },
    {
      title: "With right slot",
      description: "Children render right-aligned — path text, status, or actions.",
      code: `<PageHeader title="Environment">
  <StatusBadge status="success">Connected</StatusBadge>
</PageHeader>`,
      preview: live(
        <div className="bg-card w-full overflow-hidden rounded-lg border">
          <PageHeader title="Environment">
            <StatusBadge status="success">Connected</StatusBadge>
          </PageHeader>
        </div>
      ),
    },
  ],
  props: [
    {
      name: "title",
      type: "React.ReactNode",
      description:
        "The page context label — a plain string renders as muted text (the real `<h1>` is the body's `PageTitle`); a node (e.g. a breadcrumb trail) renders as-is in the title slot.",
    },
    {
      name: "children",
      type: "ReactNode",
      description: "Right-aligned slot for path text, status, or actions.",
    },
    { name: "className", type: "string", description: "Overrides on the header element." },
  ],
  notes:
    "Use once at the very top of every route. Includes the `SidebarTrigger`, so it must render inside the `SidebarProvider` (the app shell already provides it). Slim context bar, 3.5rem tall, bottom border — the page's real `<h1>` lives in the body via `PageTitle`.",
}

export default doc
