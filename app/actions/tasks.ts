'use server'

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  boulders,
  tasks,
  type Recurrence,
  type TaskCategory,
  type TaskGroup,
  type TaskPriority,
  type TaskSize,
  type TaskStatus,
  type TaskType,
} from '@/lib/db/schema'
import { getUserId } from '@/lib/session'
import { CATEGORIES_BY_GROUP, defaultDueAt } from '@/lib/tasks'
import { habitOnComplete, habitOnUncomplete, isHabit, isRecurring, periodKeyFor } from '@/lib/tasks'
import { enqueueResearch } from '@/lib/agents/enqueue'

const taskInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(['not_started', 'doing', 'done', 'skipped']).optional(),
  priority: z.enum(['urgent', 'necessary', 'important', 'normal']).optional(),
  type: z.enum(['errand', 'task', 'focus', 'deep']).optional(),
  group: z.enum(['personal', 'work']).optional(),
  category: z
    .enum(['relationships', 'admin', 'finance', 'self', 'followups', 'project', 'oncall'])
    .optional(),
  size: z.enum(['boulder', 'stone', 'pebble']).optional(),
  today: z.boolean().optional(),
  thisWeek: z.boolean().optional(),
  topItem: z.boolean().optional(),
  urgency: z.enum(['top', 'today', 'week', 'backlog']).optional(),
  recurrence: z.enum(['none', 'daily', 'weekly', 'days', 'weeks']).optional(),
  recurrenceCount: z.number().int().positive().max(365).nullable().optional(),
  boulderId: z.number().int().positive().nullable().optional(),
  mountainId: z.number().int().positive().nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
  isResearch: z.boolean().optional(),
})

export type TaskInput = z.infer<typeof taskInput>

function revalidateTaskViews() {
  revalidatePath('/')
  revalidatePath('/tasks')
  revalidatePath('/structure')
}

export async function listTasks(opts?: { includeArchived?: boolean }) {
  const userId = await getUserId()
  return db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.userId, userId), opts?.includeArchived ? undefined : isNull(tasks.archivedAt)),
    )
    .orderBy(
      sql`case ${tasks.status} when 'doing' then 0 when 'not_started' then 1 when 'done' then 2 else 3 end`,
      sql`case ${tasks.topItem} when true then 0 else 1 end`,
      sql`case ${tasks.priority} when 'urgent' then 0 when 'necessary' then 1 when 'important' then 2 else 3 end`,
      sql`case ${tasks.group} when 'personal' then 0 else 1 end`,
      asc(tasks.dueAt),
      desc(tasks.createdAt),
    )
}

export async function createTask(raw: TaskInput) {
  const userId = await getUserId()
  const data = taskInput.parse(raw)
  const group = data.group ?? 'work'
  const recurrence = data.recurrence ?? 'none'
  const bounded = recurrence === 'days' || recurrence === 'weeks'
  const [row] = await db
    .insert(tasks)
    .values({
      userId,
      title: data.title,
      description: data.description ?? null,
      status: data.status ?? 'not_started',
      priority: data.priority ?? 'normal',
      type: data.type ?? 'task',
      group,
      category: data.category ?? (group === 'personal' ? 'self' : 'project'),
      size: data.size ?? 'stone',
      today: data.today ?? false,
      thisWeek: data.thisWeek ?? false,
      topItem: data.topItem ?? data.urgency === 'top',
      urgency: data.urgency ?? (data.topItem ? 'top' : data.today ? 'today' : data.thisWeek ? 'week' : 'backlog'),
      recurrence,
      recurrenceCount: bounded ? (data.recurrenceCount ?? 7) : null,
      recurrenceRemaining: bounded ? (data.recurrenceCount ?? 7) : null,
      // Anchor recurring tasks to the current period so the first rollover is clean.
      lastPeriodKey: isRecurring(recurrence) ? periodKeyFor(recurrence) : null,
      boulderId: data.boulderId ?? null,
      mountainId: data.mountainId ?? null,
      // No explicit due date → default to today so the task is visible right away.
      dueAt: data.dueAt ? new Date(data.dueAt) : defaultDueAt(),
      tags: data.tags ?? [],
      isResearch: data.isResearch ?? false,
    })
    .returning()

  if (row.isResearch) {
    await enqueueResearch({ userId, taskId: row.id, topic: row.title, trigger: 'manual' })
  }
  revalidateTaskViews()
  return row
}

