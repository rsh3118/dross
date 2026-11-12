'use server'

import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  boulders,
  mountains,
  tasks,
  type MountainArea,
  type StructureStatus,
} from '@/lib/db/schema'
import { getUserId } from '@/lib/session'

const mountainInput = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  area: z.enum(['body', 'career', 'relationships', 'mind', 'finance', 'lifestyle', 'other']).optional(),
  status: z.enum(['active', 'done', 'someday']).optional(),
  progress: z.number().int().min(0).max(100).optional(),
})

const boulderInput = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  mountainId: z.number().int().positive().nullable().optional(),
  status: z.enum(['active', 'done', 'someday']).optional(),
})

function revalidate() {
  revalidatePath('/structure')
  revalidatePath('/tasks')
  revalidatePath('/')
}

export async function listStructure() {
  const userId = await getUserId()
  const [ms, bs, ts] = await Promise.all([
    db
      .select()
      .from(mountains)
      .where(and(eq(mountains.userId, userId), isNull(mountains.archivedAt)))
      .orderBy(asc(mountains.status), desc(mountains.createdAt)),
    db
      .select()
      .from(boulders)
      .where(and(eq(boulders.userId, userId), isNull(boulders.archivedAt)))
      .orderBy(desc(boulders.createdAt)),
    db
      .select({ id: tasks.id, boulderId: tasks.boulderId, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.archivedAt))),
  ])
  return { mountains: ms, boulders: bs, tasks: ts }
}

export async function createMountain(raw: z.infer<typeof mountainInput>) {
  const userId = await getUserId()
  const data = mountainInput.parse(raw)
  const [row] = await db
    .insert(mountains)
    .values({
      userId,
      title: data.title,
      description: data.description ?? null,
      area: (data.area ?? 'other') as MountainArea,
      status: (data.status ?? 'active') as StructureStatus,
      progress: data.progress ?? 0,
    })
    .returning()
  revalidate()
  return row
}

export async function updateMountain(id: number, raw: Partial<z.infer<typeof mountainInput>>) {
  const userId = await getUserId()
  const data = mountainInput.partial().parse(raw)
  const [row] = await db
    .update(mountains)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.area !== undefined && { area: data.area as MountainArea }),
      ...(data.status !== undefined && { status: data.status as StructureStatus }),
      ...(data.progress !== undefined && { progress: data.progress }),
      updatedAt: new Date(),
    })
    .where(and(eq(mountains.id, id), eq(mountains.userId, userId)))
    .returning()
  revalidate()
  return row
}

export async function archiveMountain(id: number) {
  const userId = await getUserId()
  await db
    .update(mountains)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(mountains.id, id), eq(mountains.userId, userId)))
  // Detach boulders and tasks from the archived mountain.
  await db.update(boulders).set({ mountainId: null }).where(and(eq(boulders.mountainId, id), eq(boulders.userId, userId)))
  await db.update(tasks).set({ mountainId: null }).where(and(eq(tasks.mountainId, id), eq(tasks.userId, userId)))
  revalidate()
}

export async function createBoulder(raw: z.infer<typeof boulderInput>) {
  const userId = await getUserId()
  const data = boulderInput.parse(raw)
  const [row] = await db
    .insert(boulders)
    .values({
      userId,
      title: data.title,
      description: data.description ?? null,
      mountainId: data.mountainId ?? null,
      status: (data.status ?? 'active') as StructureStatus,
    })
    .returning()
  revalidate()
  return row
}

export async function updateBoulder(id: number, raw: Partial<z.infer<typeof boulderInput>>) {
  const userId = await getUserId()
  const data = boulderInput.partial().parse(raw)
  const [row] = await db
    .update(boulders)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.mountainId !== undefined && { mountainId: data.mountainId }),
      ...(data.status !== undefined && { status: data.status as StructureStatus }),
      updatedAt: new Date(),
    })
    .where(and(eq(boulders.id, id), eq(boulders.userId, userId)))
    .returning()
  revalidate()
  return row
}

export async function archiveBoulder(id: number) {
  const userId = await getUserId()
  await db
    .update(boulders)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(boulders.id, id), eq(boulders.userId, userId)))
  await db.update(tasks).set({ boulderId: null }).where(and(eq(tasks.boulderId, id), eq(tasks.userId, userId)))
  revalidate()
}
