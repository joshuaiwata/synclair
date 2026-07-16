import { live, scene, type ComponentDoc } from "@/lib/system/doc-types"

/**
 * The sections render the LIVE token source (lib/system/tokens.ts + seed), so
 * the example renders two real sections via the standalone preview scene —
 * the same components /synclair/foundations composes.
 */
const doc: ComponentDoc = {
  intent:
    "The live style guide behind /synclair/foundations: color ramps with click-to-copy swatches, the type scale, spacing, radius, opacity, shape/elevation, motion, and iconography — every value rendered FROM lib/system/tokens.ts and the seed, so the page cannot drift from globals.css. It exists so designers and stakeholders audit the actual tokens, not a transcription of them.",
  examples: [
    {
      title: "Live",
      description:
        "Two real sections (Colors, Typography) rendered from the live token source — click a swatch, it copies.",
      preview: scene("foundations-sections", { height: 560 }),
      code: `// /synclair/foundations composes one section per category
<ColorsFoundation />
<TypographyFoundation />`,
    },
  ],
  interactions: [
    {
      trigger: "Click a color swatch",
      behavior: "Copies the token's CSS variable name to the clipboard.",
      result: "Styling reaches for the token, not the raw value.",
    },
  ],
  states: [
    {
      name: "Companion mode",
      description:
        "Only the host project's documented palette renders; Synclair's own hub tokens stay hidden from the stakeholder.",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border border-dashed p-4 text-xs">
          Host palette only — hub tokens not shown
        </div>
      ),
    },
  ],
  responsive: [
    { viewport: "mobile", behavior: "Swatch ramps wrap; tables scroll in place." },
    { viewport: "tablet", behavior: "Two-column section cards where they fit." },
    { viewport: "desktop", behavior: "Full section cards in page order (the 6-category guide)." },
  ],
  props: [
    {
      name: "(per section)",
      type: "—",
      description:
        "Each exported section (ColorsSection, TypographySection, …) is zero-prop: it reads tokens.ts and the seed directly — deriving, never transcribing.",
    },
  ],
  notes:
    "Twelve exported section components composed by app/synclair/foundations/page.tsx; color-swatch.tsx rides as a file of this block. The zero-prop data access is the derive-don't-transcribe contract (docs/rendering-parity.md) applied to tokens.",
}

export default doc