export async function updateTask(id: number, raw: Partial<TaskInput>) {
  const userId = await getUserId()
  const data = taskInput.partial().parse(raw)
  // If recurrence changes, re-anchor the bounded counters / period key.
  const recurrencePatch: Record<string, unknown> = {}
  if (data.recurrence !== undefined) {
    const r = data.recurrence as Recurrence
    recurrencePatch.recurrence = r
    const bounded = r === 'days' || r === 'weeks'
    recurrencePatch.recurrenceCount = bounded ? (data.recurrenceCount ?? 7) : null
    recurrencePatch.recurrenceRemaining = bounded ? (data.recurrenceCount ?? 7) : null
    recurrencePatch.lastPeriodKey = isRecurring(r) ? periodKeyFor(r) : null
  } else if (data.recurrenceCount !== undefined) {
    recurrencePatch.recurrenceCount = data.recurrenceCount
    recurrencePatch.recurrenceRemaining = data.recurrenceCount
  }
  const urgency = data.urgency ?? (data.topItem === true ? 'top' : data.today === true ? 'today' : data.thisWeek === true ? 'week' : undefined)
  const urgencyPatch = urgency ? {
    urgency,
    topItem: urgency === 'top',
    today: urgency === 'today',
    thisWeek: urgency === 'week',
  } : {}

  const [row] = await db
    .update(tasks)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status as TaskStatus }),
      ...(data.priority !== undefined && { priority: data.priority as TaskPriority }),
      ...(data.type !== undefined && { type: data.type as TaskType }),
      ...(data.group !== undefined && { group: data.group as TaskGroup }),
      ...(data.category !== undefined && { category: data.category as TaskCategory }),
      ...(data.size !== undefined && { size: data.size as TaskSize }),
      ...urgencyPatch,
      ...recurrencePatch,
      ...(data.boulderId !== undefined && { boulderId: data.boulderId }),
      ...(data.mountainId !== undefined && { mountainId: data.mountainId }),
      ...(data.dueAt !== undefined && { dueAt: data.dueAt ? new Date(data.dueAt) : null }),
      ...(data.tags !== undefined && { tags: data.tags }),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning()
  revalidateTaskViews()
  return row
}

/**
 * Status changes carry habit bookkeeping: completing a habit advances its shield
 * and records the period; un-completing it in the same period reverses that.
 */
export async function setTaskStatus(id: number, status: TaskStatus) {
  const userId = await getUserId()
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
  if (!task) throw new Error('Task not found')

  const patch: Record<string, unknown> = { status, updatedAt: new Date() }

  if (isHabit(task.recurrence)) {
    const period = periodKeyFor(task.recurrence)
    const wasDoneThisPeriod = task.status === 'done' && task.lastCompletedPeriodKey === period
    if (status === 'done' && !wasDoneThisPeriod) {
      Object.assign(patch, habitOnComplete(task), { lastCompletedPeriodKey: period })
    } else if (status !== 'done' && wasDoneThisPeriod) {
      Object.assign(patch, habitOnUncomplete(task), { lastCompletedPeriodKey: null })
    }
  }

  const [row] = await db
    .update(tasks)
    .set(patch)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning()
  revalidateTaskViews()
  return row
}

export async function toggleToday(id: number, today: boolean) {
  return updateTask(id, { today })
}

export async function archiveTask(id: number) {
  const userId = await getUserId()
  await db
    .update(tasks)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
  revalidateTaskViews()
}

export async function deleteTask(id: number) {
  const userId = await getUserId()
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
  revalidateTaskViews()
}

