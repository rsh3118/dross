import { listProposals } from '@/app/actions/proposals'
import { PageHeader } from '@/components/shell/page-header'
import { ProposalList } from '@/components/proposals/proposal-list'

export const metadata = { title: 'Proposals' }

export default async function ProposalsPage() {
  const all = await listProposals()
  const pending = all.filter((p) => p.status === 'pending')
  const resolved = all.filter((p) => p.status !== 'pending')

  return (
    <div className="flex flex-col gap-8 p-4 md:p-8">
      <PageHeader
        eyebrow="proposals"
        title={pending.length === 0 ? 'Nothing to review' : `${pending.length} awaiting review`}
        description="Agents never change your content without asking. Approve to apply, reject to dismiss."
      />
      <ProposalList pending={pending} resolved={resolved} />
    </div>
  )
}
