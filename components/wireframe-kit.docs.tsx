import { live, type ComponentDoc } from "@/lib/system/doc-types"
import {
  SkeletonBar,
  SkeletonRow,
  WireframeBlock,
  WireframeFrame,
} from "@/components/wireframe-kit"

const doc: ComponentDoc = {
  intent:
    "The standardized vocabulary for anatomy wireframes in documentation: dashed border = placeholder grouping, solid border = real chrome, primary tint = the focal element the section is about. Every doc's skeleton wireframe is built from these primitives — live, theme-aware, and diffable — never from Figma image exports. Not for product UI.",
  examples: [
    {
      title: "A page anatomy",
      description:
        "Solid = chrome that exists; dashed = placeholder; the focal frame is what the doc section is explaining.",
      code: `<WireframeFrame label="Page" solid>
  <WireframeFrame label="Letterhead" focal>
    <SkeletonRow widths={["w-1/3", "w-16"]} />
  </WireframeFrame>
  <WireframeBlock label="Job table" className="min-h-16" />
</WireframeFrame>`,
      preview: live(
        <div className="w-full max-w-md">
          <WireframeFrame label="Page" solid>
            <WireframeFrame label="Letterhead" focal>
              <SkeletonRow widths={["w-1/3", "w-16"]} />
            </WireframeFrame>
            <WireframeBlock label="Job table" className="min-h-16" />
            <div className="flex gap-2">
              <WireframeBlock label="Rail" className="w-1/3" />
              <WireframeBlock label="Detail" className="flex-1" />
            </div>
          </WireframeFrame>
        </div>
      ),
    },
    {
      title: "Skeleton bars",
      description: "Text/line placeholders, sized with width/height utilities.",
      code: `<SkeletonBar className="w-1/2" />
<SkeletonRow widths={["w-1/3", "w-1/4", "w-1/6"]} />`,
      preview: live(
        <div className="flex w-full max-w-sm flex-col gap-3">
          <SkeletonBar className="w-1/2" />
          <SkeletonRow />
          <SkeletonRow widths={["w-2/3", "w-1/6"]} />
        </div>
      ),
    },
  ],
  props: [
    {
      name: "WireframeFrame · label / focal / solid",
      type: "string / boolean / boolean",
      description:
        "Uppercase region label; focal = primary tint (the documented element); solid = real chrome instead of dashed placeholder.",
    },
    {
      name: "WireframeBlock · label",
      type: "string",
      default: '"Content area"',
      description: "Greyscale placeholder box with a centered label (or children).",
    },
    {
      name: "SkeletonBar / SkeletonRow",
      type: "className / widths: string[]",
      description: "Line placeholders; SkeletonRow lays out a set of bars.",
    },
  ],
  notes:
    "Keep the grammar strict: one focal element per wireframe section, everything else greyscale. If a wireframe needs a color to identify a recurring entity across sections, use a single semantic-token accent as the through-line — never more than one accent per doc family.",
}

export default doc
