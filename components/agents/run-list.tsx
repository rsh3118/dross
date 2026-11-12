'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, formatDistanceToNow } from 'date-fns'
import { ChevronDown } from 'lucide-react'
import type { AgentRun } from '@/lib/db/schema'
import { AGENT_META } from '@/lib/agents/meta'
import { AgentStatusDot } from '@/components/agents/agent-status-dot'
import { cn } from '@/lib/utils'

export function RunList({ runs }: { runs: AgentRun[] }) {
  const router = useRouter()
  const [open, setOpen] = useState<number | null>(runs.find((r) => r.status === 'running')?.id ?? null)
  const anyActive = runs.some((r) => r.status === 'running' || r.status === 'queued')

  // Poll while something is in flight so the log fills in live.
  useEffect(() => {
    if (!anyActive) return
    const t = setInterval(() => router.refresh(), 4000)
    return () => clearInterval(t)
  }, [anyActive, router])

  if (runs.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        No runs yet.
      </p>
    )
  }

  return (
    <ul className="rounded-lg border bg-card divide-y">
      {runs.map((r) => {
        const expanded = open === r.id
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : r.id)}
              aria-expanded={expanded}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
            >
              <AgentStatusDot status={r.status} />
              <span className="text-sm font-medium w-28 shrink-0">{AGENT_META[r.agent].label}</span>
              <span className="text-sm text-muted-foreground flex-1 truncate">
                {r.summary ?? r.error ?? (r.input as { topic?: string; request?: string })?.topic ?? (r.input as { request?: string })?.request ?? r.status}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground shrink-0 hidden sm:inline">
                {r.trigger}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                {formatDistanceToNow(r.startedAt, { addSuffix: true })}
              </span>
              <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
            </button>
            {expanded && (
              <div className="border-t bg-background/60 px-4 py-3">
                <ol className="flex flex-col gap-1 font-mono text-xs">
                  {r.log.length === 0 && <li className="text-muted-foreground">waiting for first step…</li>}
                  {r.log.map((entry, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {format(new Date(entry.at), 'HH:mm:ss')}
                      </span>
                      <span
                        className={cn(
                          entry.level === 'error' && 'text-destructive',
                          entry.level === 'warn' && 'text-warning',
                        )}
                      >
                        {entry.message}
                      </span>
                    </li>
                  ))}
                </ol>
                {r.runId && (
                  <p className="mt-3 font-mono text-[10px] text-muted-foreground">workflow run {r.runId}</p>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
