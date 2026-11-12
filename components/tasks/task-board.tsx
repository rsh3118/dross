'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Circle, Mountain } from 'lucide-react'
import type { Task, TaskGroup, TaskStatus } from '@/lib/db/schema'
import { deleteTask, setTaskStatus, toggleToday, updateTask } from '@/app/actions/tasks'
import {
  CATEGORY_LABELS,
  PRIORITIES,
  RECURRENCES,
  STATUSES,
  TYPES,
  belongsOnDeck,
  belongsThisWeek,
  dueLabel,
  isClosed,
  isHabit,
} from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TaskRow } from '@/components/tasks/task-row'
import { TaskSheet } from '@/components/tasks/task-sheet'
import { TaskComposer, type ComposerDefaults, type ProjectOptions } from '@/components/tasks/task-composer'

type Option = { id: number; title: string }

type ViewKey = 'all' | 'habits' | 'personal' | 'work'

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'habits', label: 'Habits' },
  { key: 'personal', label: 'Personal' },
  { key: 'work', label: 'Work' },
]

type GroupByKey =
  | 'urgency'
  | 'none'
  | 'status'
  | 'priority'
  | 'type'
  | 'group'
  | 'category'
  | 'recurrence'
  | 'project'
  | 'due'

const GROUP_BYS: { key: GroupByKey; label: string }[] = [
  { key: 'urgency', label: 'Urgency' },
  { key: 'none', label: 'No grouping' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'type', label: 'Type' },
  { key: 'group', label: 'Personal / Work' },
  { key: 'category', label: 'Category' },
  { key: 'recurrence', label: 'Recurrence' },
  { key: 'project', label: 'Project' },
  { key: 'due', label: 'Due' },
]

function groupOf(view: ViewKey): TaskGroup | null {
  return view === 'personal' || view === 'work' ? view : null
}

function matchesView(t: Task, view: ViewKey): boolean {
  if (view === 'habits') return isHabit(t.recurrence)
  const group = groupOf(view)
  return !group || t.group === group
}

/** Merge an edit into a task locally so the UI updates instantly. */
function mergePatch(t: Task, patch: Parameters<typeof updateTask>[1]): Task {
  const next: Task = { ...t }
  const p = patch as Record<string, unknown>
  if (p.title !== undefined) next.title = p.title as string
  if (p.status !== undefined) next.status = p.status as Task['status']
  if (p.priority !== undefined) next.priority = p.priority as Task['priority']
  if (p.type !== undefined) next.type = p.type as Task['type']
  if (p.group !== undefined) next.group = p.group as Task['group']
  if (p.category !== undefined) next.category = p.category as Task['category']
  if (p.recurrence !== undefined) next.recurrence = p.recurrence as Task['recurrence']
  if (p.boulderId !== undefined) next.boulderId = (p.boulderId as number | null) ?? null
  if (p.today !== undefined) next.today = p.today as boolean
  if (p.thisWeek !== undefined) next.thisWeek = p.thisWeek as boolean
  if (p.topItem !== undefined) next.topItem = p.topItem as boolean
  if (p.dueAt !== undefined) next.dueAt = p.dueAt ? new Date(p.dueAt as string) : null
  return next
}

