import { listDossierPeople } from '@/app/actions/dosier'
import { DosierDirectory } from '@/components/dosier/dosier-directory'
import { PageHeader } from '@/components/shell/page-header'

export const metadata = { title: 'Dosier' }

export default async function DosierPage() {
  const people = await listDossierPeople()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        eyebrow="people"
        title="Dosier"
        description="Keep important relationship context, history, and reflections in one private place."
      />
      <DosierDirectory people={people} />
    </div>
  )
}
