'use server'

import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { capturedTasks, settings } from '@/lib/db/schema'
import { getUserId } from '@/lib/session'
import { getOrCreateRecorderToken } from '@/lib/ambient'
import { resolveCaptured } from '@/lib/ambient-process'

export async function listCaptured() {
  const userId = await getUserId()
  return db
    .select()
    .from(capturedTasks)
    .where(and(eq(capturedTasks.userId, userId), eq(capturedTasks.status, 'pending')))
    .orderBy(desc(capturedTasks.createdAt))
}

export async function resolveCapturedAction(id: number, action: 'approve' | 'dismiss') {
  const userId = await getUserId()
  const n = await resolveCaptured(userId, action, id)
  revalidatePath('/capture')
  revalidatePath('/tasks')
  revalidatePath('/')
  return { resolved: n }
}

export async function resolveAllCaptured(action: 'approve' | 'dismiss') {
  const userId = await getUserId()
  const n = await resolveCaptured(userId, action, 'all')
  revalidatePath('/capture')
  revalidatePath('/tasks')
  revalidatePath('/')
  return { resolved: n }
}

export async function getRecorderSetup() {
  const userId = await getUserId()
  const token = await getOrCreateRecorderToken(userId)
  const [cfg] = await db.select().from(settings).where(eq(settings.userId, userId))
  return {
    token,
    ambientEnabled: cfg?.ambientEnabled ?? true,
    ambientEmailApproval: cfg?.ambientEmailApproval ?? true,
  }
}

export async function rotateRecorderToken() {
  const userId = await getUserId()
  // Null it then regenerate so old links stop working.
  await db.update(settings).set({ recorderToken: null }).where(eq(settings.userId, userId))
  const token = await getOrCreateRecorderToken(userId)
  revalidatePath('/capture')
  return { token }
}

export async function setAmbientOptions(opts: { enabled?: boolean; emailApproval?: boolean }) {
  const userId = await getUserId()
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof opts.enabled === 'boolean') patch.ambientEnabled = opts.enabled
  if (typeof opts.emailApproval === 'boolean') patch.ambientEmailApproval = opts.emailApproval
  await db
    .insert(settings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: settings.userId, set: patch })
  revalidatePath('/capture')
  return { ok: true }
}
