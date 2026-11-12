import { listJournal } from '@/app/actions/journal'
import { PageHeader } from '@/components/shell/page-header'
import { JournalView } from '@/components/journal/journal-view'

export const metadata = { title: 'Journal' }

export default async function JournalPage() {
  const entries = await listJournal()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        eyebrow="reflection"
        title="Journal"
        description="Daily check-ins and relationship reflections. Capture how things went, what you felt, and the lessons worth keeping."
      />
      <JournalView entries={entries} />
    </div>
  )
}
