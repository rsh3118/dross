'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { Archive, FlaskConical, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type {
  Recurrence,
  Task,
  TaskCategory,
  TaskGroup,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@/lib/db/schema'
import { archiveTask, deleteTask, researchTask, updateTask } from '@/app/actions/tasks'
import {
  CATEGORIES_BY_GROUP,
  CATEGORY_LABELS,
  PRIORITIES,
  RECURRENCES,
  STATUSES,
  TASK_GROUPS,
  TYPES,
} from '@/lib/tasks'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { urgencyBg } from '@/components/tasks/task-visuals'

type BoulderOption = { id: number; title: string }

// One shared trigger size so every dropdown in the sheet is identical and roomy
// enough for its longest option label.
const triggerCls = 'h-10 w-full'

export function TaskSheet({
  task,
  boulders = [],
  onClose,
}: {
  task: Task | null
  boulders?: BoulderOption[]
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>('not_started')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [type, setType] = useState<TaskType>('task')
  const [group, setGroup] = useState<TaskGroup>('work')
  const [category, setCategory] = useState<TaskCategory>('project')
  const [recurrence, setRecurrence] = useState<Recurrence>('none')
  const [recurrenceCount, setRecurrenceCount] = useState('7')
  const [boulderId, setBoulderId] = useState<string>('none')
  const [today, setToday] = useState(false)
  const [thisWeek, setThisWeek] = useState(false)
  const [topItem, setTopItem] = useState(false)
  const [due, setDue] = useState('')
  const [tags, setTags] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Value-based dirty tracking: cleanRef holds the serialized snapshot that is
  // known to match the server, so opening a task never triggers a spurious save.
  const cleanRef = useRef<string>('')

  const fields = {
    title,
    description,
    status,
    priority,
    type,
    group,
    category,
    recurrence,
    recurrenceCount,
    boulderId,
    today,
    thisWeek,
    due,
    tags,
  }
  const snapshot = JSON.stringify(fields)

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDescription(task.description ?? '')
    setStatus(task.status)
    setPriority(task.priority)
    setType(task.type)
    setGroup(task.group)
    setCategory(task.category)
    setRecurrence(task.recurrence)
    setRecurrenceCount(String(task.recurrenceCount ?? 7))
    setBoulderId(task.boulderId ? String(task.boulderId) : 'none')
    setToday(task.today)
    setThisWeek(task.thisWeek)
    setTopItem(task.topItem)
    setDue(task.dueAt ? format(task.dueAt, "yyyy-MM-dd'T'HH:mm") : '')
    setTags(task.tags.join(', '))
    cleanRef.current = JSON.stringify({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      type: task.type,
      group: task.group,
      category: task.category,
      recurrence: task.recurrence,
      recurrenceCount: String(task.recurrenceCount ?? 7),
      boulderId: task.boulderId ? String(task.boulderId) : 'none',
      today: task.today,
      thisWeek: task.thisWeek,
      topItem: task.topItem,
      due: task.dueAt ? format(task.dueAt, "yyyy-MM-dd'T'HH:mm") : '',
      tags: task.tags.join(', '),
    })
    setSaveState('idle')
  }, [task])

  const persist = useCallback(
    (snap: string) => {
      if (!task) return
      startTransition(async () => {
        setSaveState('saving')
        await updateTask(task.id, {
          title,
          description: description || null,
          status,
          priority,
          type,
          group,
          category,
          recurrence,
          recurrenceCount:
            recurrence === 'days' || recurrence === 'weeks' ? Number(recurrenceCount) || 7 : null,
          boulderId: boulderId === 'none' ? null : Number(boulderId),
          today,
          thisWeek,
          topItem,
          dueAt: due ? new Date(due).toISOString() : null,
          tags: tags
            .split(',')
            .map((t) => t.trim().replace(/^#/, '').toLowerCase())
            .filter(Boolean),
        })
        cleanRef.current = snap
        setSaveState('saved')
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [task, title, description, status, priority, type, group, category, recurrence, recurrenceCount, boulderId, today, thisWeek, topItem, due, tags],
  )

  // Debounced autosave: persist ~700ms after the last edit, but never when the
  // form still matches the server or the title is blank.
  useEffect(() => {
    if (!task) return
    if (snapshot === cleanRef.current) return
    if (!title.trim()) return
    const h = setTimeout(() => persist(snapshot), 700)
    return () => clearTimeout(h)
  }, [task, snapshot, title, persist])

  const handleClose = () => {
    // Flush any pending edit immediately so nothing is lost on close.
    if (task && snapshot !== cleanRef.current && title.trim()) persist(snapshot)
    onClose()
  }

  if (!task) return null

  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        style={{ backgroundColor: urgencyBg(priority) }}
        className={cn(
          'flex flex-col gap-0 p-0',
          isMobile ? 'h-[92svh] rounded-t-2xl' : 'sm:max-w-lg',
        )}
      >
        {isMobile && (
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden />
        )}
        <SheetHeader className="gap-2 border-b px-5 py-4">
          <SheetTitle className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            task #{task.id}
          </SheetTitle>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Task title"
            placeholder="Task title"
            className="h-10 border-transparent bg-background/60 px-2 text-base font-medium shadow-none hover:border-input focus-visible:border-input"
          />
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 scrollbar-thin">
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-desc">Notes</Label>
            <Textarea
              id="t-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context, links, next steps…"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
                <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label} · {t.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Group</Label>
              <Select
                value={group}
                onValueChange={(v) => {
                  const g = v as TaskGroup
                  setGroup(g)
                  if (!CATEGORIES_BY_GROUP[g].includes(category)) setCategory(CATEGORIES_BY_GROUP[g][0])
                }}
              >
                <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_GROUPS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
                <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES_BY_GROUP[group].map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Recurrence</Label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
                <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(recurrence === 'days' || recurrence === 'weeks') && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="t-rcount">
                  {recurrence === 'days' ? 'Number of days' : 'Number of weeks'}
                </Label>
                <Input
                  id="t-rcount"
                  type="number"
                  min={1}
                  max={365}
                  value={recurrenceCount}
                  onChange={(e) => setRecurrenceCount(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label>Project</Label>
              <Select value={boulderId} onValueChange={(v) => setBoulderId(v ?? 'none')}>
                <SelectTrigger className={triggerCls}><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {boulders.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="t-today" className="cursor-pointer">On today</Label>
            </div>
            <Switch id="t-today" checked={today} onCheckedChange={setToday} />
          </div>
  <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5">
  <Label htmlFor="t-top" className="cursor-pointer">Top item</Label>
  <Switch id="t-top" checked={topItem} onCheckedChange={setTopItem} />
  </div>
  <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5 -mt-2">
  <Label htmlFor="t-week" className="cursor-pointer">This week</Label>
            <Switch id="t-week" checked={thisWeek} onCheckedChange={setThisWeek} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="t-due">Due</Label>
            <Input id="t-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-tags">Tags</Label>
            <Input
              id="t-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="admin, health, reading"
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <FlaskConical className="size-4 text-primary" />
              <span className="text-sm font-medium">Research agent</span>
            </div>
            {task.researchPageId ? (
              <p className="text-sm text-muted-foreground">
                Research written.{' '}
                <Link href={`/wiki?page=${task.researchPageId}`} className="text-primary underline underline-offset-4">
                  Open the wiki page
                </Link>
              </p>
            ) : task.researchRunId ? (
              <p className="text-sm text-muted-foreground">
                Queued. Watch progress on{' '}
                <Link href="/agents" className="text-primary underline underline-offset-4">Agents</Link>.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Collate sources into a wiki page.</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await researchTask(task.id)
                      toast('Research agent queued')
                    })
                  }
                >
                  Research this
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Archive task"
            disabled={pending}
            onClick={() => startTransition(async () => { await archiveTask(task.id); onClose() })}
          >
            <Archive className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete task"
            disabled={pending}
            onClick={() => startTransition(async () => { await deleteTask(task.id); onClose() })}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
          <span className="ml-auto font-mono text-xs text-muted-foreground" aria-live="polite">
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Autosaves'}
          </span>
        </div>
      </SheetContent>
    </Sheet>
  )
}
