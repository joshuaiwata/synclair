"use server"

import { revalidatePath } from "next/cache"

import { synclair } from "../system/routes"
import { readStars, writeStars } from "./stars"

const KEY_RE = /^[A-Za-z0-9]+$/

/** Toggle a Figma file's starred state. */
export async function toggleStar(fileKey: string): Promise<void> {
  if (!KEY_RE.test(fileKey)) throw new Error("Invalid Figma file key")
  const keys = await readStars()
  const next = keys.includes(fileKey)
    ? keys.filter((k) => k !== fileKey)
    : [...keys, fileKey]
  await writeStars(next)
  revalidatePath(synclair("/figma-manifest"))
}
