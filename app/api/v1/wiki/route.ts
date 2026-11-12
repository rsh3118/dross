import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { wikiPages } from '@/lib/db/schema'
import { requireApiUser } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await requireApiUser(request)
  const rows = await db.select().from(wikiPages).where(eq(wikiPages.userId, user.id)).orderBy(desc(wikiPages.updatedAt))
  return NextResponse.json({ data: rows })
}

export async function POST(request: Request) {
  const user = await requireApiUser(request)
  const body = await request.json()
  if (typeof body.slug !== 'string' || typeof body.title !== 'string') return NextResponse.json({ error: 'slug and title are required' }, { status: 400 })
  const [row] = await db.insert(wikiPages).values({ userId: user.id, slug: body.slug, title: body.title, content: body.content ?? '', summary: body.summary ?? null, status: body.status ?? 'draft', tags: body.tags ?? [], sources: body.sources ?? [] }).returning()
  return NextResponse.json({ data: row }, { status: 201 })
}

export async function PATCH(request: Request) {
  const user = await requireApiUser(request)
  const body = await request.json()
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { id, ...changes } = body
  const [row] = await db.update(wikiPages).set({ ...changes, updatedAt: new Date() }).where(and(eq(wikiPages.id, id), eq(wikiPages.userId, user.id))).returning()
  if (!row) return NextResponse.json({ error: 'Wiki page not found' }, { status: 404 })
  return NextResponse.json({ data: row })
}
