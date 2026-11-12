import { NextResponse } from 'next/server'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { createApiKeyValue, requireApiUser } from '@/lib/api-auth'

export async function GET(request: Request) {
  const user = await requireApiUser(request)
  const rows = await db.select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.keyPrefix, lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt }).from(apiKeys).where(and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt))).orderBy(desc(apiKeys.createdAt))
  return NextResponse.json({ data: rows })
}

export async function POST(request: Request) {
  const user = await requireApiUser(request)
  const body = await request.json().catch(() => ({}))
  const { secret, hash, prefix } = createApiKeyValue()
  const [row] = await db.insert(apiKeys).values({ userId: user.id, name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Dross API key', keyHash: hash, keyPrefix: prefix }).returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.keyPrefix, createdAt: apiKeys.createdAt })
  return NextResponse.json({ data: { ...row, secret, warning: 'Save this secret now. It will not be shown again.' } }, { status: 201 })
}

export async function DELETE(request: Request) {
  const user = await requireApiUser(request)
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
  return new NextResponse(null, { status: 204 })
}
