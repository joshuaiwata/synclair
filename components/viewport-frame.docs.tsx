import { live, type ComponentDoc } from "@/lib/system/doc-types"
import { ViewportFrame } from "@/components/viewport-frame"
import { SkeletonRow, WireframeFrame } from "@/components/wireframe-kit"

const doc: ComponentDoc = {
  intent:
    "One standard device-width switcher for every documentation preview, so the responsive story of a block or template is inspectable the same way on every doc page. Blocks and templates get it automatically on their doc pages — reach for it directly only when composing custom doc content. Not for product UI.",
  examples: [
    {
      title: "Default",
      description: "Toggle wide (1920px) / desktop / tablet (768px) / mobile (375px); the frame reflows its children.",
      code: `<ViewportFrame>
  <MyBlock />
</ViewportFrame>`,
      preview: live(
        <div className="w-full">
          <ViewportFrame>
            <WireframeFrame label="Block under test" solid>
              <SkeletonRow />
              <SkeletonRow widths={["w-1/2", "w-1/5"]} />
            </WireframeFrame>
          </ViewportFrame>
        </div>
      ),
      viewports: false,
    },
  ],
  interactions: [
    {
      trigger: "Click a device icon",
      behavior: "Frame animates to that viewport width; the embedded tree reflows.",
      result: "Compact modes cap height at 70vh and scroll internally.",
    },
    {
      trigger: "Click fullscreen (templates only)",
      behavior: "Preview escapes the doc column and fills the screen.",
      result: "Clicking it again returns to desktop.",
    },
  ],
  props: [
    { name: "children", type: "ReactNode", description: "The preview content to frame." },
    {
      name: "defaultMode",
      type: '"mobile" | "tablet" | "desktop" | "wide" | "fullscreen"',
      default: '"desktop"',
      description: "Initial viewport.",
    },
    {
      name: "fullscreen",
      type: "boolean",
      default: "false",
      description: "Offer the fullscreen mode (used for template previews).",
    },
  ],
  notes:
    "Mechanism is CSS width, not an iframe — cheap and animated, but `md:`/`lg:` media queries do NOT fire inside it; container-driven layouts reflow correctly. For full-fidelity responsive previews of whole templates, put an `embed` preview (the real route in an iframe) inside the frame: the iframe's viewport is the frame width, so media queries fire at the device width. Widths are fixed project-wide (mobile 375 / tablet 768 / wide 1920) — do not add per-doc widths.",
}

export default doc
