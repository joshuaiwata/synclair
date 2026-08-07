import { cache } from "react"

import { randomBytes } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { extensionById } from "@/lib/system/extensions-manifest"

/**
 * Extension/visibility STATE — the server half of the Core/Extensions layer
 * (docs/extensibility.md; the catalog itself is `extensions-manifest.ts`).
 *
 * Source of truth is `data/extensions.json`, clone-local like the rest of
 * `data/`. The file is optional by design: absent, unreadable, or malformed
 * all mean "everything on" — the RFC's fail-open rule, which also makes
 * introducing this a no-op for every existing clone and keeps a reseeded
 * clone starting all-on without any blanking step.
 */

const STATE_PATH = path.join(process.cwd(), "data", "extensions.json")

/**
 * Where a core section shows: everywhere, on the local clone only (hidden on
 * the hosted hub), or nowhere. Unlisted sections take their manifest default —
 * `internal: true` sections default to "local", everything else to "all".
 */
export type SectionVisibility = "all" | "local" | "hidden"

const VISIBILITIES = new Set<SectionVisibility>(["all", "local", "hidden"])

/**
 * Where an extension runs: everywhere, on the local clone only (off on the
 * hosted hub), or off. The same environment axis sections get — an extension
 * the team is still trying out can run locally without reaching stakeholders.
 */
export type ExtensionAvailability = "on" | "local" | "off"

const AVAILABILITIES = new Set<ExtensionAvailability>(["on", "local", "off"])

/** The deployed image sets SYNCLAIR_HOSTED=1 (Dockerfile). Read inline here —
 *  hub-identity.ts imports this module, so importing it back would cycle. */
const isHostedHere = () => process.env.SYNCLAIR_HOSTED === "1"

export interface ExtensionState {
  /** Per-section visibility overrides. Unlisted = the manifest's default. */
  sections: Record<string, SectionVisibility>
  /** Per-extension availability overrides. Unlisted = the manifest's default. */
  extensions: Record<string, ExtensionAvailability>
  /** Emails approved for Settings on the hosted hub, beyond the deploy-config
   *  list (SYNCLAIR_SETTINGS_ADMINS). Reset by redeploy on a hosted container. */
  admins: string[]
}

/**
 * Read WITHOUT the per-request cache. Mutations must re-read the file at the
 * moment they write — `getExtensionState`'s `cache()` snapshot is taken once
 * per request, so two overlapping toggles both saw the pre-toggle state and
 * the second silently reverted the first (5/5 concurrent trials lost a write).
 */
async function readExtensionState(): Promise<ExtensionState> {
  try {
    const raw: unknown = JSON.parse(await readFile(STATE_PATH, "utf8"))
    const record = (raw ?? {}) as Record<string, unknown>
    const sections: Record<string, SectionVisibility> =
      record.sections && typeof record.sections === "object"
        ? Object.fromEntries(
            Object.entries(record.sections as Record<string, unknown>).filter(
              (entry): entry is [string, SectionVisibility] =>
                VISIBILITIES.has(entry[1] as SectionVisibility)
            )
          )
        : {}
    // Legacy shape: `hiddenSections: string[]` predates the per-environment
    // model — read it as "hidden", so an existing state file keeps meaning
    // what it meant.
    if (Array.isArray(record.hiddenSections)) {
      for (const id of record.hiddenSections) {
        if (typeof id === "string" && !(id in sections)) sections[id] = "hidden"
      }
    }
    return {
      sections,
      // Booleans are the legacy per-extension shape — read them as on/off so
      // an existing state file keeps meaning what it meant.
      extensions:
        record.extensions && typeof record.extensions === "object"
          ? Object.fromEntries(
              Object.entries(record.extensions as Record<string, unknown>)
                .map(([id, value]): [string, ExtensionAvailability | null] => [
                  id,
                  typeof value === "boolean"
                    ? value
                      ? "on"
                      : "off"
                    : AVAILABILITIES.has(value as ExtensionAvailability)
                      ? (value as ExtensionAvailability)
                      : null,
                ])
                .filter(
                  (entry): entry is [string, ExtensionAvailability] =>
                    entry[1] !== null
                )
            )
          : {},
      // Normalized on READ as well as write: the Settings page invites hand
      // editing, and a stored "Chris.Teso@Toolbelt.Work" silently denied the
      // matching viewer because only the write path lowercased.
      admins: Array.isArray(record.admins)
        ? record.admins
            .filter(
              (email): email is string =>
                typeof email === "string" && email.includes("@")
            )
            .map((email) => email.trim().toLowerCase())
        : [],
    }
  } catch (e) {
    // A MISSING file is the documented fail-open case: a fresh clone shows
    // everything. A file that exists but won't parse is a different animal —
    // silently reverting to all-on would expose every section an admin hid and
    // empty the admin allowlist in the same instant. It can't be recovered
    // from here (refusing to serve would lock the hub), so at minimum it must
    // be LOUD rather than an inexplicable reset. Atomic writes below make a
    // half-written file impossible in the first place.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(
        "[extensions] data/extensions.json unreadable — every section reverts to visible and " +
          "runtime admin approvals are ignored until it parses again:",
        e instanceof Error ? e.message : e
      )
    }
    return { sections: {}, extensions: {}, admins: [] }
  }
}