export function TaskBoard({
  initialTasks,
  boulders = [],
  mountains = [],
  openId,
}: {
  initialTasks: Task[]
  boulders?: Option[]
  mountains?: Option[]
  openId?: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  // Local copy of the list so edits reflect immediately; reconciled whenever the
  // server sends fresh data after revalidation.
  const [tasks, setTasks] = useState(initialTasks)
  useEffect(() => setTasks(initialTasks), [initialTasks])

  const [view, setView] = useState<ViewKey>('all')
  const [groupBy, setGroupBy] = useState<GroupByKey>('urgency')
  const [showClosed, setShowClosed] = useState(false)
  const [closedBuckets, setClosedBuckets] = useState<Set<BucketKey>>(new Set())
  const [selected, setSelected] = useState<number | null>(openId ?? null)

  const project = searchParams.get('project') ?? ''

  const projectName = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of boulders) m.set(`b-${b.id}`, b.title)
    for (const mt of mountains) m.set(`m-${mt.id}`, mt.title)
    return m
  }, [boulders, mountains])

  const setProject = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (!value || value === 'all') params.delete('project')
      else params.set('project', value)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  // Optimistic mutation handlers: update local state now, sync server in background.
  const onPatch = useCallback((id: number, patch: Parameters<typeof updateTask>[1]) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? mergePatch(t, patch) : t)))
    startTransition(async () => {
      await updateTask(id, patch)
    })
  }, [])
  const onStatus = useCallback((id: number, status: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)))
    startTransition(async () => {
      await setTaskStatus(id, status)
    })
  }, [])
  const onToday = useCallback((id: number, today: boolean) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, today } : t)))
    startTransition(async () => {
      await toggleToday(id, today)
    })
  }, [])
  const onDelete = useCallback((id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setSelected((s) => (s === id ? null : s))
    startTransition(async () => {
      await deleteTask(id)
    })
  }, [])

  // Project filter applies to the whole page before any view scoping.
  const projectFiltered = useMemo(() => {
    if (!project) return tasks
    if (project.startsWith('b-')) {
      const id = Number(project.slice(2))
      return tasks.filter((t) => t.boulderId === id)
    }
    if (project.startsWith('m-')) {
      const id = Number(project.slice(2))
      return tasks.filter((t) => t.mountainId === id)
    }
    return tasks
  }, [tasks, project])

  const counts = useMemo(() => {
    const open = projectFiltered.filter((t) => !isClosed(t.status))
    const out = {} as Record<ViewKey, number>
    for (const v of VIEWS) out[v.key] = open.filter((t) => matchesView(t, v.key)).length
    return out
  }, [projectFiltered])

  const scoped = useMemo(
    () => projectFiltered.filter((t) => matchesView(t, view)),
    [projectFiltered, view],
  )
  const visible = useMemo(
    () => scoped.filter((t) => {
      const bucket = bucketFor(t)
      const includeClosed = showClosed || closedBuckets.has(bucket)
      return includeClosed || !isClosed(t.status)
    }),
    [scoped, closedBuckets, showClosed],
  )
  const closedCount = scoped.filter((t) => isClosed(t.status)).length

  // Break the visible list into ordered, labelled sections for the group-by view.
  const sections = useMemo(
    () => buildSections(visible, view, groupBy, projectName),
    [visible, view, groupBy, projectName],
  )

  const selectedTask = tasks.find((t) => t.id === selected) ?? null

  const composerDefaults: ComposerDefaults = {
    group: groupOf(view) ?? undefined,
    urgency: 'top',
    recurrence: view === 'habits' ? 'daily' : undefined,
    project,
  }
  const projectOptions: ProjectOptions = { mountains, boulders }
  const hasProjects = mountains.length > 0 || boulders.length > 0
  const rowProjects = boulders

  const renderRow = (t: Task) => (
    <TaskRow
      key={t.id}
      task={t}
      projects={rowProjects}
      onOpen={() => setSelected(t.id)}
      onPatch={onPatch}
      onStatus={onStatus}
      onToday={onToday}
      onDelete={onDelete}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <TaskComposer projects={projectOptions} defaults={composerDefaults} />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="scrollbar-thin -mx-1 flex items-center gap-0.5 overflow-x-auto rounded-md border bg-card p-0.5 px-1">
          {VIEWS.map((v) => (
            <Button
              key={v.key}
              variant={view === v.key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView(v.key)}
              aria-pressed={view === v.key}
              className="shrink-0 gap-1.5"
            >
              {v.label}
              <span
                className={cn(
                  'rounded-full px-1.5 font-mono text-[10px] tabular-nums',
                  view === v.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                {counts[v.key]}
              </span>
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={groupBy} onValueChange={(v) => setGroupBy((v as GroupByKey) || 'none')}>
            <SelectTrigger className="h-9 w-44 bg-card" aria-label="Group by">
              <span className="text-muted-foreground">Group:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_BYS.map((g) => (
                <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasProjects && (
            <Select value={project || 'all'} onValueChange={(v) => setProject(v ?? 'all')}>
              <SelectTrigger className="h-9 w-48 bg-card" aria-label="Filter by project">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {mountains.map((m) => (
                  <SelectItem key={`m-${m.id}`} value={`m-${m.id}`}>
                    <Mountain className="size-3.5 text-muted-foreground" /> {m.title}
                  </SelectItem>
                ))}
                {boulders.map((b) => (
                  <SelectItem key={`b-${b.id}`} value={`b-${b.id}`}>
                    <Circle className="size-3.5 text-muted-foreground" /> {b.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nothing here. Add a task above.
          </p>
        </div>
      ) : groupBy === 'urgency' ? (
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <section key={section.key} className="flex flex-col gap-2">
              <header className="flex items-center justify-between gap-2 px-1"><div className="flex items-center gap-2"><h2 className="text-sm font-medium">{section.label}</h2><span className="font-mono text-xs text-muted-foreground">{section.tasks.length}</span></div><button type="button" className="font-mono text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setClosedBuckets((current) => { const next = new Set(current); next.has(section.key as BucketKey) ? next.delete(section.key as BucketKey) : next.add(section.key as BucketKey); return next })}>{closedBuckets.has(section.key as BucketKey) ? 'hide done/skipped' : 'show done/skipped'}</button></header>
              <div className="divide-y overflow-hidden rounded-lg border bg-card">{section.tasks.map(renderRow)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <section key={section.key} className="flex flex-col gap-2">
              <header className="flex items-center gap-2 px-1">
                <h2 className="text-sm font-medium">{section.label}</h2>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {section.tasks.length}
                </span>
              </header>
              <div className="divide-y overflow-hidden rounded-lg border bg-card">
                {section.tasks.map(renderRow)}
              </div>
            </section>
          ))}
        </div>
      )}

      {closedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowClosed((s) => !s)}
          className="self-start rounded-md px-3 py-1.5 font-mono text-xs text-muted-foreground hover:bg-muted/40"
        >
          {showClosed ? 'hide' : 'show'} {closedCount} done/skipped
        </button>
      )}

      <TaskSheet task={selectedTask} boulders={boulders} onClose={() => setSelected(null)} />
    </div>
  )
}

type BucketKey = 'top' | 'today' | 'week' | 'backlog'
type Section = { key: string; label: string; tasks: Task[] }
const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'backlog', label: 'Backlog' },
]

function bucketFor(task: Task): BucketKey {
  return task.urgency
}

function sortTasks(list: Task[]) {
  const priority = { urgent: 0, necessary: 1, important: 2, normal: 3 }
  return [...list].sort((a, b) => {
    const byPriority = priority[a.priority] - priority[b.priority]
    if (byPriority) return byPriority
    if (a.group !== b.group) return a.group === 'personal' ? -1 : 1
    return a.title.localeCompare(b.title)
  })
}

/** Group + order a task list by the chosen attribute. */
function buildSections(list: Task[], view: ViewKey, by: GroupByKey, projectName: Map<string, string>): Section[] {
  if (by === 'urgency') {
    const buckets = BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.key === 'top' ? 'Top items' : bucket.label,
      tasks: list.filter((task) => bucketFor(task) === bucket.key),
    }))
    return buckets.filter((section) => section.tasks.length > 0).map((section) => ({ ...section, tasks: sortTasks(section.tasks) }))
  }
  if (by === 'none') return [{ key: 'all', label: 'All', tasks: sortTasks(list) }]

  const keyLabel = (t: Task): { key: string; label: string; order: number } => {
    switch (by) {
      case 'status': {
        const order = STATUSES.findIndex((s) => s.value === t.status)
        return { key: t.status, label: STATUSES[order]?.label ?? t.status, order }
      }
      case 'priority': {
        const order = PRIORITIES.findIndex((p) => p.value === t.priority)
        return { key: t.priority, label: PRIORITIES[order]?.label ?? t.priority, order }
      }
      case 'type': {
        const order = TYPES.findIndex((x) => x.value === t.type)
        return { key: t.type, label: TYPES[order]?.label ?? t.type, order }
      }
      case 'group':
        return {
          key: t.group,
          label: t.group === 'personal' ? 'Personal' : 'Work',
          order: t.group === 'personal' ? 0 : 1,
        }
      case 'category':
        return { key: t.category, label: CATEGORY_LABELS[t.category] ?? t.category, order: 0 }
      case 'recurrence': {
        const order = RECURRENCES.findIndex((r) => r.value === t.recurrence)
        return { key: t.recurrence, label: RECURRENCES[order]?.label ?? t.recurrence, order }
      }
      case 'project': {
        if (t.boulderId) {
          const label = projectName.get(`b-${t.boulderId}`) ?? `Project #${t.boulderId}`
          return { key: `b-${t.boulderId}`, label, order: 1 }
        }
        if (t.mountainId) {
          const label = projectName.get(`m-${t.mountainId}`) ?? `Mountain #${t.mountainId}`
          return { key: `m-${t.mountainId}`, label, order: 1 }
        }
        return { key: 'none', label: 'No project', order: 2 }
      }
      case 'due': {
        const d = dueLabel(t.dueAt)
        if (!t.dueAt) return { key: 'nodate', label: 'No due date', order: 5 }
        if (d?.tone === 'danger') return { key: 'overdue', label: 'Overdue', order: 0 }
        if (d?.text === 'Today') return { key: 'today', label: 'Due today', order: 1 }
        if (d?.text === 'Tomorrow') return { key: 'tomorrow', label: 'Due tomorrow', order: 2 }
        return { key: 'later', label: 'Later', order: 3 }
      }
      default:
        return { key: 'all', label: 'All', order: 0 }
    }
  }

  const map = new Map<string, Section & { order: number }>()
  for (const t of list) {
    const { key, label, order } = keyLabel(t)
    const existing = map.get(key)
    if (existing) existing.tasks.push(t)
    else map.set(key, { key, label, order, tasks: [t] })
  }
  return [...map.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}
