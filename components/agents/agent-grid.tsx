'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Play } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentName, AgentRun } from '@/lib/db/schema'
import { AGENT_META } from '@/lib/agents/meta'
import { runAgentNow } from '@/app/actions/agents'
import { AgentStatusDot } from '@/components/agents/agent-status-dot'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

const ORDER: AgentName[] = ['research', 'housekeeping', 'newsletter', 'notify', 'code']

export function AgentGrid({ runs }: { runs: AgentRun[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [prompting, setPrompting] = useState<AgentName | null>(null)
  const [topic, setTopic] = useState('')

  const latest = (agent: AgentName) => runs.find((r) => r.agent === agent)

  const run = (agent: AgentName, t?: string) =>
    startTransition(async () => {
      try {
        await runAgentNow({ agent, topic: t })
        toast(`${AGENT_META[agent].label} started`)
        setPrompting(null)
        setTopic('')
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not start agent')
      }
    })

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {ORDER.map((agent) => {
          const meta = AGENT_META[agent]
          const last = latest(agent)
          const needsInput = agent === 'research' || agent === 'code'
          return (
            <article key={agent} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              <header className="flex items-center gap-2">
                <AgentStatusDot status={last?.status ?? 'queued'} />
                <h3 className="text-sm font-medium">{meta.label}</h3>
              </header>
              <p className="text-sm text-muted-foreground text-pretty flex-1">{meta.description}</p>
              <dl className="font-mono text-[11px] text-muted-foreground flex flex-col gap-0.5">
                <div className="flex gap-2">
                  <dt className="w-12 shrink-0">runs</dt>
                  <dd>{meta.schedule}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-12 shrink-0">last</dt>
                  <dd className="truncate">
                    {last ? `${formatDistanceToNow(last.startedAt, { addSuffix: true })} · ${last.status}` : 'never'}
                  </dd>
                </div>
              </dl>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || last?.status === 'running'}
                onClick={() => (needsInput ? setPrompting(agent) : run(agent))}
              >
                <Play className="size-3.5" /> Run now
              </Button>
            </article>
          )
        })}
      </div>

      <Dialog open={!!prompting} onOpenChange={(o) => !o && setPrompting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{prompting ? AGENT_META[prompting].label : ''}</DialogTitle>
            <DialogDescription>
              {prompting === 'code'
                ? 'Describe the change in plain language. The agent will open a pull request for review.'
                : 'What should the agent look into? Be as specific as you like.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            rows={4}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={
              prompting === 'code'
                ? 'e.g. Add a "snooze until tomorrow" button to task rows'
                : 'e.g. Best practices for a 3-day fast, with safety considerations'
            }
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPrompting(null)}>Cancel</Button>
            <Button disabled={pending || topic.trim().length < 3} onClick={() => prompting && run(prompting, topic)}>
              Start
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
