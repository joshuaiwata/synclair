"use client"

import Link from "next/link"
import { useTransition } from "react"
import { MoreHorizontal, SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  addSettingsAdminAction,
  removeSettingsAdminAction,
  setExtensionAvailabilityAction,
  setSectionVisibilityAction,
} from "@/lib/system/extensions-actions"

/**
 * The Settings page's rows. Every row is the same shape — title, description,
 * current state as quiet text, and ONE ⋯ menu holding all of its options —
 * so sections and extensions read identically and new option kinds have an
 * obvious home. Optimism-free on purpose: controls disable while the server
 * action runs, and state comes back from the re-rendered server page — the
 * nav and the row can't disagree.
 */

function SettingRow({
  title,
  description,
  status,
  menu,
}: {
  title: string
  description: string
  /** The current state, rendered as quiet text beside the menu. */
  status: string
  menu: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{status}</span>
        {menu}
      </div>
    </div>
  )
}

function RowMenuTrigger({
  label,
  disabled,
}: {
  label: string
  disabled: boolean
}) {
  return (
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={disabled}
        aria-label={label}
      >
        <MoreHorizontal />
      </Button>
    </DropdownMenuTrigger>
  )
}

const SECTION_VISIBILITY_LABELS = {
  all: "Local & Remote",
  local: "Local only",
  hidden: "Hidden",
} as const

export function SectionVisibilityRow({
  id,
  title,
  description,
  visibility,
}: {
  id: string
  title: string
  description: string
  visibility: "all" | "local" | "hidden"
}) {
  const [pending, startTransition] = useTransition()
  const setVisibility = (value: string) =>
    startTransition(async () => {
      const formData = new FormData()
      formData.set("id", id)
      formData.set("visibility", value)
      await setSectionVisibilityAction(formData)
    })
  return (
    <SettingRow
      title={title}
      description={description}
      status={SECTION_VISIBILITY_LABELS[visibility]}
      menu={
        <DropdownMenu>
          <RowMenuTrigger label={`Options for ${title}`} disabled={pending} />
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Show</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={visibility}
              onValueChange={setVisibility}
            >
              <DropdownMenuRadioItem value="all">
                Local &amp; Remote
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="local">
                Local only
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="hidden">
                Hidden
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  )
}

const EXTENSION_AVAILABILITY_LABELS = {
  on: "Local & Remote",
  local: "Local only",
  off: "Off",
} as const

export function ExtensionRow({
  id,
  name,
  description,
  availability,
  href,
}: {
  id: string
  name: string
  description: string
  availability: "on" | "local" | "off"
  /** Detail page link — set on the list, omitted on the detail page itself. */
  href?: string
}) {
  const [pending, startTransition] = useTransition()
  const setAvailability = (value: string) =>
    startTransition(async () => {
      const formData = new FormData()
      formData.set("id", id)
      formData.set("availability", value)
      await setExtensionAvailabilityAction(formData)
    })
  return (
    <SettingRow
      title={name}
      description={description}
      status={EXTENSION_AVAILABILITY_LABELS[availability]}
      menu={
        <DropdownMenu>
          <RowMenuTrigger label={`Options for ${name}`} disabled={pending} />
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Run</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={availability}
              onValueChange={setAvailability}
            >
              <DropdownMenuRadioItem value="on">
                Local &amp; Remote
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="local">
                Local only
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="off">Off</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {href && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={href}>
                    <SlidersHorizontal />
                    Configure…
                  </Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  )
}

/**
 * The Access card's rows: who may open Settings on the hosted hub. Emails
 * from deploy config render locked (they survive redeploys and can only be
 * changed there); emails approved here are removable — and on a hosted
 * container they last until the next deploy.
 */
export function AdminRow({
  email,
  locked,
  lockedLabel = "deploy config",
}: {
  email: string
  locked: boolean
  /** Why this row can't be removed — "deploy config", or the last-admin guard. */
  lockedLabel?: string
}) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <p className="min-w-0 truncate font-mono text-xs">{email}</p>
      {locked ? (
        <p className="shrink-0 text-2xs text-muted-foreground">{lockedLabel}</p>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const formData = new FormData()
              formData.set("email", email)
              await removeSettingsAdminAction(formData)
            })
          }
        >
          Remove
        </Button>
      )}
    </div>
  )
}

export function AddAdminForm() {
  const [pending, startTransition] = useTransition()
  return (
    <form
      className="flex items-center gap-2 pt-2"
      onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        const formData = new FormData(form)
        startTransition(async () => {
          await addSettingsAdminAction(formData)
          form.reset()
        })
      }}
    >
      <input
        name="email"
        type="email"
        required
        placeholder="teammate@example.com"
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs shadow-xs"
        aria-label="Email to approve for Settings"
      />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Approve
      </Button>
    </form>
  )
}
