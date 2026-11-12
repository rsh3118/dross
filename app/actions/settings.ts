'use server'

import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { interests, settings } from '@/lib/db/schema'
import { getUserId } from '@/lib/session'

export async function getSettings() {
  const userId = await getUserId()
  const [row] = await db.select().from(settings).where(eq(settings.userId, userId))
  if (row) return row
  const [created] = await db.insert(settings).values({ userId }).returning()
  return created
}

const settingsInput = z.object({
  timezone: z.string().min(1).max(64),
  newsletterDay: z.number().int().min(0).max(6),
  newsletterHour: z.number().int().min(0).max(23),
  notifyEmail: z.boolean(),
  quietStart: z.number().int().min(0).max(23),
  quietEnd: z.number().int().min(0).max(23),
  housekeepingEnabled: z.boolean(),
  researchAuto: z.boolean(),
})

export async function saveSettings(raw: z.infer<typeof settingsInput>) {
  const userId = await getUserId()
  const data = settingsInput.parse(raw)
  await db
    .insert(settings)
    .values({ userId, ...data })
    .onConflictDoUpdate({ target: settings.userId, set: { ...data, updatedAt: new Date() } })
  revalidatePath('/settings')
}

export async function listInterests() {
  const userId = await getUserId()
  return db.select().from(interests).where(eq(interests.userId, userId)).orderBy(desc(interests.weight), desc(interests.createdAt))
}

const interestInput = z.object({
  topic: z.string().trim().min(2).max(120),
  keywords: z.array(z.string().trim().min(1).max(40)).max(10),
  weight: z.number().int().min(1).max(5),
})

export async function addInterest(raw: z.infer<typeof interestInput>) {
  const userId = await getUserId()
  const data = interestInput.parse(raw)
  await db.insert(interests).values({ userId, ...data })
  revalidatePath('/settings')
}

export async function removeInterest(id: number) {
  const userId = await getUserId()
  await db.delete(interests).where(and(eq(interests.id, id), eq(interests.userId, userId)))
  revalidatePath('/settings')
}
