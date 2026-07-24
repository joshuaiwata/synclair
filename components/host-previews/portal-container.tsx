"use client"

import { createContext, useContext } from "react"

/**
 * Optional portal target for a live host preview whose overlay (dialog / drawer /
 * sheet) portals to `document.body`.
 *
 * A body portal is correct in the real app, but inside a bounded gallery
 * preview it escapes the card and covers the page. `PreviewStage` provides its
 * own element through this context so a Path A host overlay can portal *into*
 * the frame instead. Two ways to consume it in a host:
 *   1. pass the container as an explicit `container` prop to the overlay, or
 *   2. for an overlay opened deep inside a host screen (where no prop reaches
 *      it), have the host overlay read this context — the clone bridges its own
 *      overlay to it (see the `port-host-component` skill).
 *
 * Null (the default) means "portal to body" — invisible to the app.
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null)

export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext)
}
