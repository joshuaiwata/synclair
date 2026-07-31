"use client"

/** Registry-exempt (infra): the containment wrapper every live host preview renders inside — never product UI. */
import { Component, useSyncExternalStore, type ReactNode } from "react"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"

/**
 * CONTAINMENT for a live host preview.
 *
 * Path A renders the host's ACTUAL components inside the hub, which means the
 * hub inherits their failure modes. Two of those escape the card and take the
 * page with them:
 *
 *   A THROW DURING RENDER — a scene rendered outside a required provider, or
 *   touching `window` during the server pass. Without a boundary this
 *   propagates to the route and every OTHER card goes with it. Observed on a
 *   real clone: three separate scene bugs, three whole-tier outages.
 *
 *   A NAVIGATION — a host component whose link or row click is a real
 *   navigation. Clicked inside a gallery card it navigates the WHOLE HUB to a
 *   host route. Observed: the library page ended up on `/marketplace?post=…`.
 *
 * So a broken preview degrades to a broken CARD, which is the honest outcome:
 * the gallery still lists everything, and the one that failed says so.
 *
 * What this does NOT contain, deliberately:
 *
 *   BUILD-TIME failures. `registry.tsx` imports every scene statically, so an
 *   unresolvable specifier is a compile error — there is no component to wrap.
 *   That's `check:previews`' job (it resolves every `@host/*` import), and it
 *   has to stay that way.
 *
 *   A FULL PAGE LOAD — `window.location = …` in a host component bypasses both
 *   the anchor guard and the router. Rare, and unfixable without patching
 *   globals the hub itself relies on.
 */

interface Props {
  /** Catalog name, so the fallback can say which preview failed. */
  name: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Host previews render in the BROWSER only.
 *
 * An error boundary cannot save a throw that happens during SSR — React reports
 * it and Next fails the route, boundary or not. And SSR is where host scenes
 * fail most: a hook that needs a provider, or `window` touched during render
 * (which `"use client"` does NOT prevent — it still renders on the server).
 *
 * Deferring to an effect removes the server pass for previews entirely, so the
 * whole class of SSR failure can't reach the route, and anything that still
 * throws does so on the client where the boundary catches it.
 *
 * The trade is deliberate: previews are absent from the server HTML. They're
 * interactive scenes, not content — nothing links to them, nothing indexes
 * them. (Worth knowing if you assert on server HTML: check the running page,
 * not `curl`.)
 */
/**
 * An INERT router for previews.
 *
 * Host components navigate — a marketplace Feed calls `router.replace()` on
 * mount to select a default post. Rendered inside a gallery card that takes the
 * WHOLE HUB to a host route, on load, with no interaction: the observed symptom
 * was the library page landing on `/marketplace?post=…`.
 *
 * Overriding the context that `useRouter()` reads confines it: the host
 * component runs its real code path and the navigation goes nowhere. This is
 * the same technique Storybook's Next.js integration uses.
 *
 * `app-router-context.shared-runtime` is an internal path — the trade for
 * containing the whole class of navigation escape without patching `history`
 * globally, which would break the hub's own routing. If a Next upgrade moves
 * it, the import fails loudly at build rather than silently letting previews
 * navigate again.
 */
const inertRouter: AppRouterInstance = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
}

/** Never resubscribes — "am I on the client" is not a changing value. */
const noop = () => () => {}

function ClientOnly({ children }: { children: ReactNode }) {
  // useSyncExternalStore states the server/client split directly, instead of
  // the setState-in-an-effect version (which the hooks lint rejects for
  // triggering a cascading render, correctly).
  const onClient = useSyncExternalStore(
    noop,
    () => true,
    () => false
  )
  if (!onClient) {
    return <div className="h-full w-full animate-pulse bg-muted/40" aria-hidden />
  }
  return <>{children}</>
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  /**
   * Swallow clicks that would navigate. Capture phase so the host's own
   * handlers never run: by the time a bubbled handler fires, a framework link
   * may already have started the transition.
   *
   * Only anchors with a real destination are stopped — buttons, toggles, and
   * in-preview interactions still work, which is most of the point of a live
   * preview.
   */
  private containNavigation = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]")
    if (!anchor) return
    const href = anchor.getAttribute("href")
    // In-page anchors are harmless and sometimes meaningful (skip links).
    if (!href || href.startsWith("#")) return
    event.preventDefault()
    event.stopPropagation()
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div className="flex h-full w-full items-center justify-center p-4">
          <div className="max-w-full space-y-1 text-center">
            <p className="text-sm font-medium text-destructive">Preview failed</p>
            <p className="truncate font-mono text-xs text-muted-foreground" title={error.message}>
              {error.message}
            </p>
            <p className="text-xs text-muted-foreground">
              {this.props.name} — the catalog entry is fine; its preview scene needs a fix.
            </p>
          </div>
        </div>
      )
    }
    // `contents` so the wrapper adds no box of its own — the stage and thumb
    // own layout, and a stray div here would change how every preview sizes.
    return (
      <div className="contents" onClickCapture={this.containNavigation}>
        {this.props.children}
      </div>
    )
  }
}

/**
 * Wrap every live host preview in this. Order matters: the boundary sits
 * OUTSIDE the client-only gate, so if the deferred render throws there is
 * already a boundary mounted to catch it.
 */
export function PreviewBoundary({ name, children }: Props) {
  return (
    <ErrorBoundary name={name}>
      <ClientOnly>
        <AppRouterContext.Provider value={inertRouter}>{children}</AppRouterContext.Provider>
      </ClientOnly>
    </ErrorBoundary>
  )
}
