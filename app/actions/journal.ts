'use server'

import { and, desc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { journalEntries, type JournalBody, type JournalType } from '@/lib/db/schema'
import { emptyBodyFor } from '@/lib/journal'
import { getUserId } from '@/lib/session'

const item = z.string().trim().max(500)
const list = z.array(item).max(200)

// Permissive union: only the keys relevant to a given journal type are sent.
const bodySchema = z
  .object({
    feelings: list.optional(),
    wentWell: list.optional(),
    wentPoorly: list.optional(),
    wentBad: list.optional(),
    canAccept: list.optional(),
    cannotAccept: list.optional(),
    canImprove: list.optional(),
    didWell: list.optional(),
    learned: list.optional(),
    lessonsShort: list.optional(),
    lessonsMedium: list.optional(),
    lessonsLong: list.optional(),
    details: z.string().trim().max(8000).optional(),
  })
  .strip()

const savePatch = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  summary: z.string().trim().max(4000).nullable().optional(),
  body: bodySchema.optional(),
})

function revalidate() {
  revalidatePath('/journal')
}

export async function listJournal() {
  const userId = await getUserId()
  return db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), isNull(journalEntries.archivedAt)))
    .orderBy(desc(journalEntries.entryDate))
}

export async function createJournalEntry(rawType: JournalType) {
  const userId = await getUserId()
  const type = z.enum(['daily', 'relationship']).parse(rawType)
  const [row] = await db
    .insert(journalEntries)
    .values({
      userId,
      type,
      body: emptyBodyFor(type),
    })
    .returning()
  revalidate()
  return row
}

export async function saveJournalEntry(id: number, raw: z.infer<typeof savePatch>) {
  const userId = await getUserId()
  const data = savePatch.parse(raw)
  const [row] = await db
    .update(journalEntries)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.summary !== undefined && { summary: data.summary }),
      ...(data.body !== undefined && { body: data.body as JournalBody }),
      updatedAt: new Date(),
    })
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
    .returning()
  revalidate()
  return row
}

export async function archiveJournalEntry(id: number) {
  const userId = await getUserId()
  await db
    .update(journalEntries)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
  revalidate()
}
