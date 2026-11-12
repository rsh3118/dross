import { desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { amazonImportJobs, amazonPurchases } from '@/lib/db/schema'
import { headers } from 'next/headers'

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const jobId = crypto.randomUUID()
    await db.insert(amazonImportJobs).values({ id: jobId, userId: session.user.id, status: 'queued' })
    const { start } = await import('workflow/api')
    const { amazonImportWorkflow } = await import('@/workflows/amazon-import')
    const run = await start(amazonImportWorkflow, [session.user.id, jobId])
    return NextResponse.json({ runId: run.runId, jobId, status: 'started' }, { status: 202 })
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    console.error('[v0] Could not start Amazon import workflow', { detail, error })
    return NextResponse.json({ error: 'Could not start import', detail }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const latestJob = await db.select().from(amazonImportJobs).where(eq(amazonImportJobs.userId, session.user.id)).orderBy(desc(amazonImportJobs.updatedAt)).limit(1)
  if (new URL(request.url).searchParams.get('progress') === 'true') return NextResponse.json(latestJob[0] ?? null)
  const searchParams = new URL(request.url).searchParams
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const pageSize = Math.min(50, Math.max(10, Number(searchParams.get('pageSize') ?? '25')))
  const offset = (page - 1) * pageSize
  const rows = await db
    .select()
    .from(amazonPurchases)
    .where(eq(amazonPurchases.userId, session.user.id))
    .orderBy(desc(amazonPurchases.receivedAt))
    .limit(pageSize)
    .offset(offset)
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(amazonPurchases).where(eq(amazonPurchases.userId, session.user.id))
  return NextResponse.json({ rows, total: Number(count), page, pageSize })
}

