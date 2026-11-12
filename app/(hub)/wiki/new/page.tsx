import { WikiEditor } from '@/components/wiki/wiki-editor'

export const metadata = { title: 'New page' }

export default function NewWikiPage() {
  return (
    <div className="p-4 md:p-8">
      <WikiEditor mode="create" />
    </div>
  )
}
