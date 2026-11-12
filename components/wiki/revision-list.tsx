'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { getRevision, restoreRevision } from '@/app/actions/wiki'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Rev = { id: number; title: string; authoredBy: string; createdAt: Date }

export function RevisionList({ pageId, revisions }: { pageId: number; revisions: Rev[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState<{ rev: Rev; content: string } | null>(null)

  const view = (rev: Rev) =>
    startTransition(async () => {
      const full = await getRevision(rev.id)
      if (full) setOpen({ rev, content: full.content })
    })

  const restore = () => {
    if (!open) return
    startTransition(async () => {
      const slug = await restoreRevision(pageId, open.rev.id)
      setOpen(null)
      toast('Revision restored')
      router.push(`/wiki/${slug}`)
      router.refresh()
    })
  }

  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">History</h2>
      <ul className="flex flex-col">
        {revisions.map((r, i) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => view(r)}
              disabled={pending}
              className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs hover:text-primary"
            >
              <span className="font-mono">{format(r.createdAt, 'MM-dd HH:mm')}</span>
              <span className="text-muted-foreground truncate">
                {i === 0 ? 'current' : r.authoredBy === 'user' ? 'you' : r.authoredBy.replace('-agent', '')}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 pr-6">
              <span className="truncate">{open?.rev.title}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {open && format(open.rev.createdAt, 'yyyy-MM-dd HH:mm')}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto scrollbar-thin rounded-md border p-4 bg-card flex-1">
            {open && <Markdown content={open.content} />}
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={restore} disabled={pending}>
              Restore this version
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
