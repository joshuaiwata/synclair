import { PageDocView } from "@/components/library/page-doc-view"

export const dynamic = "force-dynamic"

/**
 * A single page's detail: the live preview + the components/blocks/templates it
 * composes. Thin route → shared view (mirrors components/[name]/page.tsx). `id`
 * is the filesystem-safe slug the page-mapper assigns each route.
 */
export default async function PageDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PageDocView id={id} />
}
