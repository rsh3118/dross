import { differenceInCalendarDays, format, isPast, isToday, isTomorrow } from 'date-fns'
import type {
  MountainArea,
  Recurrence,
  StructureStatus,
  Task,
  TaskCategory,
  TaskGroup,
  TaskPriority,
  TaskSize,
  TaskStatus,
  TaskType,
} from '@/lib/db/schema'

export const PRIORITIES: { value: TaskPriority; label: string; short: string; className: string }[] = [
  { value: 'urgent', label: 'Urgent · now', short: 'urgent', className: 'text-destructive' },
  { value: 'necessary', label: 'Necessary · today', short: 'necessary', className: 'text-warning' },
  { value: 'important', label: 'Important · this week', short: 'important', className: 'text-primary' },
  { value: 'normal', label: 'Normal', short: 'normal', className: 'text-muted-foreground' },
]

export const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
  { value: 'skipped', label: 'Skipped' },
]

// Time-box estimates, mirroring the Notion "Type" property.
export const TYPES: { value: TaskType; label: string; hint: string }[] = [
  { value: 'errand', label: 'Errand', hint: '< 10 min' },
  { value: 'task', label: 'Task', hint: '~30 min' },
  { value: 'focus', label: 'Focus work', hint: '~1 hr' },
  { value: 'deep', label: 'Deep work', hint: '~3 hr' },
]

// Two lives, each with its own category set.
export const TASK_GROUPS: { value: TaskGroup; label: string }[] = [
  { value: 'personal', label: 'Personal' },
  { value: 'work', label: 'Work' },
]

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  relationships: 'Relationships',
  admin: 'Admin',
  finance: 'Finance',
  self: 'Self',
  followups: 'Follow-ups',
  project: 'Project',
  oncall: 'On-call',
}

export const CATEGORIES_BY_GROUP: Record<TaskGroup, TaskCategory[]> = {
  personal: ['relationships', 'admin', 'finance', 'self'],
  work: ['followups', 'project', 'admin', 'oncall', 'relationships'],
}

// Deliberate categorical tints (applied as inline styles, like the shield tiers)
// so each type / group / category reads at a glance. Not palette tokens on purpose.
export const TYPE_DOT: Record<TaskType, string> = {
  errand: '#7fa66a',
  task: '#8aa0b6',
  focus: '#e3b23c',
  deep: '#c0563a',
}
export const GROUP_DOT: Record<TaskGroup, string> = {
  personal: '#7fa66a',
  work: '#6f8bc7',
}
export const CATEGORY_DOT: Record<TaskCategory, string> = {
  relationships: '#d0876f',
  admin: '#8aa0b6',
  finance: '#7fa66a',
  self: '#b58fc7',
  followups: '#e3b23c',
  project: '#6f8bc7',
  oncall: '#c0563a',
}

// Full recurrence menu: unbounded habits + bounded repeats.
export const RECURRENCES: { value: Recurrence; label: string; needsCount?: boolean }[] = [
  { value: 'none', label: 'One-time' },
  { value: 'daily', label: 'Daily habit' },
  { value: 'weekly', label: 'Weekly habit' },
  { value: 'days', label: 'For the next X days', needsCount: true },
  { value: 'weeks', label: 'For the next X weeks', needsCount: true },
]

export function isHabit(r: Recurrence) {
  return r === 'daily' || r === 'weekly'
}
export function isRecurring(r: Recurrence) {
  return r !== 'none'
}
export function recurrenceLabel(r: Recurrence) {
  return RECURRENCES.find((x) => x.value === r)?.label ?? 'One-time'
}

// Effort tier, mirroring the Notion "Size" property.
export const SIZES: { value: TaskSize; label: string }[] = [
  { value: 'boulder', label: 'Boulder' },
  { value: 'stone', label: 'Stone' },
  { value: 'pebble', label: 'Pebble' },
]

export const STRUCTURE_STATUSES: { value: StructureStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'done', label: 'Done' },
  { value: 'someday', label: 'Someday' },
]

export const MOUNTAIN_AREAS: { value: MountainArea; label: string }[] = [
  { value: 'body', label: 'Body' },
  { value: 'career', label: 'Career' },
  { value: 'relationships', label: 'Relationships' },
  { value: 'mind', label: 'Mind' },
  { value: 'finance', label: 'Finance' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'other', label: 'Other' },
]

