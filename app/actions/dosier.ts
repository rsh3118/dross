'use server'

import { and, asc, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  dossierHistory,
  dossierPeople,
  dossierReflections,
  type DossierHistorySource,
  type DossierReflectionActor,
} from '@/lib/db/schema'
import { getUserId } from '@/lib/session'

const personFields = z.object({
  name: z.string().trim().min(1).max(160),
  importance: z.string().trim().max(500),
  relationshipLevel: z.string().trim().max(500),
})

function revalidateDossier(personId?: number) {
  revalidatePath('/dosier')
  if (personId !== undefined) revalidatePath(`/dosier/${personId}`)
}

export async function listDossierPeople() {
  const userId = await getUserId()
  return db.select().from(dossierPeople).where(eq(dossierPeople.userId, userId)).orderBy(asc(dossierPeople.name))
}

export async function getDossierPerson(id: number) {
  const userId = await getUserId()
  if (!Number.isSafeInteger(id) || id < 1) return null

  const [person] = await db
    .select()
    .from(dossierPeople)
    .where(and(eq(dossierPeople.id, id), eq(dossierPeople.userId, userId)))
    .limit(1)
  if (!person) return null

  const [history, reflections] = await Promise.all([
    db.select().from(dossierHistory)
      .where(and(eq(dossierHistory.personId, id), eq(dossierHistory.userId, userId)))
      .orderBy(desc(dossierHistory.occurredAt), desc(dossierHistory.createdAt)),
    db.select().from(dossierReflections)
      .where(and(eq(dossierReflections.personId, id), eq(dossierReflections.userId, userId)))
      .orderBy(desc(dossierReflections.createdAt)),
  ])

  return { person, history, reflections }
}

export async function createDossierPerson(raw: z.input<typeof personFields>) {
  const userId = await getUserId()
  const data = personFields.parse(raw)
  const [person] = await db.insert(dossierPeople).values({ userId, ...data }).returning()
  revalidateDossier()
  return person
}

export async function saveDossierPerson(id: number, raw: z.input<typeof personFields>) {
  const userId = await getUserId()
  const data = personFields.parse(raw)
  const [person] = await db.update(dossierPeople)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(dossierPeople.id, id), eq(dossierPeople.userId, userId)))
    .returning()
  if (person) revalidateDossier(id)
  return person
}

const historyFields = z.object({
  personId: z.number().int().positive(),
  title: z.string().trim().max(200),
  content: z.string().trim().min(1).max(12000),
  occurredOn: z.string().trim().max(10).regex(/^$|^\d{4}-\d{2}-\d{2}$/),
})

export async function createDossierHistory(raw: z.input<typeof historyFields>) {
  const userId = await getUserId()
  const data = historyFields.parse(raw)
  const [person] = await db.select({ id: dossierPeople.id }).from(dossierPeople)
    .where(and(eq(dossierPeople.id, data.personId), eq(dossierPeople.userId, userId))).limit(1)
  if (!person) throw new Error('Person not found')

  const occurredAt = data.occurredOn ? new Date(`${data.occurredOn}T12:00:00.000Z`) : null
  if (occurredAt && (Number.isNaN(occurredAt.getTime()) || occurredAt.toISOString().slice(0, 10) !== data.occurredOn)) {
    throw new Error('Invalid history date')
  }
  const sourceType: DossierHistorySource = 'manual'
  const [record] = await db.insert(dossierHistory).values({
    userId,
    personId: data.personId,
    title: data.title || null,
    content: data.content,
    occurredAt,
    sourceType,
  }).returning()
  revalidateDossier(data.personId)
  return record
}

export async function deleteDossierHistory(id: number, personId: number) {
  const userId = await getUserId()
  await db.delete(dossierHistory).where(and(
    eq(dossierHistory.id, id),
    eq(dossierHistory.personId, personId),
    eq(dossierHistory.userId, userId),
  ))
  revalidateDossier(personId)
}

const reflectionFields = z.object({
  personId: z.number().int().positive(),
  content: z.string().trim().min(1).max(12000),
  actor: z.enum(['me', 'ai']),
})

export async function createDossierReflection(raw: z.input<typeof reflectionFields>) {
  const userId = await getUserId()
  const data = reflectionFields.parse(raw)
  const [person] = await db.select({ id: dossierPeople.id }).from(dossierPeople)
    .where(and(eq(dossierPeople.id, data.personId), eq(dossierPeople.userId, userId))).limit(1)
  if (!person) throw new Error('Person not found')

  const actor: DossierReflectionActor = data.actor
  const [reflection] = await db.insert(dossierReflections).values({ userId, ...data, actor }).returning()
  revalidateDossier(data.personId)
  return reflection
}

export async function deleteDossierReflection(id: number, personId: number) {
  const userId = await getUserId()
  await db.delete(dossierReflections).where(and(
    eq(dossierReflections.id, id),
    eq(dossierReflections.personId, personId),
    eq(dossierReflections.userId, userId),
  ))
  revalidateDossier(personId)
}
