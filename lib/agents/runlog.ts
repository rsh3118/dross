import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agentRuns, notifications, type NotificationKind, type RunLogEntry, type RunStatus } from '@/lib/db/schema'

export async function appendLog(agentRunId: number, message: string, level: RunLogEntry['level'] = 'info') {
  const entry: RunLogEntry = { at: new Date().toISOString(), level, message }
  await db
    .update(agentRuns)
    .set({ log: sql`${agentRuns.log} || ${JSON.stringify([entry])}::jsonb` })
    .where(eq(agentRuns.id, agentRunId))
}

export async function setRunStatus(
  agentRunId: number,
  status: RunStatus,
  extra?: { summary?: string; error?: string },
) {
  await db
    .update(agentRuns)
    .set({
      status,
      ...(extra?.summary !== undefined && { summary: extra.summary }),
      ...(extra?.error !== undefined && { error: extra.error }),
      ...((status === 'completed' || status === 'failed') && { finishedAt: new Date() }),
    })
    .where(eq(agentRuns.id, agentRunId))
}

export async function pushNotification(opts: {
  userId: string
  kind: NotificationKind
  title: string
  body?: string
  href?: string
  emailed?: boolean
}) {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: opts.userId,
      kind: opts.kind,
      title: opts.title,
      body: opts.body ?? null,
      href: opts.href ?? null,
      emailedAt: opts.emailed ? new Date() : null,
    })
    .returning({ id: notifications.id })
  return row.id
}
