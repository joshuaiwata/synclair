import path from "node:path"

import { z } from "zod"

import { cachePath, readArtifact, writeArtifact } from "./shared"

/**
 * KNOWLEDGE FRESHNESS — one owner (battery B3) for the probe cache the
 * `check:knowledge` CLI writes and the hub reads, plus the re-distill queue.
 *
 * The state/host enums are the seam contract: a probe inventing a new state
 * fails IN THE PROBE'S RUN (write validates) instead of rendering as a blank
 * badge weeks later — the mechanized version of the "classifyFreshness must
 * stay in lockstep" comment. Records are loose objects: unknown extra fields
 * pass through; wrong shapes on the contract fields do not.
 */

export const freshnessHostSchema = z.enum(["local", "github", "figma", "drive", "notion", "unknown"])
export const freshnessStateSchema = z.enum(["never", "unverifiable", "unreachable", "stale", "fresh"])

export const sectionDriftSchema = z.looseObject({
  changed: z.array(z.string()),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  unchanged: z.number(),
  since: z.string().optional(),
})

export const sourceFreshnessSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
  area: z.string(),
  host: freshnessHostSchema,
  state: freshnessStateSchema,
  url: z.string().nullable(),
  distilledInto: z.string().nullable(),
  distilledAt: z.string().nullable(),
  sourceModifiedAt: z.string().nullable(),
  detail: z.string().nullable(),
  localPath: z.string().nullable().optional(),
  sections: sectionDriftSchema.nullable().optional(),
})

export const freshnessReportSchema = z.looseObject({
  checkedAt: z.string().nullable(),
  sources: z.array(sourceFreshnessSchema),
})

export const redistillRequestSchema = z.looseObject({
  sourceId: z.string(),
  title: z.string(),
  reason: z.string(),
  requestedAt: z.string(),
})

export const redistillQueueSchema = z.looseObject({
  requests: z.array(redistillRequestSchema),
})

export type FreshnessReportArtifact = z.infer<typeof freshnessReportSchema>
export type RedistillQueueArtifact = z.infer<typeof redistillQueueSchema>

const REPORT = () => cachePath(path.join("knowledge", "freshness.json"))
const QUEUE = () => cachePath(path.join("knowledge", "redistill-queue.json"))

export function readFreshnessArtifact(): FreshnessReportArtifact | null {
  return readArtifact(REPORT(), freshnessReportSchema)
}

export function writeFreshnessArtifact(value: unknown): FreshnessReportArtifact {
  return writeArtifact(REPORT(), freshnessReportSchema, value)
}

export function readRedistillQueueArtifact(): RedistillQueueArtifact | null {
  return readArtifact(QUEUE(), redistillQueueSchema)
}

export function writeRedistillQueueArtifact(value: unknown): RedistillQueueArtifact {
  return writeArtifact(QUEUE(), redistillQueueSchema, value)
}
