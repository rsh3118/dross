import { listRuns } from '@/app/actions/agents'
import { PageHeader } from '@/components/shell/page-header'
import { AgentGrid } from '@/components/agents/agent-grid'
import { RunList } from '@/components/agents/run-list'

export const metadata = { title: 'Agents' }

export default async function AgentsPage() {
  const runs = await listRuns()

  return (
    <div className="flex flex-col gap-8 p-4 md:p-8">
      <PageHeader
        eyebrow="agents"
        title="Your staff"
        description="Five autonomous workers. Each runs on a schedule and can be kicked off by hand."
      />
      <AgentGrid runs={runs} />
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Run log</h2>
        <RunList runs={runs} />
      </section>
    </div>
  )
}
