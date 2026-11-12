import { start } from 'workflow/api'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agentRuns, tasks, type AgentName } from '@/lib/db/schema'
import { researchWorkflow } from '@/workflows/research'
import { housekeepingWorkflow } from '@/workflows/housekeeping'
import { newsletterWorkflow } from '@/workflows/newsletter'
import { notifyWorkflow } from '@/workflows/notify'
import { codeChangeWorkflow } from '@/workflows/code-change'

async function createRunRow(
  userId: string,
  agent: AgentName,
  trigger: string,
  input: Record<string, unknown>,
) {
  const [row] = await db
    .insert(agentRuns)
    .values({ userId, agent, trigger, input, status: 'queued' })
    .returning({ id: agentRuns.id })
  return row.id
}

async function attachRunId(agentRunId: number, runId: string) {
  await db.update(agentRuns).set({ runId }).where(eq(agentRuns.id, agentRunId))
}

export async function enqueueResearch(opts: {
  userId: string
  topic: string
  taskId?: number
  trigger: 'manual' | 'cron'
}) {
  const agentRunId = await createRunRow(opts.userId, 'research', opts.trigger, {
    topic: opts.topic,
    taskId: opts.taskId,
  })
  const run = await start(researchWorkflow, [
    { userId: opts.userId, agentRunId, topic: opts.topic, taskId: opts.taskId },
  ])
  await attachRunId(agentRunId, run.runId)
  if (opts.taskId) {
    await db.update(tasks).set({ researchRunId: run.runId }).where(eq(tasks.id, opts.taskId))
  }
  return { agentRunId, runId: run.runId }
}

export async function enqueueHousekeeping(userId: string, trigger: 'manual' | 'cron') {
  const agentRunId = await createRunRow(userId, 'housekeeping', trigger, {})
  const run = await start(housekeepingWorkflow, [{ userId, agentRunId }])
  await attachRunId(agentRunId, run.runId)
  return { agentRunId, runId: run.runId }
}

export async function enqueueNewsletter(userId: string, trigger: 'manual' | 'cron') {
  const agentRunId = await createRunRow(userId, 'newsletter', trigger, {})
  const run = await start(newsletterWorkflow, [{ userId, agentRunId }])
  await attachRunId(agentRunId, run.runId)
  return { agentRunId, runId: run.runId }
}

export async function enqueueNotify(userId: string, trigger: 'manual' | 'cron') {
  const agentRunId = await createRunRow(userId, 'notify', trigger, {})
  const run = await start(notifyWorkflow, [{ userId, agentRunId }])
  await attachRunId(agentRunId, run.runId)
  return { agentRunId, runId: run.runId }
}

export async function enqueueCodeChange(opts: {
  userId: string
  request: string
  trigger: 'manual' | 'cron'
}) {
  const agentRunId = await createRunRow(opts.userId, 'code', opts.trigger, { request: opts.request })
  const run = await start(codeChangeWorkflow, [
    { userId: opts.userId, agentRunId, request: opts.request },
  ])
  await attachRunId(agentRunId, run.runId)
  return { agentRunId, runId: run.runId }
}
