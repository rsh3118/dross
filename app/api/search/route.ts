import { and, eq, ilike, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tasks, wikiPages } from '@/lib/db/schema'
import { getSession } from '@/lib/session'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 80) ?? ''
  if (q.length < 2) return NextResponse.json({ tasks: [], pages: [] })
  const pattern = `%${q}%`
  const userId = session.user.id

  const [taskRows, pageRows] = await Promise.all([
    db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.archivedAt), ilike(tasks.title, pattern)))
      .limit(6),
    db
      .select({ id: wikiPages.id, slug: wikiPages.slug, title: wikiPages.title })
      .from(wikiPages)
      .where(and(eq(wikiPages.userId, userId), isNull(wikiPages.archivedAt), ilike(wikiPages.title, pattern)))
      .limit(6),
  ])

  return NextResponse.json({ tasks: taskRows, pages: pageRows })
}
