"use server"

import { revalidatePath } from "next/cache"

import { synclair } from "../routes"
import { readSummaryIndex, writeSummaryIndex } from "./summary"
import {
  SLUG_RE,
  SUMMARY_KINDS,
  type SummaryDef,
  type SummaryKind,
} from "./summary-types"
import { readSummaryQueue, writeSummaryQueue } from "./summary-queue"

function refresh() {
  revalidatePath(synclair("/knowledge"))
}

async function requireSummary(summaryId: string): Promise<SummaryDef> {
  if (!SLUG_RE.test(summaryId)) throw new Error("Invalid summary id")
  const index = await readSummaryIndex()
  const def = index.summaries.find((s) => s.id === summaryId)
  if (!def) throw new Error("Unknown summary")
  return def
}

/**
 * Define a new summary (title + kind + generation spec) and queue its first
 * generation. Returns the new summary's id so the UI can select it.
 */
export async function createSummary(input: {
  title: string
  kind: SummaryKind
  instructions: string
}): Promise<string> {
  const title = input.title.trim()
  if (!title) throw new Error("Title is required")
  if (!SUMMARY_KINDS.includes(input.kind)) throw new Error("Unknown summary kind")

  const index = await readSummaryIndex()
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "summary"
  let id = base
  for (let n = 2; index.summaries.some((s) => s.id === id); n++) id = `${base}-${n}`

  index.summaries.push({
    id,
    title,
    kind: input.kind,
    instructions: input.instructions.trim(),
    archived: false,
    current: null,
    versions: [],
  })
  await writeSummaryIndex(index)

  const queue = await readSummaryQueue()
  queue.push({ summaryId: id, requestedAt: new Date().toISOString() })
  await writeSummaryQueue(queue)

  refresh()
  return id
}

/** Queue a (re)generation for an existing summary. Idempotent per summary. */
export async function queueSummary(summaryId: string): Promise<void> {
  await requireSummary(summaryId)
  const queue = await readSummaryQueue()
  if (!queue.some((r) => r.summaryId === summaryId)) {
    queue.push({ summaryId, requestedAt: new Date().toISOString() })
    await writeSummaryQueue(queue)
  }
  refresh()
}

/** Cancel a pending generation request. */
export async function dequeueSummary(summaryId: string): Promise<void> {
  if (!SLUG_RE.test(summaryId)) throw new Error("Invalid summary id")
  const queue = await readSummaryQueue()
  await writeSummaryQueue(queue.filter((r) => r.summaryId !== summaryId))
  refresh()
}

/**
 * Restore a previous version: point `current` at a version that already exists
 * on this summary. Versions are immutable files, so this is always reversible.
 */
export async function restoreSummary(summaryId: string, versionId: string): Promise<void> {
  const def = await requireSummary(summaryId)
  if (!def.versions.some((v) => v.id === versionId)) {
    throw new Error("Unknown summary version")
  }
  const index = await readSummaryIndex()
  const target = index.summaries.find((s) => s.id === summaryId)!
  target.current = versionId
  await writeSummaryIndex(index)
  refresh()
}

/** Archive hides a summary (and drops its pending request); history is kept. */
export async function setSummaryArchived(
  summaryId: string,
  archived: boolean
): Promise<void> {
  await requireSummary(summaryId)
  const index = await readSummaryIndex()
  const target = index.summaries.find((s) => s.id === summaryId)!
  target.archived = archived
  await writeSummaryIndex(index)
  if (archived) {
    const queue = await readSummaryQueue()
    await writeSummaryQueue(queue.filter((r) => r.summaryId !== summaryId))
  }
  refresh()
}
