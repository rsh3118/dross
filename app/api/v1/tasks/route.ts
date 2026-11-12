import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks } from '@/lib/db/schema'
import { requireApiUser } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await requireApiUser(request)
  const rows = await db.select().from(tasks).where(eq(tasks.userId, user.id)).orderBy(desc(tasks.updatedAt))
  return NextResponse.json({ data: rows })
}

export async function POST(request: Request) {
  const user = await requireApiUser(request)
  const body = await request.json()
  if (typeof body.title !== 'string' || !body.title.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 })
  const [row] = await db.insert(tasks).values({ userId: user.id, title: body.title.trim(), description: body.description ?? null, urgency: body.urgency ?? 'top', priority: body.priority ?? 'normal', group: body.group ?? 'work', category: body.category ?? 'project', type: body.type ?? 'task', recurrence: body.recurrence ?? 'none', topItem: body.urgency === 'top' || body.urgency === undefined, today: body.urgency === 'today', thisWeek: body.urgency === 'week' }).returning()
  return NextResponse.json({ data: row }, { status: 201 })
}

export async function PATCH(request: Request) {
  const user = await requireApiUser(request)
  const body = await request.json()
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { id, ...changes } = body
  const [row] = await db.update(tasks).set({ ...changes, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, user.id))).returning()
  if (!row) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  return NextResponse.json({ data: row })
}
