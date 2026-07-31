"use client"

import { useState, type ReactNode } from "react"

import { PortalContainerContext } from "./portal-container"

/**
 * A bounded stage for an OPEN-overlay host preview (a dialog/drawer/sheet, or a
 * host screen that opens one). Two jobs:
 *  - it provides its own element as `PortalContainerContext`, so a host overlay
 *    that reads that context portals INTO this frame instead of document.body;
 *  - its `transform` makes the overlay's `position: fixed` resolve to this frame,
 *    so an always-open drawer/dialog (and any bespoke fixed overlay) stays inside
 *    the card instead of covering the gallery.
 * Children render only once the stage element exists, so the portal target is
 * ready on first paint.
 *
 * See the `port-host-component` skill for wiring a specific host's overlay to
 * the container (a `container` prop or the context above).
 */
export function PreviewStage({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  return (
    <div
      ref={setEl}
      className={
        "stage-canvas relative overflow-hidden rounded-lg border [transform:translateZ(0)] " +
        className
      }
    >
      {el ? (
        <PortalContainerContext.Provider value={el}>{children}</PortalContainerContext.Provider>
      ) : null}
    </div>
  )
}
