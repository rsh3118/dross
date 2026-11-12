'use client'

import { useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Check, Ear, X } from 'lucide-react'
import { toast } from 'sonner'
import type { CapturedTask } from '@/lib/db/schema'
import {
  resolveAllCaptured,
  resolveCapturedAction,
} from '@/app/actions/ambient'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CapturedList({ initial }: { initial: CapturedTask[] }) {
  const [items, setItems] = useState(initial)
  const [busy, startTransition] = useTransition()

  const act = (id: number, action: 'approve' | 'dismiss') =>
    startTransition(async () => {
      setItems((cur) => cur.filter((c) => c.id !== id))
      try {
        await resolveCapturedAction(id, action)
        toast(action === 'approve' ? 'Added to your list' : 'Dismissed')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed')
      }
    })

  const actAll = (action: 'approve' | 'dismiss') =>
    startTransition(async () => {
      const snapshot = items
      setItems([])
      try {
        const { resolved } = await resolveAllCaptured(action)
        toast(action === 'approve' ? `Added ${resolved}` : `Dismissed ${resolved}`)
      } catch (e) {
        setItems(snapshot)
        toast.error(e instanceof Error ? e.message : 'Failed')
      }
    })

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
        <Ear className="size-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-pretty">
          Nothing overheard yet. When a room device catches something actionable, it lands here for
          your approval.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {items.length} to review
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => actAll('dismiss')}>
            Dismiss all
          </Button>
          <Button size="sm" disabled={busy} onClick={() => actAll('approve')}>
            <Check className="size-4" /> Add all
          </Button>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {items.map((c) => {
          const note = (c.payload as { note?: string })?.note
          return (
            <li
              key={c.id}
              className={cn(
                'flex flex-col gap-3 rounded-xl border bg-card p-4',
                busy && 'opacity-70',
              )}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 w-16 shrink-0 font-mono text-[11px] uppercase tracking-wider text-primary">
                  {c.group}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="text-balance text-sm font-medium">{c.title}</h3>
                  {note && <p className="text-pretty text-sm text-muted-foreground">{note}</p>}
                  {c.excerpt && (
                    <p className="text-pretty text-xs italic leading-relaxed text-muted-foreground/80">
                      &ldquo;{c.excerpt.slice(0, 160)}
                      {c.excerpt.length > 160 ? '…' : ''}&rdquo;
                    </p>
                  )}
                  <p className="font-mono text-[11px] text-muted-foreground">
                    overheard {formatDistanceToNow(c.createdAt, { addSuffix: true })}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act(c.id, 'dismiss')}
                >
                  <X className="size-4" /> Dismiss
                </Button>
                <Button size="sm" disabled={busy} onClick={() => act(c.id, 'approve')}>
                  <Check className="size-4" /> Add task
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