/** A task is "closed" if it's done or deliberately skipped. */
export function isClosed(status: TaskStatus) {
  return status === 'done' || status === 'skipped'
}

export function priorityLabel(p: TaskPriority) {
  return PRIORITIES.find((x) => x.value === p)
}
export function typeLabel(t: TaskType) {
  return TYPES.find((x) => x.value === t)
}
export function sizeLabel(s: TaskSize) {
  return SIZES.find((x) => x.value === s)
}
export function categoryLabel(c: TaskCategory) {
  return CATEGORY_LABELS[c] ?? c
}

export function dueLabel(due: Date | null) {
  if (!due) return null
  if (isToday(due)) return { text: 'Today', tone: 'warn' as const }
  if (isTomorrow(due)) return { text: 'Tomorrow', tone: 'neutral' as const }
  if (isPast(due)) {
    const days = Math.abs(differenceInCalendarDays(new Date(), due))
    return { text: `${days}d overdue`, tone: 'danger' as const }
  }
  const days = differenceInCalendarDays(due, new Date())
  if (days <= 7) return { text: format(due, 'EEE'), tone: 'neutral' as const }
  return { text: format(due, 'MMM d'), tone: 'neutral' as const }
}

/** Due date for a newly created task when no explicit date is given: today
 *  at 5pm. Due date defaults to today rather than staying empty so every task
 *  starts out visible in Today/Week via its due date, not just its flags. */
export function defaultDueAt(): Date {
  const d = new Date()
  d.setHours(17, 0, 0, 0)
  return d
}

export function isOverdue(t: Task) {
  return !isClosed(t.status) && t.dueAt !== null && isPast(t.dueAt) && !isToday(t.dueAt)
}

export function isDueToday(t: Task) {
  return !isClosed(t.status) && t.dueAt !== null && isToday(t.dueAt)
}

/** Due within the next 7 days (or already overdue) — used so the week view
 *  reflects due dates even when the task wasn't manually flagged for the week. */
export function isDueThisWeek(t: Task) {
  return !isClosed(t.status) && belongsThisWeek(t)
}

/** True when the task belongs on today's plate (flagged Today, due today, overdue, or in progress). */
export function isOnDeck(t: Task) {
  return !isClosed(t.status) && belongsOnDeck(t)
}

// --- Status-agnostic view membership -------------------------------------
// These answer "does this task belong to the Today / Week view?" purely from
// its flags and dates, ignoring whether it is done or skipped. They let closed
// tasks still surface in a view (via the show done/skipped toggle) instead of
// being filtered out before the toggle can act.

export function belongsOnDeck(t: Task) {
  return (
    t.today ||
    t.status === 'doing' ||
    (t.dueAt !== null && isToday(t.dueAt)) ||
    (t.dueAt !== null && isPast(t.dueAt) && !isToday(t.dueAt))
  )
}

export function belongsThisWeek(t: Task) {
  return t.thisWeek || t.today || (t.dueAt !== null && differenceInCalendarDays(t.dueAt, new Date()) <= 7)
}

/**
 * Parse inline tokens out of a quick-add string:
 *   #tag  !urgent/!necessary/!important/!normal  @today/@tomorrow/@fri
 *   *today  ~week  ~errand/~task/~focus/~deep  ?research
 */
export function parseQuickAdd(input: string) {
  const tags: string[] = []
  let priority: TaskPriority | undefined
  let type: TaskType | undefined
  let dueAt: string | undefined
  let today = false
  let thisWeek = false
  let research = false

  const words = input.split(/\s+/).filter(Boolean)
  const keep: string[] = []
  for (const w of words) {
    const lw = w.toLowerCase()
    if (w.startsWith('#') && w.length > 1) tags.push(lw.slice(1))
    else if (/^!(urgent|necessary|important|normal)$/.test(lw)) priority = lw.slice(1) as TaskPriority
    else if (/^~(errand|task|focus|deep)$/.test(lw)) type = lw.slice(1) as TaskType
    else if (/^@(today|tomorrow|mon|tue|wed|thu|fri|sat|sun)$/.test(lw)) dueAt = relativeDate(lw.slice(1))
    else if (lw === '*today') today = true
    else if (lw === '~week' || lw === '*week') thisWeek = true
    else if (lw === '?research') research = true
    else keep.push(w)
  }
  return { title: keep.join(' ').trim(), tags, priority, type, dueAt, today, thisWeek, research }
}

