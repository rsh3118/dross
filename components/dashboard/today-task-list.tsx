'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Task } from '@/lib/db/schema'
import { TaskRow } from '@/components/tasks/task-row'
import { TaskSheet } from '@/components/tasks/task-sheet'

export function TodayTaskList({
  tasks,
  fallback,
  boulders = [],
}: {
  tasks: Task[]
  fallback: Task[]
  boulders?: { id: number; title: string }[]
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const list = tasks.length > 0 ? tasks : fallback
  const all = [...tasks, ...fallback]
  const selectedTask = all.find((t) => t.id === selected) ?? null

  return (
    <>
      <div className="rounded-lg border bg-card divide-y">
        {list.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No open tasks.{' '}
            <Link href="/tasks" className="text-primary underline underline-offset-4">
              Add one
            </Link>
            .
          </p>
        )}
        {tasks.length === 0 && fallback.length > 0 && (
          <p className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
            nothing due today — next up
          </p>
        )}
        {list.map((t) => (
          <TaskRow key={t.id} task={t} projects={boulders} onOpen={() => setSelected(t.id)} />
        ))}
      </div>
      <TaskSheet task={selectedTask} boulders={boulders} onClose={() => setSelected(null)} />
    </>
  )
}
