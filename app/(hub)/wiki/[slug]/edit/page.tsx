import { notFound } from 'next/navigation'
import { getWikiPage } from '@/app/actions/wiki'
import { WikiEditor } from '@/components/wiki/wiki-editor'

export const metadata = { title: 'Edit page' }

export default async function EditWikiPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const result = await getWikiPage(slug)
  if (!result) notFound()
  return (
    <div className="p-4 md:p-8">
      <WikiEditor mode="edit" page={result.page} />
    </div>
  )
}
