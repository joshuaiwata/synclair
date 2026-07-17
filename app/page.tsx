import { redirect } from "next/navigation"

import { SYNCLAIR_BASE } from "@/lib/system/routes"

/**
 * Root → the Synclair hub.
 *
 * This foundation is **hub-only**: Synclair runs as its own app on its own
 * server, cataloging a product that lives elsewhere (a separate repo/app on its
 * own server — the two never share one server). So `/` has no product to serve;
 * it sends visitors straight to the hub.
 */
export default function RootPage() {
  redirect(SYNCLAIR_BASE)
}
