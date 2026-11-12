'use client'

import { useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Check, ExternalLink, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Proposal } from '@/lib/db/schema'
import { approveProposal, rejectProposal } from '@/app/actions/proposals'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const KIND_LABEL: Record<Proposal['kind'], string> = {
  merge_pages: 'merge',
  fix_link: 'broken link',
  archive_task: 'stale task',
  retag: 'retag',
  code_change: 'pull request',
}

export function ProposalList({ pending, resolved }: { pending: Proposal[]; resolved: Proposal[] }) {
  const [pendingTx, startTransition] = useTransition()
  const [showResolved, setShowResolved] = useState(false)

  const act = (id: number, action: 'approve' | 'reject') =>
    startTransition(async () => {
      try {
        if (action === 'approve') await approveProposal(id)
        else await rejectProposal(id)
        toast(action === 'approve' ? 'Applied' : 'Dismissed')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed')
      }
    })

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-3">
        {pending.length === 0 && (
          <li className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            Inbox zero. Housekeeping runs nightly; you can also start it from Agents.
          </li>
        )}
        {pending.map((p) => {
          const prUrl = (p.payload as { prUrl?: string }).prUrl
          return (
            <li key={p.id} className={cn('rounded-lg border bg-card p-4 flex flex-col gap-3', pendingTx && 'opacity-70')}>
              <div className="flex items-start gap-3">
                <span className="font-mono text-[11px] uppercase tracking-wider text-primary shrink-0 pt-0.5 w-20">
                  {KIND_LABEL[p.kind]}
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <h3 className="text-sm font-medium text-balance">{p.title}</h3>
                  <p className="text-sm text-muted-foreground text-pretty">{p.rationale}</p>
                  {prUrl && (
                    <a
                      href={prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4"
                    >
                      Open pull request <ExternalLink className="size-3" />
                    </a>
                  )}
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {p.agent} · {formatDistanceToNow(p.createdAt, { addSuffix: true })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" disabled={pendingTx} onClick={() => act(p.id, 'reject')}>
                  <X className="size-4" /> {p.kind === 'code_change' ? 'Close PR' : 'Reject'}
                </Button>
                <Button size="sm" disabled={pendingTx} onClick={() => act(p.id, 'approve')}>
                  <Check className="size-4" /> {p.kind === 'code_change' ? 'Merge PR' : 'Approve'}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {resolved.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowResolved((s) => !s)}
            className="self-start font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            {showResolved ? 'hide' : 'show'} {resolved.length} resolved
          </button>
          {showResolved && (
            <ul className="rounded-lg border bg-card divide-y">
              {resolved.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span
                    className={cn(
                      'font-mono text-[11px] w-16 shrink-0',
                      p.status === 'approved' ? 'text-success' : 'text-muted-foreground',
                    )}
                  >
                    {p.status}
                  </span>
                  <span className="flex-1 truncate text-muted-foreground">{p.title}</span>
                  <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                    {p.resolvedAt && formatDistanceToNow(p.resolvedAt, { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
