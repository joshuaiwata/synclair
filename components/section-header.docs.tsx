import { SectionHeader } from "@/components/section-header"
import { live, type ComponentDoc } from "@/lib/system/doc-types"
import { Button } from "@/components/ui/button"

const doc: ComponentDoc = {
  examples: [
    {
      title: "Title only",
      code: `<SectionHeader title="Registered items" />`,
      preview: live(<SectionHeader className="w-full max-w-md" title="Registered items" />),
    },
    {
      title: "With mono hint",
      code: `<SectionHeader title="Components" hint="registry:component" />`,
      preview: live(
        <SectionHeader className="w-full max-w-md" title="Components" hint="registry:component" />
      ),
    },
    {
      title: "With action slot",
      description: "Children render right-aligned.",
      code: `<SectionHeader title="Blocks">
  <Button size="sm" variant="outline">Add</Button>
</SectionHeader>`,
      preview: live(
        <SectionHeader className="w-full max-w-md" title="Blocks">
          <Button size="sm" variant="outline">
            Add
          </Button>
        </SectionHeader>
      ),
    },
  ],
  props: [
    { name: "title", type: "string", description: "The section heading (renders an `<h2>`)." },
    { name: "hint", type: "string", description: "Optional mono hint after the title." },
    {
      name: "children",
      type: "ReactNode",
      description: "Right-aligned action slot (buttons, filters).",
    },
    { name: "className", type: "string", description: "Layout overrides." },
  ],
  notes:
    "Use above tables and content sections inside a page — not as the page title (that's `page-header`). The hint is for a mono qualifier like a registry type or count.",
}

export default doc
