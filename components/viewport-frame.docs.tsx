import { live, type ComponentDoc } from "@/lib/system/doc-types"
import { ViewportFrame } from "@/components/viewport-frame"
import { SkeletonRow, WireframeFrame } from "@/components/wireframe-kit"

const doc: ComponentDoc = {
  intent:
    "One standard preview stage for every documentation preview — Storybook canvas semantics: a device-width switcher, a stage light/dark flip, and a code toggle with copy, above a dot-grid stage. Every tier gets it automatically on doc pages (components skip the 1920px wide lane) — reach for it directly only when composing custom doc content. Not for product UI.",
  examples: [
    {
      title: "Default",
      description:
        "Toggle wide (1920px) / desktop / tablet (768px) / mobile (375px); the frame reflows its children. The sun/moon flips the stage theme without touching the page.",
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
    {
      title: "With a code toggle",
      description:
        "Pass the example's source via `code` — it lives behind the toolbar's Code button with one-click copy, instead of permanently below the preview.",
      code: `<ViewportFrame code={exampleSource} modes={COMPONENT_MODES}>
  <MyComponent />
</ViewportFrame>`,
      preview: live(
        <div className="w-full">
          <ViewportFrame
            modes={["desktop", "tablet", "mobile"]}
            code={`<WireframeFrame label="Component under test" solid>\n  <SkeletonRow />\n</WireframeFrame>`}
          >
            <WireframeFrame label="Component under test" solid>
              <SkeletonRow />
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
      trigger: "Click the sun/moon",
      behavior: "The stage re-renders in the opposite theme via a scoped `.dark` wrapper.",
      result: "Only the stage flips; the page keeps its theme.",
    },
    {
      trigger: "Click Code",
      behavior: "The example's source expands below the stage, with a copy button.",
      result: "Clicking again collapses it.",
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
    {
      name: "modes",
      type: "ViewportMode[]",
      default: "all widths",
      description:
        "Narrow the device set — components pass COMPONENT_MODES (desktop / tablet / mobile).",
    },
    {
      name: "code",
      type: "string",
      description: "The example's source; adds the Code toggle and copy button.",
    },
    {
      name: "themeToggle",
      type: "boolean",
      default: "true",
      description: "Offer the stage light/dark flip.",
    },
  ],
  notes:
    "Mechanism is CSS width, not an iframe — cheap and animated, but `md:`/`lg:` media queries do NOT fire inside it; container-driven layouts reflow correctly. For full-fidelity responsive previews of whole templates, put an `embed` preview (the real route in an iframe) inside the frame: the iframe's viewport is the frame width, so media queries fire at the device width. Widths are fixed project-wide (mobile 375 / tablet 768 / wide 1920) — do not add per-doc widths. The stage theme flip relies on the class-based dark variant (`.dark` wrapper), so it costs nothing and can't drift from the real theme.",
}

export default doc
