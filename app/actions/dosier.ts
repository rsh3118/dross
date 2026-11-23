'use server'

import { and, asc, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  dossierComments,
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
  importanceScore: z.number().int().min(0).max(100),
  temperatureScore: z.number().int().min(0).max(100),
})

function revalidateDossier(personId?: number) {
  revalidatePath('/dosier')
  if (personId !== undefined) revalidatePath(`/dosier/${personId}`)
}

export async function listDossierPeople() {
  const userId = await getUserId()
  return db.select().from(dossierPeople).where(eq(dossierPeople.userId, userId))
    .orderBy(desc(dossierPeople.importanceScore), desc(dossierPeople.temperatureScore), asc(dossierPeople.name))
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

  const [history, reflections, comments] = await Promise.all([
    db.select().from(dossierHistory)
      .where(and(eq(dossierHistory.personId, id), eq(dossierHistory.userId, userId)))
      .orderBy(desc(dossierHistory.occurredAt), desc(dossierHistory.createdAt)),
    db.select().from(dossierReflections)
      .where(and(eq(dossierReflections.personId, id), eq(dossierReflections.userId, userId)))
      .orderBy(desc(dossierReflections.createdAt)),
    db.select().from(dossierComments)
      .where(and(eq(dossierComments.personId, id), eq(dossierComments.userId, userId)))
      .orderBy(desc(dossierComments.createdAt)),
  ])

  return { person, history, reflections, comments }
}

export async function createDossierPerson(raw: z.input<typeof personFields>) {
  const userId = await getUserId()
  const data = personFields.parse(raw)
  const person = await db.transaction(async (tx) => {
    const [created] = await tx.insert(dossierPeople).values({ userId, ...data }).returning()
    await tx.insert(dossierComments).values({
      userId,
      personId: created.id,
      personName: created.name,
      targetType: 'person',
      targetId: created.id,
      action: 'create',
      actor: 'me',
      comment: `Added person “${created.name}” to Dosier.`,
    })
    return created
  })
  revalidateDossier()
  return person
}

export async function saveDossierPerson(id: number, raw: z.input<typeof personFields>) {
  const userId = await getUserId()
  const data = personFields.parse(raw)
  const person = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(dossierPeople)
      .where(and(eq(dossierPeople.id, id), eq(dossierPeople.userId, userId)))
      .limit(1)
    if (!current) return undefined

    const changes = [
      ...(current.name !== data.name ? [`name: “${current.name}” → “${data.name}”`] : []),
      ...(current.importance !== data.importance ? [`importance: “${current.importance}” → “${data.importance}”`] : []),
      ...(current.relationshipLevel !== data.relationshipLevel ? [`relationship level: “${current.relationshipLevel}” → “${data.relationshipLevel}”`] : []),
      ...(current.importanceScore !== data.importanceScore ? [`importance score: ${current.importanceScore} → ${data.importanceScore}`] : []),
      ...(current.temperatureScore !== data.temperatureScore ? [`temperature score: ${current.temperatureScore} → ${data.temperatureScore}`] : []),
    ]
    if (changes.length === 0) return current

    const [updated] = await tx.update(dossierPeople)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(dossierPeople.id, id), eq(dossierPeople.userId, userId)))
      .returning()
    await tx.insert(dossierComments).values({
      userId,
      personId: current.id,
      personName: updated.name,
      targetType: 'person',
      targetId: current.id,
      action: 'update',
      actor: 'me',
      comment: `Updated ${changes.join('; ')}.`,
    })
    return updated
  })
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
  const occurredAt = data.occurredOn ? new Date(`${data.occurredOn}T12:00:00.000Z`) : null
  if (occurredAt && (Number.isNaN(occurredAt.getTime()) || occurredAt.toISOString().slice(0, 10) !== data.occurredOn)) {
    throw new Error('Invalid history date')
  }
  const sourceType: DossierHistorySource = 'manual'
  const record = await db.transaction(async (tx) => {
    const [person] = await tx.select().from(dossierPeople)
      .where(and(eq(dossierPeople.id, data.personId), eq(dossierPeople.userId, userId))).limit(1)
    if (!person) throw new Error('Person not found')
    const [created] = await tx.insert(dossierHistory).values({
      userId,
      personId: data.personId,
      title: data.title || null,
      content: data.content,
      occurredAt,
      sourceType,
    }).returning()
    await tx.insert(dossierComments).values({
      userId,
      personId: person.id,
      personName: person.name,
      targetType: 'history',
      targetId: created.id,
      action: 'create',
      actor: 'me',
      comment: `Added history record${created.title ? ` “${created.title}”` : ''}${occurredAt ? ` for ${data.occurredOn}` : ''}: “${created.content}”`,
    })
    return created
  })
  revalidateDossier(data.personId)
  return record
}

