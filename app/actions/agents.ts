'use server'

import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { agentRuns, type AgentName } from '@/lib/db/schema'
import { getUserId } from '@/lib/session'
import {
  enqueueCodeChange,
  enqueueHousekeeping,
  enqueueNewsletter,
  enqueueNotify,
  enqueueResearch,
} from '@/lib/agents/enqueue'

export async function listRuns(agent?: AgentName) {
  const userId = await getUserId()
  return db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), agent ? eq(agentRuns.agent, agent) : undefined))
    .orderBy(desc(agentRuns.startedAt))
    .limit(40)
}

export async function getRun(id: number) {
  const userId = await getUserId()
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, id), eq(agentRuns.userId, userId)))
  return run ?? null
}

const runInput = z.object({
  agent: z.enum(['research', 'housekeeping', 'newsletter', 'notify', 'code']),
  topic: z.string().trim().min(3).max(2000).optional(),
})

export async function runAgentNow(raw: z.infer<typeof runInput>) {
  const userId = await getUserId()
  const { agent, topic } = runInput.parse(raw)

  let result
  switch (agent) {
    case 'research':
      if (!topic) throw new Error('Research needs a topic')
      result = await enqueueResearch({ userId, topic, trigger: 'manual' })
      break
    case 'housekeeping':
      result = await enqueueHousekeeping(userId, 'manual')
      break
    case 'newsletter':
      result = await enqueueNewsletter(userId, 'manual')
      break
    case 'notify':
      result = await enqueueNotify(userId, 'manual')
      break
    case 'code':
      if (!topic) throw new Error('Describe the change you want')
      result = await enqueueCodeChange({ userId, request: topic, trigger: 'manual' })
      break
  }
  revalidatePath('/agents')
  revalidatePath('/')
  return result
}
