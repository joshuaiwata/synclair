import { EmbedFrame } from "@/components/embed-frame"
import { synclair } from "@/lib/system/routes"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  examples: [
    {
      title: "A live route, scaled to the stage",
      description:
        "The iframe renders the real page at the logical device width of the surrounding ViewportFrame and scales to fit — media queries fire at the width the device switcher claims.",
      code: `<EmbedFrame url={synclair("/foundations")} title="Foundations" height={360} />`,
      preview: live(
        <div className="w-full">
          <EmbedFrame url={synclair("/foundations")} title="Foundations" height={360} />
        </div>
      ),
      viewports: false,
    },
  ],
  props: [
    { name: "url", type: "string", description: "Same-origin route (or live host base + route) to embed." },
    { name: "title", type: "string", description: "Accessible iframe title." },
    {
      name: "height",
      type: "number",
      default: "480",
      description: "Visual height of the frame on the doc page.",
    },
  ],
  notes:
    "The embed side of the preview contract: ViewportFrame constrains CSS width (media queries don't fire), so full-fidelity responsive previews embed the REAL route — the iframe's viewport is the logical device width, scaled to fit the doc column. Used by the web adapter's `embed` previews and the pages sitemap thumbs; reach for it directly only in custom doc content.",
}

export default doc
