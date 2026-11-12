'use server'

import { and, desc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { notifications } from '@/lib/db/schema'
import { getUserId } from '@/lib/session'

export async function listNotifications() {
  const userId = await getUserId()
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(100)
}

export async function markRead(id: number) {
  const userId = await getUserId()
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
  revalidatePath('/notifications')
  revalidatePath('/', 'layout')
}

export async function markAllRead() {
  const userId = await getUserId()
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
  revalidatePath('/notifications')
  revalidatePath('/', 'layout')
}
