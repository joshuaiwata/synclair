"use server"

import { revalidatePath } from "next/cache"

import { synclair } from "../routes"
import { readArchivedSources, writeArchivedSources } from "./archived-sources"

/**
 * Soft-remove (archive) or restore a knowledge source by id. Reversible — the entry
 * stays defined in sources.ts; this only toggles whether the hub shows it. A hard
 * delete is a code edit (drop the entry from sources.ts).
 */
export async function setSourceArchived(id: string, archived: boolean): Promise<void> {
  const ids = new Set(await readArchivedSources())
  if (archived) ids.add(id)
  else ids.delete(id)
  await writeArchivedSources([...ids])
  revalidatePath(synclair("/knowledge"))
}
