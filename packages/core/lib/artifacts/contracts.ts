import path from "node:path"

import { z } from "zod"

import { cachePath, readArtifact, writeArtifact } from "./shared"

/**
 * CONTRACTS — one owner (battery B3) for the frontend→API call-links cache.
 * Strict on the seam the audit and pages assert (providers with method/path,
 * links with method/path/consumer, diagnostics that COUNT what was dropped),
 * loose elsewhere.
 */

export const contractProviderSchema = z.looseObject({
  method: z.string(),
  path: z.string(),
})

export const contractLinkSchema = z.looseObject({
  method: z.string(),
  path: z.string(),
  consumer: z.string().optional(),
  consumerApp: z.string().optional(),
})

export const contractsSchema = z.looseObject({
  providers: z.array(contractProviderSchema),
  links: z.array(contractLinkSchema),
  diagnostics: z.looseObject({
    opaqueCalls: z.number(),
    unmatched: z.array(z.unknown()),
  }),
})

export type ContractsArtifact = z.infer<typeof contractsSchema>

const ARTIFACT = () => cachePath(path.join("contracts.json"))

export function readContractsArtifact(): ContractsArtifact | null {
  return readArtifact(ARTIFACT(), contractsSchema)
}

export function writeContractsArtifact(value: unknown): ContractsArtifact {
  return writeArtifact(ARTIFACT(), contractsSchema, value)
}