/** Request-memoised read — one parse per render pass. */
export const getExtensionState = cache(readExtensionState)

/** An extension's availability: the explicit override, else its manifest default. */
export function extensionAvailability(
  state: ExtensionState,
  id: string
): ExtensionAvailability {
  return (
    state.extensions[id] ??
    ((extensionById(id)?.defaultEnabled ?? true) ? "on" : "off")
  )
}

/** Is the extension running in THIS environment — "local" counts only off the hosted hub. */
export async function isExtensionEnabled(id: string): Promise<boolean> {
  const availability = extensionAvailability(await getExtensionState(), id)
  return availability === "on" || (availability === "local" && !isHostedHere())
}

/** Extension ids enabled for the given runtime — the layout's nav input. */
export function resolveEnabledExtensions(
  state: ExtensionState,
  ids: readonly string[],
  hosted: boolean
): string[] {
  return ids.filter((id) => {
    const availability = extensionAvailability(state, id)
    return availability === "on" || (availability === "local" && !hosted)
  })
}

/** A section's visibility: the explicit override, else its manifest default. */
export function sectionVisibility(
  state: ExtensionState,
  id: string,
  internalByDefault: boolean
): SectionVisibility {
  return state.sections[id] ?? (internalByDefault ? "local" : "all")
}

/**
 * The section ids the CURRENT runtime hides — "hidden" everywhere, plus
 * "local" (local-only) sections when this is the hosted hub. The sidebar gets
 * this resolved list; it never re-derives environment rules client-side.
 */
export function resolveHiddenSections(
  state: ExtensionState,
  sections: readonly { id: string; internal?: boolean }[],
  hosted: boolean
): string[] {
  return sections
    .filter((section) => {
      const visibility = sectionVisibility(
        state,
        section.id,
        section.internal === true
      )
      return visibility === "hidden" || (visibility === "local" && hosted)
    })
    .map((section) => section.id)
}

/**
 * Write ATOMICALLY — temp file then rename, which is atomic on POSIX. A bare
 * writeFile truncates first, so a crash or a concurrent read mid-write yields
 * a half-written file, and a half-written file doesn't parse (see the reader
 * above for what that costs).
 */
export async function writeExtensionState(
  state: ExtensionState
): Promise<void> {
  const tmp = `${STATE_PATH}.${randomBytes(6).toString("hex")}.tmp`
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8")
  await rename(tmp, STATE_PATH)
}

/**
 * The ONLY way to change settings state.
 *
 * Every mutation is a read-modify-write over the WHOLE state object, so two
 * overlapping ones each write back their own stale snapshot and the later
 * silently reverts the earlier — losing a section toggle is annoying, losing
 * an admin removal is a security problem (the removed admin comes back).
 * Clicking two Settings rows in quick succession is enough to trigger it.
 *
 * So mutations queue: each re-reads the file at its turn and runs to
 * completion before the next begins. A rejected mutation doesn't poison the
 * queue.
 */
let mutations: Promise<unknown> = Promise.resolve()

export function mutateExtensionState(
  mutate: (state: ExtensionState) => ExtensionState
): Promise<void> {
  const next = mutations.then(async () => {
    await writeExtensionState(mutate(await readExtensionState()))
  })
  mutations = next.catch(() => {})
  return next
}
