import { headers } from "next/headers"

import { getExtensionState } from "@/lib/system/extensions"

/**
 * WHO is looking at the hosted hub — and are they allowed to change it?
 *
 * Locally there is no question: the clone is on your machine, you are its
 * admin. Hosted, the hub sits behind the deployment's sign-in gate (an ALB
 * `authenticate-oidc` action), and the load balancer forwards the signed-in
 * user's identity on every request as `x-amzn-oidc-data` — a JWT whose
 * payload carries the Google account's email claim.
 *
 * The payload is decoded here WITHOUT signature verification, deliberately:
 * the app's security group admits traffic from the load balancer alone, so
 * the header cannot arrive from anywhere else. If the app is ever exposed
 * directly, verification (the ALB publishes its signing keys) must be added
 * before trusting this for anything sharper than showing/hiding UI.
 *
 * Admins are the union of two lists:
 *   - `SYNCLAIR_SETTINGS_ADMINS` (comma-separated emails) — deploy config,
 *     survives every redeploy; the durable list.
 *   - `admins` in `data/extensions.json` — approved from the Settings UI at
 *     runtime; on a hosted container this file resets on redeploy, so UI
 *     approvals are convenience, not the source of record.
 *
 * Fail-closed where it matters: on a hosted runtime with no identity header
 * (a misconfigured gate), nobody is an admin.
 */

/** The deployed image sets SYNCLAIR_HOSTED=1 (Dockerfile); local dev never does. */
export function isHostedRuntime(): boolean {
  return process.env.SYNCLAIR_HOSTED === "1"
}

/** Email of the signed-in viewer, from the ALB's identity header. Null locally. */
export async function getViewerEmail(): Promise<string | null> {
  const oidcData = (await headers()).get("x-amzn-oidc-data")
  if (!oidcData) return null
  try {
    const payload = oidcData.split(".")[1]
    if (!payload) return null
    const claims: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    )
    const email = (claims as Record<string, unknown>).email
    return typeof email === "string" && email.includes("@")
      ? email.toLowerCase()
      : null
  } catch {
    return null
  }
}

/** Emails granted Settings access via deploy config — never removable from the UI. */
export function configuredAdmins(): string[] {
  return (process.env.SYNCLAIR_SETTINGS_ADMINS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"))
}

export interface SettingsAccess {
  admin: boolean
  hosted: boolean
  /** Viewer email when the gate forwarded one; null locally. */
  email: string | null
}

export async function getSettingsAccess(): Promise<SettingsAccess> {
  const hosted = isHostedRuntime()
  const email = await getViewerEmail()

  // Local clone, no gate in front: the person at the keyboard is the admin.
  if (!hosted && !email) return { admin: true, hosted, email }

  if (!email) return { admin: false, hosted, email }
  const state = await getExtensionState()
  const admins = new Set([...configuredAdmins(), ...state.admins])
  return { admin: admins.has(email), hosted, email }
}
