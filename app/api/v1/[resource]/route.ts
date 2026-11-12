import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agentRuns, boulders, interests, mountains, newsletters, notifications, proposals, tasks, wikiLinks, wikiPages, wikiRevisions } from '@/lib/db/schema'
import { requireApiUser } from '@/lib/api-auth'

const resources = { tasks, wikiPages, wikiRevisions, wikiLinks, mountains, boulders, interests, agentRuns, proposals, newsletters, notifications } as const

export async function GET(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  const user = await requireApiUser(request)
  const { resource } = await params
  const table = resources[resource as keyof typeof resources]
  if (!table) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 })
  const rows = await db.select().from(table).where(eq(table.userId, user.id))
  return NextResponse.json({ data: rows })
}
