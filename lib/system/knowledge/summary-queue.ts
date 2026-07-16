import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * The summary queue — the "Generate"/"Reprocess" button's output. Mirrors the
 * distill queue: the web app records the request; an agent drains it per the
 * `product-summary` skill and writes the new version into `summaries/`. The
 * generation spec lives on the summary definition (index.json), not here.
 */
const QUEUE_PATH = path.join(process.cwd(), "data", "knowledge", "summary-queue.json")

export interface SummaryRequest {
  summaryId: string
  /** ISO — when the request was made. */
  requestedAt: string
}

export async function readSummaryQueue(): Promise<SummaryRequest[]> {
  try {
    const parsed = JSON.parse(await readFile(QUEUE_PATH, "utf8"))
    return Array.isArray(parsed?.requests) ? (parsed.requests as SummaryRequest[]) : []
  } catch {
    return [] // missing / unreadable → empty queue
  }
}

export async function writeSummaryQueue(requests: SummaryRequest[]): Promise<void> {
  await mkdir(path.dirname(QUEUE_PATH), { recursive: true })
  await writeFile(QUEUE_PATH, `${JSON.stringify({ requests }, null, 2)}\n`, "utf8")
}
