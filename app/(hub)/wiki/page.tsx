import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { Plus } from 'lucide-react'
import { listWikiPages } from '@/app/actions/wiki'
import { db } from '@/lib/db'
import { wikiPages } from '@/lib/db/schema'
import { getUserId } from '@/lib/session'
import { PageHeader } from '@/components/shell/page-header'
import { WikiIndex } from '@/components/wiki/wiki-index'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Wiki' }

export default async function WikiPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  if (params.page) {
    const userId = await getUserId()
    const [p] = await db
      .select({ slug: wikiPages.slug })
      .from(wikiPages)
      .where(and(eq(wikiPages.id, Number(params.page)), eq(wikiPages.userId, userId)))
    if (p) redirect(`/wiki/${p.slug}`)
  }

  const pages = await listWikiPages()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        eyebrow="wiki"
        title="What you know"
        description="Markdown pages with [[wiki links]], revision history, and agent-written research."
        actions={
          <Button nativeButton={false} render={<Link href="/wiki/new" />}>
            <Plus className="size-4" /> New page
          </Button>
        }
      />
      <WikiIndex pages={pages} />
    </div>
  )
}
