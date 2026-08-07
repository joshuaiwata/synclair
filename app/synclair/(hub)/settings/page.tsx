import { Fragment } from "react"

import {
  AddAdminForm,
  AdminRow,
  ExtensionRow,
  SectionVisibilityRow,
} from "@/components/blocks/settings-panels"
import { HubPage } from "@/components/hub-page"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  extensionAvailability,
  getExtensionState,
  sectionVisibility,
} from "@/lib/system/extensions"
import { coreSections, EXTENSIONS } from "@/lib/system/extensions-manifest"
import { configuredAdmins, getSettingsAccess } from "@/lib/system/hub-identity"
import { isMultiSurface } from "@/lib/system/surfaces"

// State lives in data/extensions.json — read it on every request so a toggle
// (or a hand edit of the file) shows immediately. Access is also per request:
// the hosted gate forwards the viewer's identity on every hit.
export const dynamic = "force-dynamic"

/**
 * Settings — the one place to manage what the hub shows (docs/extensibility.md).
 * Core sections choose WHERE they show (everywhere / local only / hidden);
 * extensions enable/disable entirely: nav entry plus their routes, data
 * untouched. On the hosted hub the page itself is admin-gated by email
 * (lib/system/hub-identity.ts); locally it is always yours.
 */
export default async function SettingsPage() {
  const access = await getSettingsAccess()

  if (!access.admin) {
    return (
      <HubPage
        title="Settings"
        lead="Hub configuration — admin access required."
        className="gap-6"
      >
        <Card className="max-w-3xl">
          <CardContent className="py-6">
            <p className="text-sm">
              Settings on the hosted hub is limited to approved admins
              {access.email ? (
                <>
                  {" "}
                  — and{" "}
                  <code className="font-mono text-xs">{access.email}</code>{" "}
                  isn&apos;t on the list yet.
                </>
              ) : (
                " — and no signed-in identity reached the hub, so nobody is."
              )}
            </p>
            <p className="pt-2 text-xs text-muted-foreground">
              Ask an existing admin to approve your email here, or have the
              deploy config add it to SYNCLAIR_SETTINGS_ADMINS. Everything else
              in the hub is yours to browse.
            </p>
          </CardContent>
        </Card>
      </HubPage>
    )
  }

  const state = await getExtensionState()
  const sections = coreSections(isMultiSurface())
  const groups = [...new Set(sections.map((section) => section.group))]
  const envAdmins = configuredAdmins()

  return (
    <HubPage
      title="Settings"
      lead="What this clone shows, and where. A section can show everywhere, on this machine only, or nowhere — hiding only tidies the nav; it stays installed and reachable by URL. Disabling an extension turns its section off entirely; its data is never touched."
      className="gap-6"
    >
      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sections</CardTitle>
          </CardHeader>
          <CardContent>
            {groups.map((group, groupIndex) => (
              <Fragment key={group}>
                {groupIndex > 0 && <Separator className="my-3" />}
                <p className="pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {group}
                </p>
                {sections
                  .filter((section) => section.group === group)
                  .map((section) => (
                    <SectionVisibilityRow
                      key={section.id}
                      id={section.id}
                      title={section.title}
                      description={section.description}
                      visibility={sectionVisibility(
                        state,
                        section.id,
                        section.internal === true
                      )}
                    />
                  ))}
              </Fragment>
            ))}
            <Separator className="my-3" />
            <p className="text-xs text-muted-foreground">
              &ldquo;Local only&rdquo; hides a section on the deployed hub while
              your own clone keeps it — the team&apos;s working surfaces stay
              off the stakeholder view.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Extensions</CardTitle>
          </CardHeader>
          <CardContent>
            {EXTENSIONS.map((extension) => (
              <ExtensionRow
                key={extension.id}
                id={extension.id}
                name={extension.name}
                description={extension.description}
                availability={extensionAvailability(state, extension.id)}
              />
            ))}
            <Separator className="my-3" />
            <p className="text-xs text-muted-foreground">
              Installing extensions from here arrives with the extension
              contract — for now an extension is a folder plus a manifest entry.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="pb-2 text-xs text-muted-foreground">
              Who can open Settings on the hosted hub. Locally the clone is
              always yours — this list only gates the deployed one.
            </p>
            {envAdmins.map((email) => (
              <AdminRow key={email} email={email} locked />
            ))}
            {state.admins
              .filter((email) => !envAdmins.includes(email))
              .map((email, _i, list) => (
                <AdminRow
                  key={email}
                  email={email}
                  // The last way in is not removable: with no deploy-config
                  // admins, removing it closes hosted Settings to everyone and
                  // only an admin can re-open it. The action enforces this too.
                  locked={envAdmins.length === 0 && list.length === 1}
                  lockedLabel="last admin"
                />
              ))}
            {envAdmins.length + state.admins.length === 0 && (
              <p className="py-1.5 text-xs text-muted-foreground">
                No admins configured yet — on the hosted hub that means Settings
                is closed to everyone until SYNCLAIR_SETTINGS_ADMINS names
                someone.
              </p>
            )}
            <AddAdminForm />
            <Separator className="my-3" />
            <p className="text-xs text-muted-foreground">
              Approvals made here live in this clone&apos;s data file — on the
              hosted hub they last until the next deploy. Permanent admins
              belong in SYNCLAIR_SETTINGS_ADMINS.
            </p>
          </CardContent>
        </Card>
      </div>
    </HubPage>
  )
}
