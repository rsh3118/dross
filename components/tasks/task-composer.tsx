'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, Circle, Mountain, Plus, Sparkles, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import type {
  Recurrence,
  TaskCategory,
  TaskGroup,
  TaskPriority,
  TaskType,
} from '@/lib/db/schema'
import {
  createTask,
  guessTaskAttributes,
  resolveDueDate,
  updateTask,
  type GuessField,
  type TaskInput,
} from '@/app/actions/tasks'
import {
  CATEGORIES_BY_GROUP,
  CATEGORY_DOT,
  CATEGORY_LABELS,
  GROUP_DOT,
  PRIORITIES,
  RECURRENCES,
  TASK_GROUPS,
  TYPE_DOT,
  TYPES,
  parseQuickAdd,
} from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ColorDot } from '@/components/tasks/task-visuals'

export type ProjectOptions = {
  mountains: { id: number; title: string }[]
  boulders: { id: number; title: string }[]
}

export type ComposerDefaults = {
  group?: TaskGroup
  today?: boolean
  urgency?: 'top' | 'today' | 'week' | 'backlog'
  recurrence?: Recurrence
  project?: string // 'm-<id>' | 'b-<id>' | ''
}

const GUESS = 'guess' as const

function projectToIds(project: string) {
  if (project.startsWith('b-')) return { boulderId: Number(project.slice(2)), mountainId: null }
  if (project.startsWith('m-')) return { boulderId: null, mountainId: Number(project.slice(2)) }
  return { boulderId: null, mountainId: null }
}

const GuessLabel = () => (
  <span className="flex items-center gap-2 text-muted-foreground">
    <Sparkles className="size-3.5" /> Guess
  </span>
)

