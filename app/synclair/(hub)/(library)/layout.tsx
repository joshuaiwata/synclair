import { LibraryExplorer } from "@/components/library/library-explorer"
import { getCatalog, isFoundationVisible } from "@/lib/system/components"
import { buildLibraryTree } from "@/lib/system/library-tree"

/**
 * The library section shell: every library route (flat tier pages, the /library
 * home, and surface-scoped pages) renders inside the two-pane explorer — dense
 * tree + breadcrumbed content pane. The tree is built server-side from the
 * catalog; the client only holds expand/filter state.
 */
export default async function LibraryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [catalog, foundationVisible] = await Promise.all([getCatalog(), isFoundationVisible()])
  const tree = buildLibraryTree(catalog, foundationVisible)
  return <LibraryExplorer tree={tree}>{children}</LibraryExplorer>
}
