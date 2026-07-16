"use server"

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { revalidatePath } from "next/cache"

import { getAgents } from "./agents"
import { synclair } from "./routes"
import { getSkills } from "./skills"
import type { SourceKind } from "./types"

const NAME_RE = /^[a-z0-9-]+$/
const CLAUDE_DIR = path.join(process.cwd(), ".claude")

/**
 * Resolve a client-supplied (kind, name) to an absolute file path — but only
 * ever to a file that actually exists in the live skill/agent list. The raw
 * path is never trusted: the name is validated, matched against on-disk
 * entries, and the resolved path is confirmed to stay within `.claude/`.
 */
async function resolveSourcePath(kind: SourceKind, name: string): Promise<string> {
  if (!NAME_RE.test(name)) throw new Error("Invalid name")

  const known = kind === "agent" ? await getAgents() : await getSkills()
  const entry = known.find((e) => e.name === name)
  if (!entry) throw new Error(`Unknown ${kind}: ${name}`)

  const full = path.join(process.cwd(), entry.file)
  const rel = path.relative(CLAUDE_DIR, full)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Resolved path is outside .claude/")
  }
  return full
}

export async function readSource(kind: SourceKind, name: string): Promise<string> {
  const full = await resolveSourcePath(kind, name)
  return readFile(full, "utf8")
}

export async function saveSource(
  kind: SourceKind,
  name: string,
  content: string
): Promise<void> {
  const full = await resolveSourcePath(kind, name)
  await writeFile(full, content, "utf8")
  revalidatePath(synclair("/ai-setup"))
}
