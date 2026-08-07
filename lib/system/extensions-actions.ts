"use server"

import { revalidatePath } from "next/cache"

import { coreSections, extensionById } from "@/lib/system/extensions-manifest"
import {
  mutateExtensionState,
  type ExtensionAvailability,
  type SectionVisibility,
} from "@/lib/system/extensions"
import { configuredAdmins, getSettingsAccess } from "@/lib/system/hub-identity"
import { synclair } from "@/lib/system/routes"

/**
 * The Settings page's server actions. Every one is admin-gated — locally that
 * is everyone (your clone, your rules); hosted it is the email allowlist
 * (lib/system/hub-identity.ts). A non-admin call is a silent no-op: the page
 * never renders these controls for non-admins, so anything arriving anyway is
 * someone poking the action endpoint directly.
 *
 * All ids validate against the catalog before writing — an unknown id is a
 * no-op, never a stray key in the state file — and every write revalidates
 * the hub layout so the nav re-renders at once.
 */

function knownSectionId(id: string): boolean {
  // Both Library shapes are legal ids regardless of the current surfaces seed,
  // so a toggle can't be orphaned by flipping multi-surface later.
  return (
    coreSections(false).some((section) => section.id === id) ||
    coreSections(true).some((section) => section.id === id)
  )
}

const VISIBILITIES: readonly SectionVisibility[] = ["all", "local", "hidden"]

export async function setSectionVisibilityAction(
  formData: FormData
): Promise<void> {
  if (!(await getSettingsAccess()).admin) return
  const id = formData.get("id")
  const visibility = formData.get("visibility")
  if (typeof id !== "string" || !knownSectionId(id)) return
  if (
    typeof visibility !== "string" ||
    !VISIBILITIES.includes(visibility as SectionVisibility)
  )
    return

  await mutateExtensionState((state) => ({
    ...state,
    sections: { ...state.sections, [id]: visibility as SectionVisibility },
  }))
  revalidatePath(synclair(), "layout")
}

const AVAILABILITIES: readonly ExtensionAvailability[] = ["on", "local", "off"]

export async function setExtensionAvailabilityAction(
  formData: FormData
): Promise<void> {
  if (!(await getSettingsAccess()).admin) return
  const id = formData.get("id")
  const availability = formData.get("availability")
  if (typeof id !== "string" || !extensionById(id)) return
  if (
    typeof availability !== "string" ||
    !AVAILABILITIES.includes(availability as ExtensionAvailability)
  )
    return

  await mutateExtensionState((state) => ({
    ...state,
    extensions: {
      ...state.extensions,
      [id]: availability as ExtensionAvailability,
    },
  }))
  revalidatePath(synclair(), "layout")
}

export async function addSettingsAdminAction(
  formData: FormData
): Promise<void> {
  if (!(await getSettingsAccess()).admin) return
  const email = formData.get("email")
  if (typeof email !== "string") return
  const normalized = email.trim().toLowerCase()
  if (!normalized.includes("@") || normalized.length > 254) return

  if (configuredAdmins().includes(normalized)) return
  await mutateExtensionState((state) =>
    state.admins.includes(normalized)
      ? state
      : { ...state, admins: [...state.admins, normalized].sort() }
  )
  revalidatePath(synclair("/settings"))
}

export async function removeSettingsAdminAction(
  formData: FormData
): Promise<void> {
  if (!(await getSettingsAccess()).admin) return
  const email = formData.get("email")
  if (typeof email !== "string") return
  const normalized = email.trim().toLowerCase()

  await mutateExtensionState((state) => {
    // Never remove the LAST way in. With no runtime admins and no
    // SYNCLAIR_SETTINGS_ADMINS, hosted Settings is closed to everyone and only
    // an admin can re-open it — a redeploy is the sole recovery. The UI hides
    // the control too; this is the enforcement.
    const remaining = state.admins.filter((existing) => existing !== normalized)
    if (remaining.length === 0 && configuredAdmins().length === 0) return state
    return { ...state, admins: remaining }
  })
  revalidatePath(synclair("/settings"))
}
