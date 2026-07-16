import { SummaryShell } from "@/components/summary-shell"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const SAMPLE = `# Product brief

One paragraph of what the product is, distilled from the knowledge sources.

- Audience: engineers onboarding onto the project
- Regenerate via the \`product-summary\` skill
`

const doc: ComponentDoc = {
  intent:
    "The one shell every distilled summary renders through — Knowledge briefs, the System Map overview, and any future summary. It normalizes the shape: a bordered panel opening with one consistent title treatment, so summaries read as siblings no matter how their markdown was authored.",
  examples: [
    {
      title: "With a leading # title",
      description:
        "The leading H1 is stripped from the body and rendered as the shell's own title row.",
      code: `<SummaryShell content={md} meta="generated Jul 15" />`,
      preview: live(
        <div className="w-full max-w-md">
          <SummaryShell content={SAMPLE} meta="generated Jul 15, 2026" />
        </div>
      ),
    },
  ],
  props: [
    { name: "content", type: "string", description: "Markdown; a leading `# Title` becomes the shell title." },
    {
      name: "fallbackTitle",
      type: "string",
      description: "Title used when the content has no leading H1.",
    },
    { name: "meta", type: "ReactNode", description: "Mono metadata line under the title (dates, sources)." },
    {
      name: "html",
      type: "boolean",
      default: "false",
      description: "Passed through to Markdown — repo-committed inline SVG only.",
    },
  ],
  notes:
    "Exports `splitLeadingTitle` for anything else that needs the same title normalization. Source docs never decide their own title size — that is the point.",
}

export default doc
