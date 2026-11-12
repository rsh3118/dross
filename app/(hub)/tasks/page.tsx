import { Suspense } from 'react'
import { listTasks } from '@/app/actions/tasks'
import { listStructure } from '@/app/actions/structure'
import { PageHeader } from '@/components/shell/page-header'
import { TaskBoard } from '@/components/tasks/task-board'

export const metadata = { title: 'Tasks' }

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>
}) {
  const [tasks, structure, params] = await Promise.all([listTasks(), listStructure(), searchParams])
  const openId = params.open ? Number(params.open) : undefined
  const boulders = structure.boulders.map((b) => ({ id: b.id, title: b.title }))
  const mountains = structure.mountains.map((m) => ({ id: m.id, title: m.title }))

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        eyebrow="tasks"
        title="Everything in flight"
        description="Type to add, or open Defaults for the full card. Tokens: #tag · !urgent/!necessary/!important · ~errand/~focus/~deep · @tomorrow · *today · ?research."
      />
      <Suspense fallback={<div className="h-40 rounded-lg border bg-card" />}>
        <TaskBoard initialTasks={tasks} boulders={boulders} mountains={mountains} openId={openId} />
      </Suspense>
    </div>
  )
}