export function TaskComposer({
  projects,
  defaults,
}: {
  projects: ProjectOptions
  defaults: ComposerDefaults
}) {
  const [expanded, setExpanded] = useState(false)
  const [pending, startTransition] = useTransition()

  // quick-add value (collapsed bar)
  const [quick, setQuick] = useState('')

  // Default attribute values applied to every quick-add task. Any of these may be
  // 'guess', meaning "let AI infer it from the title + my recent tasks".
  const initialGroup = defaults.group ?? 'work'
  const [group, setGroup] = useState<TaskGroup | typeof GUESS>(initialGroup)
  const [category, setCategory] = useState<TaskCategory | typeof GUESS>(
    CATEGORIES_BY_GROUP[initialGroup][0],
  )
  const [priority, setPriority] = useState<TaskPriority | typeof GUESS>('normal')
  const [type, setType] = useState<TaskType | typeof GUESS>('task')
  const [recurrence, setRecurrence] = useState<Recurrence>(defaults.recurrence ?? 'none')
  const [recurrenceCount, setRecurrenceCount] = useState('7')
  const [project, setProject] = useState(defaults.project ?? '')
  const [urgency, setUrgency] = useState<'top' | 'today' | 'week' | 'backlog'>(defaults.urgency ?? 'top')

  const hasProjects = projects.mountains.length > 0 || projects.boulders.length > 0

  const submitQuick = () => {
    const parsed = parseQuickAdd(quick)
    if (!parsed.title) return

    // Which attributes are marked "Guess" (and not already pinned by a token)?
    const need: GuessField[] = []
    if (group === GUESS) need.push('group')
    if (category === GUESS) need.push('category')
    if (priority === GUESS && !parsed.priority) need.push('priority')
    if (type === GUESS && !parsed.type) need.push('type')
    if (project === GUESS) need.push('project')

    // A trailing "… for <phrase>" is treated as a natural-language due date; it
    // is only stripped from the title once AI confirms it really is a date.
    let duePhrase: string | null = null
    let strippedTitle = parsed.title
    if (!parsed.dueAt) {
      const m = parsed.title.match(/^(.*)\bfor\b\s+(.+)$/i)
      if (m && m[1].trim()) {
        strippedTitle = m[1].trim()
        duePhrase = m[2].trim()
      }
    }
    const usesAI = need.length > 0 || !!duePhrase

    // Create-time values: "Guess" fields fall back to sane defaults so the task
    // shows up immediately in the current view; AI refines them right after.
    const createGroup: TaskGroup = group === GUESS ? 'work' : group
    const createCategory: TaskCategory =
      category === GUESS
        ? CATEGORIES_BY_GROUP[createGroup][0]
        : CATEGORIES_BY_GROUP[createGroup].includes(category)
          ? category
          : CATEGORIES_BY_GROUP[createGroup][0]
    const createPriority: TaskPriority =
      parsed.priority ?? (priority === GUESS ? 'normal' : priority)
    const createType: TaskType = parsed.type ?? (type === GUESS ? 'task' : type)
    const ids = projectToIds(project === GUESS ? '' : project)

    startTransition(async () => {
      try {
        const created = await createTask({
          title: parsed.title,
          tags: parsed.tags,
          group: createGroup,
          category: createCategory,
          priority: createPriority,
          type: createType,
          recurrence,
          recurrenceCount:
            recurrence === 'days' || recurrence === 'weeks' ? Number(recurrenceCount) || 7 : null,
          boulderId: ids.boulderId,
          mountainId: ids.mountainId,
          dueAt: parsed.dueAt ?? null,
          urgency: parsed.today ? 'today' : parsed.thisWeek ? 'week' : urgency,
          isResearch: parsed.research,
        })
        setQuick('')
        if (parsed.research) toast('Research agent queued', { description: parsed.title })
        if (!usesAI) return

        // Refine the just-created task with AI, then patch only what changed.
        const patch: Partial<TaskInput> = {}
        const changed: string[] = []

        if (need.length > 0) {
          const g = await guessTaskAttributes({ title: strippedTitle, fields: need })
          let resolvedGroup = createGroup
          if (need.includes('group') && g.group && g.group !== createGroup) {
            patch.group = g.group
            resolvedGroup = g.group
            changed.push('group')
          }
          if (need.includes('category')) {
            const cat =
              g.category && CATEGORIES_BY_GROUP[resolvedGroup].includes(g.category)
                ? g.category
                : CATEGORIES_BY_GROUP[resolvedGroup][0]
            if (cat !== createCategory || patch.group) {
              patch.category = cat
              changed.push('category')
            }
          } else if (patch.group && !CATEGORIES_BY_GROUP[resolvedGroup].includes(createCategory)) {
            patch.category = CATEGORIES_BY_GROUP[resolvedGroup][0]
          }
          if (need.includes('priority') && g.priority && g.priority !== createPriority) {
            patch.priority = g.priority
            changed.push('priority')
          }
          if (need.includes('type') && g.type && g.type !== createType) {
            patch.type = g.type
            changed.push('type')
          }
          if (need.includes('project') && g.project) {
            const pid = projectToIds(g.project)
            patch.boulderId = pid.boulderId
            patch.mountainId = pid.mountainId
            changed.push('project')
          }
        }

        if (duePhrase) {
          const { date } = await resolveDueDate({ phrase: duePhrase, title: strippedTitle })
          if (date) {
            patch.dueAt = new Date(`${date}T17:00`).toISOString()
            patch.title = strippedTitle
            changed.push('due date')
          }
        }

        if (Object.keys(patch).length > 0) {
          await updateTask(created.id, patch)
          if (changed.length > 0) {
            toast('Filled in with AI', { description: `Set ${changed.join(', ')}` })
          }
        }
      } catch (e) {
        toast.error('Could not add task')
        console.error(e)
      }
    })
  }

  const changeGroup = (v: string) => {
    if (v === GUESS) {
      setGroup(GUESS)
      setCategory(GUESS) // category depends on group, so guess it too
      return
    }
    const g = v as TaskGroup
    setGroup(g)
    if (category !== GUESS && !CATEGORIES_BY_GROUP[g].includes(category)) {
      setCategory(CATEGORIES_BY_GROUP[g][0])
    }
  }

  const fieldCls = 'h-9 w-full bg-background'
  const catDisabled = group === GUESS
  const catOptions = group === GUESS ? [] : CATEGORIES_BY_GROUP[group]

  return (
    <div className="rounded-lg border bg-card">
      {/* Collapsed quick-add bar */}
      <div className="flex items-center gap-2 p-2">
        <div className="relative flex-1">
          <Plus className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter') submitQuick()
            }}
            disabled={pending}
            placeholder="Add a task…  Renew passport #admin !necessary ~errand @fri *today"
            className="h-10 border-transparent bg-transparent pl-9 shadow-none focus-visible:border-input"
            aria-label="Quick add task"
          />
        </div>
        <Button
          type="button"
          variant={expanded ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label="Toggle quick-add defaults"
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">Defaults</span>
          <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
        </Button>
      </div>

      {/* Expanded defaults panel — two rows of dropdowns + toggles. */}
      {expanded && (
        <div className="flex flex-col gap-3 border-t p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="Group">
              <Select value={group} onValueChange={(v) => v && changeGroup(v)}>
                <SelectTrigger className={fieldCls}>
                  <SelectValue>
                    {group === GUESS ? (
                      <GuessLabel />
                    ) : (
                      <span className="flex items-center gap-2">
                        <ColorDot color={GROUP_DOT[group]} />
                        {group === 'personal' ? 'Personal' : 'Work'}
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GUESS}><GuessLabel /></SelectItem>
                  {TASK_GROUPS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      <span className="flex items-center gap-2">
                        <ColorDot color={GROUP_DOT[g.value]} />
                        {g.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Category">
              <Select
                value={category}
                onValueChange={(v) => v && setCategory(v as TaskCategory | typeof GUESS)}
                disabled={catDisabled}
              >
                <SelectTrigger className={fieldCls}>
                  <SelectValue>
                    {category === GUESS ? (
                      <GuessLabel />
                    ) : (
                      <span className="flex items-center gap-2">
                        <ColorDot color={CATEGORY_DOT[category]} />
                        {CATEGORY_LABELS[category]}
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GUESS}><GuessLabel /></SelectItem>
                  {catOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      <span className="flex items-center gap-2">
                        <ColorDot color={CATEGORY_DOT[c]} />
                        {CATEGORY_LABELS[c]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Priority">
              <Select value={priority} onValueChange={(v) => v && setPriority(v as TaskPriority | typeof GUESS)}>
                <SelectTrigger className={cn(fieldCls, priority !== GUESS && PRIORITIES.find((p) => p.value === priority)?.className)}>
                  <SelectValue>
                    {priority === GUESS ? (
                      <GuessLabel />
                    ) : (
                      PRIORITIES.find((p) => p.value === priority)?.label
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GUESS}><GuessLabel /></SelectItem>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Type">
              <Select value={type} onValueChange={(v) => v && setType(v as TaskType | typeof GUESS)}>
                <SelectTrigger className={fieldCls}>
                  <SelectValue>
                    {type === GUESS ? (
                      <GuessLabel />
                    ) : (
                      <span className="flex items-center gap-2">
                        <ColorDot color={TYPE_DOT[type]} />
                        {TYPES.find((t) => t.value === type)?.label}
                        <span className="text-muted-foreground">
                          · {TYPES.find((t) => t.value === type)?.hint}
                        </span>
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GUESS}><GuessLabel /></SelectItem>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <ColorDot color={TYPE_DOT[t.value]} />
                        {t.label}
                        <span className="text-muted-foreground">· {t.hint}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Recurrence">
              <Select value={recurrence} onValueChange={(v) => v && setRecurrence(v as Recurrence)}>
                <SelectTrigger className={fieldCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(recurrence === 'days' || recurrence === 'weeks') && (
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={recurrenceCount}
                  onChange={(e) => setRecurrenceCount(e.target.value)}
                  aria-label={recurrence === 'days' ? 'For how many days' : 'For how many weeks'}
                  className="mt-1.5 h-8 bg-background"
                />
              )}
            </Field>

            {hasProjects && (
              <Field label="Project">
                <Select value={project || 'none'} onValueChange={(v) => setProject(!v || v === 'none' ? '' : v)}>
                  <SelectTrigger className={fieldCls}>
                    <SelectValue>
                      {project === GUESS ? (
                        <GuessLabel />
                      ) : (
                        projectLabel(project, projects)
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GUESS}><GuessLabel /></SelectItem>
                    <SelectItem value="none">No project</SelectItem>
                    {projects.mountains.map((m) => (
                      <SelectItem key={`m-${m.id}`} value={`m-${m.id}`}>
                        <Mountain className="size-3.5 text-muted-foreground" /> {m.title}
                      </SelectItem>
                    ))}
                    {projects.boulders.map((b) => (
                      <SelectItem key={`b-${b.id}`} value={`b-${b.id}`}>
                        <Circle className="size-3.5 text-muted-foreground" /> {b.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

  <div className="flex flex-wrap items-center gap-2">
  <span className="text-sm text-muted-foreground">Urgency</span>
  {(['top', 'today', 'week', 'backlog'] as const).map((option) => (
    <Button key={option} type="button" size="sm" variant={urgency === option ? 'secondary' : 'outline'} onClick={() => setUrgency(option)} className="capitalize">
      {option === 'week' ? 'This week' : option}
    </Button>
  ))}
            <p className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5" />
              Applied to tasks you add above. Pick “Guess” to let AI decide.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function projectLabel(value: string, projects: ProjectOptions) {
  if (!value || value === 'none') return <span className="text-muted-foreground">No project</span>
  if (value.startsWith('m-')) {
    const m = projects.mountains.find((x) => `m-${x.id}` === value)
    return (
      <span className="flex items-center gap-2">
        <Mountain className="size-3.5 text-muted-foreground" /> {m?.title ?? 'Project'}
      </span>
    )
  }
  const b = projects.boulders.find((x) => `b-${x.id}` === value)
  return (
    <span className="flex items-center gap-2">
      <Circle className="size-3.5 text-muted-foreground" /> {b?.title ?? 'Project'}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
