import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import { ArrowUpRight, Bot } from 'lucide-react'
import { requireUser } from '@/lib/session'
import { getDashboard } from '@/lib/queries/dashboard'
import { listStructure } from '@/app/actions/structure'
import { isDueToday, isOverdue } from '@/lib/tasks'
import { TodayTaskList } from '@/components/dashboard/today-task-list'
import { AgentStatusDot } from '@/components/agents/agent-status-dot'
import { AGENT_META } from '@/lib/agents/meta'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Today' }

export default async function TodayPage() {
  const user = await requireUser()
  const [data, structure] = await Promise.all([getDashboard(user.id), listStructure()])
  const boulders = structure.boulders.map((b) => ({ id: b.id, title: b.title }))

  const overdue = data.openTasks.filter(isOverdue)
  const today = data.openTasks.filter(isDueToday)
  const flagged = data.openTasks.filter((t) => t.today && !isOverdue(t) && !isDueToday(t))
  const doing = data.openTasks.filter(
    (t) => t.status === 'doing' && !t.today && !isOverdue(t) && !isDueToday(t),
  )
  const focus = [...overdue, ...today, ...flagged, ...doing].slice(0, 10)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
  const firstName = user.name.split(' ')[0]

  return (
    <div className="flex flex-col gap-8 p-4 md:p-8">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary">
          {format(new Date(), 'EEEE, MMM d')}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting}, {firstName}.
        </h1>
        <p className="text-sm text-muted-foreground">
          {overdue.length > 0
            ? `${overdue.length} overdue · ${today.length} due today · ${data.openTasks.length} open`
            : today.length > 0
              ? `${today.length} due today · ${data.openTasks.length} open`
              : `${data.openTasks.length} open tasks. Nothing is on fire.`}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3 min-w-0">
          <header className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Focus</h2>
            <Link href="/tasks" className="font-mono text-xs text-muted-foreground hover:text-foreground">
              all tasks →
            </Link>
          </header>
          <TodayTaskList tasks={focus} fallback={data.openTasks.slice(0, 5)} boulders={boulders} />
        </section>

        <div className="flex flex-col gap-6 min-w-0">
          <section className="flex flex-col gap-3">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Agents</h2>
              <Link href="/agents" className="font-mono text-xs text-muted-foreground hover:text-foreground">
                runs →
              </Link>
            </header>
            <ul className="rounded-lg border bg-card divide-y">
              {data.runs.length === 0 && (
                <li className="flex items-center gap-3 px-3 py-3 text-sm text-muted-foreground">
                  <Bot className="size-4" /> No runs yet. Kick one off from Agents.
                </li>
              )}
              {data.runs.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                  <AgentStatusDot status={r.status} />
                  <span className="text-sm flex-1 truncate">
                    <span className="font-medium">{AGENT_META[r.agent].label}</span>
                    {r.summary && <span className="text-muted-foreground"> · {r.summary}</span>}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(r.startedAt, { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {data.pendingProposals.length > 0 && (
            <section className="flex flex-col gap-3">
              <header className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Awaiting your review</h2>
                <Link href="/proposals" className="font-mono text-xs text-muted-foreground hover:text-foreground">
                  proposals →
                </Link>
              </header>
              <ul className="rounded-lg border bg-card divide-y">
                {data.pendingProposals.map((p) => (
                  <li key={p.id}>
                    <Link href="/proposals" className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40">
                      <span className="font-mono text-[11px] text-primary">{p.kind.replace('_', ' ')}</span>
                      <span className="text-sm flex-1 truncate">{p.title}</span>
                      <ArrowUpRight className="size-3.5 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Recently in the wiki</h2>
              <Link href="/wiki" className="font-mono text-xs text-muted-foreground hover:text-foreground">
                wiki →
              </Link>
            </header>
            <ul className="rounded-lg border bg-card divide-y">
              {data.recentPages.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted-foreground flex items-center justify-between gap-3">
                  Empty so far.
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/wiki/new" />}>
                    New page
                  </Button>
                </li>
              )}
              {data.recentPages.map((p) => (
                <li key={p.id}>
                  <Link href={`/wiki/${p.slug}`} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40">
                    <span className="text-sm flex-1 truncate">{p.title}</span>
                    {p.status === 'draft' && (
                      <span className="font-mono text-[10px] uppercase text-warning">draft</span>
                    )}
                    {p.authoredBy !== 'user' && (
                      <Bot className="size-3.5 text-primary" aria-label="Agent authored" />
                    )}
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(p.updatedAt, { addSuffix: true })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
