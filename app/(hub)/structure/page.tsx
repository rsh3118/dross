import { listStructure } from '@/app/actions/structure'
import { PageHeader } from '@/components/shell/page-header'
import { StructureView } from '@/components/structure/structure-view'

export const metadata = { title: 'Structure' }

export default async function StructurePage() {
  const { mountains, boulders, tasks } = await listStructure()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        eyebrow="mountains & boulders"
        title="The bigger picture"
        description="Mountains are your objectives. Boulders are the projects that ladder up to them. Stones roll up into boulders."
      />
      <StructureView mountains={mountains} boulders={boulders} tasks={tasks} />
    </div>
  )
}
