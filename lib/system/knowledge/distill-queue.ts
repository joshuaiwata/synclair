import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * The distill queue — the manual "Process" button's output. The web app can't run
 * the AI distillation itself (that's the `figma-frame-reader` agent), so a click
 * records a request here; an agent drains it (see the figma-distiller skill).
 */
const QUEUE_PATH = path.join(process.cwd(), "data", "knowledge", "distill-queue.json")

export interface DistillRequest {
  fileKey: string
  fileName: string
  /** ISO — when the request was made. */
  requestedAt: string
}

export async function readDistillQueue(): Promise<DistillRequest[]> {
  try {
    const parsed = JSON.parse(await readFile(QUEUE_PATH, "utf8"))
    return Array.isArray(parsed?.requests) ? (parsed.requests as DistillRequest[]) : []
  } catch {
    return [] // missing / unreadable → empty queue
  }
}

export async function writeDistillQueue(requests: DistillRequest[]): Promise<void> {
  await mkdir(path.dirname(QUEUE_PATH), { recursive: true })
  await writeFile(QUEUE_PATH, `${JSON.stringify({ requests }, null, 2)}\n`, "utf8")
}
