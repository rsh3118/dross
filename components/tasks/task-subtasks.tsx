'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createTaskSubtask,
  deleteTaskSubtask,
  listTaskSubtasks,
  setTaskSubtaskCompleted,
  updateTaskSubtask,
} from '@/app/actions/tasks'
import type { TaskSubtask, TaskSubtaskLane } from '@/lib/db/schema'
import { HabitShield } from '@/components/tasks/habit-shield'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const LANES: { value: TaskSubtaskLane; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'full', label: 'Full' },
]

export function TaskSubtasks({ taskId }: { taskId: number }) {
  const [draft, setDraft] = useState('')
  const [newLane, setNewLane] = useState<TaskSubtaskLane>('full')
  const [busyId, setBusyId] = useState<number | 'new' | null>(null)
  const { data, error, isLoading, mutate } = useSWR<TaskSubtask[]>(
    `task-subtasks-${taskId}`,
    () => listTaskSubtasks(taskId),
  )

  const run = async (id: number | 'new', action: () => Promise<unknown>) => {
    setBusyId(id)
    try {
      await action()
      await mutate()
    } catch {
      toast.error('Could not update this to-do')
    } finally {
      setBusyId(null)
    }
  }

  const addSubtask = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = draft.trim()
    if (!title || busyId) return
    void run('new', async () => {
      await createTaskSubtask({ taskId, title, lane: newLane })
      setDraft('')
    })
  }

  const updateTitle = (item: TaskSubtask, title: string) => {
    const next = title.trim()
    if (!next || next === item.title || busyId) return
    void run(item.id, () => updateTaskSubtask(item.id, { title: next }))
  }

  const changeLane = (id: number, lane: TaskSubtaskLane) => {
    void run(id, () => updateTaskSubtask(id, { lane }))
  }

  const changeCompletion = (id: number, completed: boolean) => {
    void run(id, () => setTaskSubtaskCompleted(id, completed))
  }

  const remove = (id: number) => {
    void run(id, () => deleteTaskSubtask(id))
  }

  const items = data ?? []
  const renderLane = (lane: TaskSubtaskLane) => {
    const laneItems = items.filter((item) => item.lane === lane)
    const completedCount = laneItems.filter((item) => item.completed).length
    const label = LANES.find((item) => item.value === lane)?.label ?? lane

    return (
      <section key={lane} className="flex min-w-0 flex-1 flex-col gap-2" aria-labelledby={`task-${taskId}-${lane}-heading`}>
        <header className="flex items-center justify-between gap-2">
          <h4 id={`task-${taskId}-${lane}-heading`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </h4>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {completedCount}/{laneItems.length}
          </span>
        </header>
        {laneItems.length ? (
          <ul className="flex flex-col gap-1">
            {laneItems.map((item) => (
              <li key={item.id} className={cn('flex min-w-0 items-center gap-2 rounded-md border bg-background/50 px-2 py-1.5', busyId === item.id && 'opacity-60')}>
                <Checkbox
                  checked={item.completed}
                  disabled={busyId !== null}
                  onCheckedChange={(checked) => changeCompletion(item.id, Boolean(checked))}
                  aria-label={`${item.completed ? 'Mark incomplete' : 'Mark complete'}: ${item.title}`}
                />
                <Input
                  key={`${item.id}-${item.updatedAt.getTime()}`}
                  defaultValue={item.title}
                  aria-label="To-do title"
                  disabled={busyId !== null}
                  onBlur={(event) => {
                    if (!event.currentTarget.value.trim()) {
                      event.currentTarget.value = item.title
                      return
                    }
                    updateTitle(item, event.currentTarget.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                  className={cn('h-7 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm shadow-none hover:border-input focus-visible:border-input', item.completed && 'text-muted-foreground line-through')}
                />
                <HabitShield
                  tier={item.habitTier}
                  count={item.habitCount}
                  goldShields={item.habitGoldShields}
                  label="to-do"
                />
                <Select
                  value={item.lane}
                  onValueChange={(value) => value && changeLane(item.id, value as TaskSubtaskLane)}
                >
                  <SelectTrigger className="h-7 w-[5.5rem] shrink-0 px-2 text-xs" aria-label={`Move ${item.title} to another list`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {LANES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={busyId !== null}
                  onClick={() => remove(item.id)}
                  aria-label={`Delete ${item.title}`}
                >
                  <Trash2 data-icon="inline-start" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">No to-dos in this list.</p>
        )}
      </section>
    )
  }

  return (
    <div
      id={`task-subtasks-${taskId}`}
      className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3"
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {isLoading ? (
        <p className="text-xs text-muted-foreground" role="status">Loading to-dos…</p>
      ) : error ? (
        <p className="text-xs text-destructive" role="alert">Could not load this task&apos;s to-dos.</p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {renderLane('critical')}
          <div className="hidden self-stretch border-l sm:block" aria-hidden />
          {renderLane('full')}
        </div>
      )}

      <form onSubmit={addSubtask} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`task-${taskId}-new-subtask`} className="sr-only">Add a to-do</label>
        <Input
          id={`task-${taskId}-new-subtask`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={200}
          placeholder="Add a to-do…"
          disabled={busyId !== null}
          className="min-w-0 flex-1 bg-background/70"
        />
        <Select value={newLane} onValueChange={(value) => value && setNewLane(value as TaskSubtaskLane)}>
          <SelectTrigger className="w-full shrink-0 sm:w-28" aria-label="Add to list">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {LANES.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={!draft.trim() || busyId !== null}>
          <Plus data-icon="inline-start" />
          Add
        </Button>
      </form>
    </div>
  )
}
