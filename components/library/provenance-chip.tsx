import { Badge } from "@/components/ui/badge"
import type { Provenance } from "@/lib/system/provenance"

/**
 * HOW SURE IS THIS PAGE — the signal the hub has recorded since Phase 1 and
 * never once shown.
 *
 * A fact a scanner derived five minutes ago and a sentence a person wrote eight
 * months ago render identically today, so readers discount all of it equally.
 * Naming which is which is most of what "how much can I trust this" needs.
 *
 * Three deliberate choices:
 *
 *   ABSENT IS "unrecorded", NOT "authored". Artifacts written before the field
 *   existed carry nothing, and printing a confident provenance for them would be
 *   the exact failure this chip exists to fix — asserting how a fact got here
 *   when we cannot tell.
 *
 *   NOTHING IS HIDDEN for low confidence. It is labelled. This is where we
 *   diverge from the audited implementation, which clears ungrounded fields: that
 *   suits a machine-read index and not a hub a human reads, where a claim that
 *   quietly vanishes is less recoverable than one marked uncertain.
 *
 *   QUIET BY DEFAULT. `high` confidence renders no colour — a badge on every
 *   healthy page is wallpaper, and then the one that matters goes unread.
 */
export function ProvenanceChip({ provenance }: { provenance?: Provenance | null }) {
  if (!provenance?.generator) {
    return (
      <Badge
        variant="outline"
        className="text-3xs font-normal text-muted-foreground/70"
        title="No provenance recorded — this was written before the hub tracked how its facts got here."
      >
        unrecorded
      </Badge>
    )
  }

  const confidence = provenance.confidence
  const tone =
    confidence === "low"
      ? "border-warning/40 bg-warning/5 text-warning-foreground"
      : confidence === "medium"
        ? "border-border bg-muted/40 text-muted-foreground"
        : "border-border text-muted-foreground/80"

  return (
    <Badge
      variant="outline"
      className={`text-3xs font-normal font-mono ${tone}`}
      title={
        confidence === "high"
          ? `Derived by ${provenance.generator} — recomputable from source.`
          : `Derived by ${provenance.generator}, but incomplete: some entries still need a written summary.`
      }
    >
      {provenance.generator}
      {confidence && confidence !== "high" ? ` · ${confidence}` : ""}
    </Badge>
  )
}