function relativeDate(token: string) {
  const d = new Date()
  d.setHours(17, 0, 0, 0)
  const t = token.toLowerCase()
  if (t === 'today') return d.toISOString()
  if (t === 'tomorrow') {
    d.setDate(d.getDate() + 1)
    return d.toISOString()
  }
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const target = days.indexOf(t)
  const diff = (target - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d.toISOString()
}

// ---------- Habit shields ----------
// Tier 0 = none, 1..6 = wood → gold. Colors are deliberate material tints (not
// palette tokens) so each metal reads at a glance.
export type ShieldTier = {
  tier: number
  name: string
  color: string
  ring: string
}

export const SHIELD_TIERS: ShieldTier[] = [
  { tier: 1, name: 'Wood', color: '#8a5a2b', ring: 'rgba(138,90,43,0.35)' },
  { tier: 2, name: 'Leather', color: '#a9743f', ring: 'rgba(169,116,63,0.35)' },
  { tier: 3, name: 'Iron', color: '#6b7280', ring: 'rgba(107,114,128,0.35)' },
  { tier: 4, name: 'Steel', color: '#8aa0b6', ring: 'rgba(138,160,182,0.4)' },
  { tier: 5, name: 'Silver', color: '#c9d3dc', ring: 'rgba(201,211,220,0.5)' },
  { tier: 6, name: 'Gold', color: '#e3b23c', ring: 'rgba(227,178,60,0.55)' },
]

export function shieldForTier(tier: number): ShieldTier | null {
  if (tier < 1) return null
  return SHIELD_TIERS[Math.min(tier, 6) - 1]
}

/** Completing a habit: bump count, advance tier, bank a gold at the top. */
export function habitOnComplete(t: {
  habitCount: number
  habitTier: number
  habitGoldShields: number
}) {
  const habitCount = t.habitCount + 1
  let habitTier = t.habitTier
  let habitGoldShields = t.habitGoldShields
  if (habitTier >= 6) {
    // Was already gold — bank it and restart the climb at wood.
    habitGoldShields += 1
    habitTier = 1
  } else {
    habitTier += 1
  }
  return { habitCount, habitTier, habitGoldShields }
}

/** Undoing a completion (unchecking) reverses the last advance. */
export function habitOnUncomplete(t: {
  habitCount: number
  habitTier: number
  habitGoldShields: number
}) {
  const habitCount = Math.max(0, t.habitCount - 1)
  let habitTier = t.habitTier
  let habitGoldShields = t.habitGoldShields
  if (habitTier <= 1 && habitGoldShields > 0) {
    habitGoldShields -= 1
    habitTier = 6
  } else {
    habitTier = Math.max(0, habitTier - 1)
  }
  return { habitCount, habitTier, habitGoldShields }
}

/** A missed period drops the tier one step but never the lifetime count. */
export function habitOnMiss(t: { habitTier: number }) {
  return { habitTier: Math.max(0, t.habitTier - 1) }
}

// ---------- Period keys (day starts at 4am America/New_York) ----------
export const HABIT_TZ = 'America/New_York'
const DAY_START_HOUR = 4

/** The habit-day key (YYYY-MM-DD) for `now`, where a day starts at 4am ET. */
export function habitDayKey(now: Date = new Date(), tz: string = HABIT_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  const hour = Number(get('hour')) % 24
  let d = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`)
  if (hour < DAY_START_HOUR) d = new Date(d.getTime() - 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** The habit-week key: the Monday (YYYY-MM-DD) of the habit-day's week. */
export function habitWeekKey(now: Date = new Date(), tz: string = HABIT_TZ): string {
  const d = new Date(`${habitDayKey(now, tz)}T00:00:00Z`)
  const dow = d.getUTCDay() || 7 // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() - (dow - 1))
  return d.toISOString().slice(0, 10)
}

/** Current period key for a task's recurrence (daily-ish vs weekly-ish). */
export function periodKeyFor(recurrence: Recurrence, now: Date = new Date(), tz: string = HABIT_TZ) {
  if (recurrence === 'weekly' || recurrence === 'weeks') return habitWeekKey(now, tz)
  return habitDayKey(now, tz)
}

// Re-export type for consumers that import from lib/tasks.
export type { Recurrence, TaskGroup }
