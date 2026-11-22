import { notFound } from 'next/navigation'
import { getDossierPerson } from '@/app/actions/dosier'
import { DosierProfile } from '@/components/dosier/dosier-profile'
import { PageHeader } from '@/components/shell/page-header'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const personId = Number(id)
  if (!Number.isSafeInteger(personId) || personId < 1) return { title: 'Person · Dosier' }
  const dossier = await getDossierPerson(personId)
  return { title: dossier ? `${dossier.person.name} · Dosier` : 'Person · Dosier' }
}

export default async function DosierPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const personId = Number(id)
  if (!Number.isSafeInteger(personId) || personId < 1) notFound()

  const dossier = await getDossierPerson(personId)
  if (!dossier) notFound()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        eyebrow="person dossier"
        title={dossier.person.name}
        description="A living record of the relationship, its history, and reflections."
      />
      <DosierProfile
        person={dossier.person}
        history={dossier.history}
        reflections={dossier.reflections}
      />
    </div>
  )
}