export async function researchTask(id: number) {
  const userId = await getUserId()
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
  if (!task) throw new Error('Task not found')
  await db
    .update(tasks)
    .set({ isResearch: true, updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
  const run = await enqueueResearch({
    userId,
    taskId: task.id,
    topic: task.description ? `${task.title}\n\n${task.description}` : task.title,
    trigger: 'manual',
  })
  revalidateTaskViews()
  revalidatePath('/agents')
  return run
}

// ---------- AI "Guess" for quick-add defaults ----------

export type GuessField = 'group' | 'category' | 'priority' | 'type' | 'project'

export type GuessResult = {
  group?: TaskGroup
  category?: TaskCategory
  priority?: TaskPriority
  type?: TaskType
  /** Encoded project ('b-<id>') or '' for none. */
  project?: string
}

const ALL_CATEGORIES = [
  'relationships',
  'admin',
  'finance',
  'self',
  'followups',
  'project',
  'oncall',
] as const

/**
 * Infer sensible task attributes from a title using the user's own recent tasks
 * (and projects) as few-shot context. Runs on a tiny, cheap model; any failure
 * degrades to returning nothing so the caller falls back to its defaults.
 */
export async function guessTaskAttributes(input: {
  title: string
  fields: GuessField[]
}): Promise<GuessResult> {
  const userId = await getUserId()
  const title = input.title.trim().slice(0, 200)
  const fields = [...new Set(input.fields)]
  if (!title || fields.length === 0) return {}

  const recent = await db
    .select({
      title: tasks.title,
      group: tasks.group,
      category: tasks.category,
      priority: tasks.priority,
      type: tasks.type,
      boulderId: tasks.boulderId,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.archivedAt)))
    .orderBy(desc(tasks.createdAt))
    .limit(50)

  const wantsProject = fields.includes('project')
  const projectRows = wantsProject
    ? await db
        .select({ id: boulders.id, title: boulders.title })
        .from(boulders)
        .where(and(eq(boulders.userId, userId), isNull(boulders.archivedAt)))
    : []

  const examples = recent
    .map((t) => {
      const proj = t.boulderId ? ` project=${t.boulderId}` : ''
      return `- "${t.title}" → group=${t.group} category=${t.category} priority=${t.priority} type=${t.type}${proj}`
    })
    .join('\n')

  const projectList = projectRows.map((p) => `- id=${p.id} "${p.title}"`).join('\n')

  const schema = z.object({
    group: z.enum(['personal', 'work']).nullable(),
    category: z.enum(ALL_CATEGORIES).nullable(),
    priority: z.enum(['urgent', 'necessary', 'important', 'normal']).nullable(),
    type: z.enum(['errand', 'task', 'focus', 'deep']).nullable(),
    projectId: z.number().int().nullable(),
  })

  try {
    const { experimental_output: out } = await generateText({
      model: 'openai/gpt-4.1-nano',
      experimental_output: Output.object({ schema }),
      system:
        'You classify a personal to-do item. Infer attributes from the title, ' +
        "matching the patterns in the user's recent tasks. " +
        'group: personal vs work. ' +
        'priority: urgent (drop-everything), necessary (today), important (this week), normal. ' +
        'type is a time-box: errand (<10min), task (~30min), focus (~1hr), deep (~3hr). ' +
        'category must fit the chosen group. ' +
        'For projectId, pick a listed project id only if the title clearly belongs to it, else null. ' +
        'Return null for anything you are unsure about.',
      prompt:
        `New task: "${title}"\n\n` +
        `Fields to infer: ${fields.join(', ')}\n\n` +
        `Recent tasks:\n${examples || '(none)'}\n\n` +
        (wantsProject ? `Projects:\n${projectList || '(none)'}\n` : ''),
    })

    const result: GuessResult = {}
    if (fields.includes('group') && out.group) result.group = out.group
    if (fields.includes('priority') && out.priority) result.priority = out.priority
    if (fields.includes('type') && out.type) result.type = out.type
    if (fields.includes('category') && out.category) {
      // Keep the category consistent with the (guessed or existing) group.
      const g = result.group
      if (!g || CATEGORIES_BY_GROUP[g].includes(out.category)) result.category = out.category
    }
    if (wantsProject) {
      result.project =
        out.projectId && projectRows.some((p) => p.id === out.projectId)
          ? `b-${out.projectId}`
          : ''
    }
    return result
  } catch (err) {
    console.error('[v0] guessTaskAttributes failed', err)
    return {}
  }
}

// ---------- AI natural-language due dates ("… for next friday") ----------

/**
 * Resolve a natural-language phrase (the part after "for" in a title) into an
 * absolute calendar date. Returns { date: null } when the phrase isn't really a
 * time expression, so the caller can leave the title/due date untouched.
 */
export async function resolveDueDate(input: {
  phrase: string
  title?: string
}): Promise<{ date: string | null }> {
  await getUserId()
  const phrase = input.phrase.trim().slice(0, 120)
  if (!phrase) return { date: null }

  const now = new Date()
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
  }).format(now)

  const schema = z.object({
    isDate: z.boolean(),
    date: z.string().nullable(),
  })

  try {
    const { experimental_output: out } = await generateText({
      model: 'openai/gpt-4.1-nano',
      experimental_output: Output.object({ schema }),
      system:
        'You decide whether a short phrase describes WHEN a task is due. ' +
        'If it is a temporal expression (e.g. "tomorrow", "next friday", "in 3 days", ' +
        '"end of the month", "june 5", "this weekend"), set isDate=true and date to the ' +
        'resolved absolute calendar date in YYYY-MM-DD form. ' +
        'If the phrase is NOT about timing (e.g. "the party", "my mom", "the client"), ' +
        'set isDate=false and date=null. Never invent a date for a non-temporal phrase.',
      prompt: `Today is ${todayStr} (${weekday}), timezone America/New_York.\nPhrase: "${phrase}"`,
    })
    if (!out.isDate || !out.date || !/^\d{4}-\d{2}-\d{2}$/.test(out.date)) return { date: null }
    return { date: out.date }
  } catch (err) {
    console.error('[v0] resolveDueDate failed', err)
    return { date: null }
  }
}
