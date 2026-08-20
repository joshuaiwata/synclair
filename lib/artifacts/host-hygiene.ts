import path from "node:path"

import { z } from "zod"

import { cachePath, readArtifact, writeArtifact } from "./shared"

/**
 * HOST HYGIENE — one owner (battery B3) for the hygiene scan's cache
 * artifact. Strict on what the page and MCP assert (a scan timestamp, rule
 * rows with id/count, finding rows locating a file), loose elsewhere.
 */

export const hygieneFindingSchema = z.looseObject({
  rule: z.string(),
  hostPath: z.string(),
  line: z.number(),
  snippet: z.string(),
})

export const hygieneRuleSummarySchema = z.looseObject({
  rule: z.string(),
  count: z.number(),
  files: z.number(),
  truncated: z.number(),
})

export const hostHygieneSchema = z.looseObject({
  scannedAt: z.string(),
  hosts: z.array(z.looseObject({ name: z.string(), root: z.string() })),
  totals: z.looseObject({
    findings: z.number(),
    files: z.number(),
    scannedFiles: z.number(),
  }),
  rules: z.array(hygieneRuleSummarySchema),
  topFiles: z.array(z.looseObject({ hostPath: z.string(), count: z.number() })),
  findings: z.array(hygieneFindingSchema),
})

export type HostHygieneArtifact = z.infer<typeof hostHygieneSchema>

const ARTIFACT = () => cachePath(path.join("host-hygiene.json"))

export function readHostHygieneArtifact(): HostHygieneArtifact | null {
  return readArtifact(ARTIFACT(), hostHygieneSchema)
}

export function writeHostHygieneArtifact(value: unknown): HostHygieneArtifact {
  return writeArtifact(ARTIFACT(), hostHygieneSchema, value)
}
