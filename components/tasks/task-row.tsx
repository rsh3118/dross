'use client'

import { useEffect, useState, useTransition } from 'react'
import { format } from 'date-fns'
import { FlaskConical, PanelRightOpen, Trash2 } from 'lucide-react'
import type {
  Task,
  TaskCategory,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@/lib/db/schema'
import { deleteTask, setTaskStatus, updateTask } from '@/app/actions/tasks'
import {
  CATEGORIES_BY_GROUP,
  CATEGORY_DOT,
  CATEGORY_LABELS,
  PRIORITIES,
  TYPE_DOT,
  TYPES,
  dueLabel,
  isHabit,
  priorityLabel,
  typeLabel,
} from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { HabitShield } from '@/components/tasks/habit-shield'
import { ColorDot, urgencyClass } from '@/components/tasks/task-visuals'

type Option = { id: number; title: string }

/** Optional handlers let a parent apply edits optimistically instead of the
 *  row awaiting the server action itself (keeps large lists buttery-smooth). */
export type RowHandlers = {
  onPatch?: (id: number, patch: Parameters<typeof updateTask>[1]) => void
  onStatus?: (id: number, status: TaskStatus) => void
  onToday?: (id: number, today: boolean) => void
  onDelete?: (id: number) => void
}

// One shared trigger style — text-sm, no mono — so the picked value matches the
// options in the open menu exactly.
const triggerCls = 'h-8 gap-1.5 rounded-md border-input bg-background/70 px-2.5 text-sm'

export function TaskRow({
  task,
  projects = [],
  onOpen,
  onPatch,
  onStatus,
  onToday,
  onDelete,
}: {
  task: Task
  projects?: Option[]
  onOpen: () => void
} & RowHandlers) {
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState(task.title)

  // Re-sync the local title when the server sends a fresh task after revalidate.
  useEffect(() => {
    setTitle(task.title)
  }, [task.title])

  const done = task.status === 'done'
  const skipped = task.status === 'skipped'
  const closed = done || skipped
  const priority = priorityLabel(task.priority)
  const habit = isHabit(task.recurrence)
  const categories = CATEGORIES_BY_GROUP[task.group]
  const due = dueLabel(task.dueAt)

  // Apply an edit optimistically through the parent when possible, else fall
  // back to awaiting the server action directly.
  const patch = (data: Parameters<typeof updateTask>[1]) => {
    if (onPatch) return onPatch(task.id, data)
    startTransition(async () => {
      await updateTask(task.id, data)
    })
  }
  const changeStatus = (s: TaskStatus) => {
    if (onStatus) return onStatus(task.id, s)
    startTransition(async () => {
      await setTaskStatus(task.id, s)
    })
  }
  const removeTask = () => {
    if (onDelete) return onDelete(task.id)
    startTransition(async () => {
      await deleteTask(task.id)
    })
  }

  const saveTitle = () => {
    const next = title.trim()
    if (!next || next === task.title) {
      setTitle(task.title)
      return
    }
    patch({ title: next })
  }

  const dueValue = task.dueAt ? format(task.dueAt, 'yyyy-MM-dd') : ''
  const bucket = task.urgency
  const setBucket = (next: 'top' | 'today' | 'week' | 'backlog') => {
    patch({ urgency: next })
  }

  return (
    <div
      onDoubleClick={onOpen}
      className={cn(
        'group relative flex gap-3 px-3 py-2.5 transition-colors',
        urgencyClass(task.priority),
        !closed && 'hover:brightness-[0.98]',
        pending && 'opacity-70',
      )}
    >
      {task.priority === 'urgent' && !closed && <span className="fire" aria-hidden />}

      {/* Status column: checkbox (done ↔ not started) with a Skip toggle below. */}
      <div
        onDoubleClick={(e) => e.stopPropagation()}
        className="relative flex w-14 shrink-0 flex-col items-center gap-1.5 pt-1"
      >
        <Checkbox
          checked={done}
          aria-label={done ? 'Mark not started' : 'Mark done'}
          onCheckedChange={(v) => changeStatus(v ? 'done' : 'not_started')}
          className="size-5"
        />
        <button
          type="button"
          onClick={() => changeStatus(skipped ? 'not_started' : 'skipped')}
          aria-pressed={skipped}
          className={cn(
            'rounded px-1.5 text-[11px] font-medium transition-colors',
            skipped
              ? 'text-foreground/70 underline underline-offset-2'
              : 'text-muted-foreground/60 hover:text-foreground',
          )}
        >
          Skip
        </button>
        <button
          type="button"
          onClick={removeTask}
          aria-label="Delete task"
          className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* Line 1: title (half) · today + this week (other half) */}
        <div className="relative flex items-center gap-3">
          <div className="flex min-w-0 basis-1/2 items-center gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  setTitle(task.title)
                  e.currentTarget.blur()
                }
              }}
              aria-label="Task title"
              className={cn(
                'h-8 border-transparent bg-transparent px-1.5 text-sm font-medium shadow-none hover:border-input focus-visible:border-input',
                closed && 'text-muted-foreground line-through',
              )}
            />
            {habit && <HabitShield tier={task.habitTier} count={task.habitCount} goldShields={task.habitGoldShields} />}
            {task.isResearch && <FlaskConical className="size-3.5 shrink-0 text-primary" aria-label="Research task" />}
            {habit && <span title="Habit" aria-label="Habit" className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded border border-primary/40 font-mono text-[10px] font-semibold text-primary">H</span>}
          </div>

          <div
            onDoubleClick={(e) => e.stopPropagation()}
            className="flex flex-1 items-center justify-end gap-1.5"
          >
            {(['top', 'today', 'week', 'backlog'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-label={`Move to ${option}`}
                aria-pressed={bucket === option}
                onClick={() => setBucket(option)}
                className={cn(
                  'h-8 rounded-md border px-2.5 text-sm capitalize transition-colors',
                  bucket === option
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-input bg-background/70 text-muted-foreground hover:text-foreground',
                )}
              >
                {option === 'week' ? 'This week' : option}
              </button>
            ))}
            <button
              type="button"
              onClick={onOpen}
              aria-label="Open full editor"
              className="shrink-0 rounded p-1 text-muted-foreground/40 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            >
              <PanelRightOpen className="size-4" />
            </button>
          </div>
        </div>

        {/* Line 2: priority · type · category · project · due */}
        <div
          onDoubleClick={(e) => e.stopPropagation()}
          className="flex flex-wrap items-center gap-2"
        >
          <Select value={task.priority} onValueChange={(v) => v && patch({ priority: v as TaskPriority })}>
            <SelectTrigger aria-label="Priority" className={cn(triggerCls, 'w-[8.5rem]', priority?.className)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={task.type} onValueChange={(v) => v && patch({ type: v as TaskType })}>
            <SelectTrigger aria-label="Type" className={cn(triggerCls, 'w-[11rem]')}>
              <SelectValue>
                <span className="flex items-center gap-2">
                  <ColorDot color={TYPE_DOT[task.type]} />
                  {typeLabel(task.type)?.label}
                  <span className="text-muted-foreground">· {typeLabel(task.type)?.hint}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
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

          <Select value={task.category} onValueChange={(v) => v && patch({ category: v as TaskCategory })}>
            <SelectTrigger aria-label="Category" className={cn(triggerCls, 'w-36')}>
              <SelectValue>
                <span className="flex items-center gap-2">
                  <ColorDot color={CATEGORY_DOT[task.category]} />
                  {CATEGORY_LABELS[task.category]}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="flex items-center gap-2">
                    <ColorDot color={CATEGORY_DOT[c]} />
                    {CATEGORY_LABELS[c]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {projects.length > 0 && (
            <Select
              value={task.boulderId ? String(task.boulderId) : 'none'}
              onValueChange={(v) => patch({ boulderId: !v || v === 'none' ? null : Number(v) })}
            >
              <SelectTrigger aria-label="Project" className={cn(triggerCls, 'w-44')}>
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Input
            type="date"
            value={dueValue}
            aria-label="Due date"
            onChange={(e) =>
              patch({ dueAt: e.target.value ? new Date(`${e.target.value}T17:00`).toISOString() : null })
            }
            className={cn(
              'h-8 w-[10rem] rounded-md border-input bg-background/70 px-2.5 text-sm',
              due?.tone === 'danger' && 'text-destructive',
              due?.tone === 'warn' && 'text-warning',
            )}
          />
        </div>
      </div>
    </div>
  )
}
