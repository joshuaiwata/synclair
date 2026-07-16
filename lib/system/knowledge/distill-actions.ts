"use server"

import { revalidatePath } from "next/cache"

import { synclair } from "../routes"
import { readDistillQueue, writeDistillQueue } from "./distill-queue"

const KEY_RE = /^[A-Za-z0-9]+$/

/** Queue a Figma file for distillation (or re-distillation). Idempotent per key. */
export async function queueDistill(fileKey: string, fileName: string): Promise<void> {
  if (!KEY_RE.test(fileKey)) throw new Error("Invalid Figma file key")
  const queue = await readDistillQueue()
  if (!queue.some((r) => r.fileKey === fileKey)) {
    queue.push({ fileKey, fileName, requestedAt: new Date().toISOString() })
    await writeDistillQueue(queue)
  }
  revalidatePath(synclair("/figma-manifest"))
}

/** Remove a file from the distill queue (cancel a pending request). */
export async function dequeueDistill(fileKey: string): Promise<void> {
  const queue = await readDistillQueue()
  await writeDistillQueue(queue.filter((r) => r.fileKey !== fileKey))
  revalidatePath(synclair("/figma-manifest"))
}