export async function deleteDossierHistory(id: number, personId: number) {
  const userId = await getUserId()
  await db.transaction(async (tx) => {
    const [[person], [record]] = await Promise.all([
      tx.select().from(dossierPeople).where(and(eq(dossierPeople.id, personId), eq(dossierPeople.userId, userId))).limit(1),
      tx.select().from(dossierHistory).where(and(eq(dossierHistory.id, id), eq(dossierHistory.personId, personId), eq(dossierHistory.userId, userId))).limit(1),
    ])
    if (!person || !record) return
    await tx.delete(dossierHistory).where(and(
      eq(dossierHistory.id, id),
      eq(dossierHistory.personId, personId),
      eq(dossierHistory.userId, userId),
    ))
    await tx.insert(dossierComments).values({
      userId,
      personId,
      personName: person.name,
      targetType: 'history',
      targetId: record.id,
      action: 'delete',
      actor: 'me',
      comment: `Removed history record${record.title ? ` “${record.title}”` : ''}: “${record.content}”`,
    })
  })
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
  const actor: DossierReflectionActor = data.actor
  const reflection = await db.transaction(async (tx) => {
    const [person] = await tx.select().from(dossierPeople)
      .where(and(eq(dossierPeople.id, data.personId), eq(dossierPeople.userId, userId))).limit(1)
    if (!person) throw new Error('Person not found')
    const [created] = await tx.insert(dossierReflections).values({ userId, ...data, actor }).returning()
    await tx.insert(dossierComments).values({
      userId,
      personId: person.id,
      personName: person.name,
      targetType: 'reflection',
      targetId: created.id,
      action: 'create',
      actor: 'me',
      comment: `Added an ${actor === 'ai' ? 'AI' : 'personal'} reflection: “${created.content}”`,
    })
    return created
  })
  revalidateDossier(data.personId)
  return reflection
}

export async function deleteDossierReflection(id: number, personId: number) {
  const userId = await getUserId()
  await db.transaction(async (tx) => {
    const [[person], [reflection]] = await Promise.all([
      tx.select().from(dossierPeople).where(and(eq(dossierPeople.id, personId), eq(dossierPeople.userId, userId))).limit(1),
      tx.select().from(dossierReflections).where(and(eq(dossierReflections.id, id), eq(dossierReflections.personId, personId), eq(dossierReflections.userId, userId))).limit(1),
    ])
    if (!person || !reflection) return
    await tx.delete(dossierReflections).where(and(
      eq(dossierReflections.id, id),
      eq(dossierReflections.personId, personId),
      eq(dossierReflections.userId, userId),
    ))
    await tx.insert(dossierComments).values({
      userId,
      personId,
      personName: person.name,
      targetType: 'reflection',
      targetId: reflection.id,
      action: 'delete',
      actor: 'me',
      comment: `Removed ${reflection.actor === 'ai' ? 'AI' : 'personal'} reflection: “${reflection.content}”`,
    })
  })
  revalidateDossier(personId)
}
