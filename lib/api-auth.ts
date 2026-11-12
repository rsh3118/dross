import { createHash, randomBytes } from 'node:crypto'
import { eq, and, isNull } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { verifyOAuthToken } from '@/lib/mcp-oauth'
import { apiKeys } from '@/lib/db/schema'

const hashKey = (value: string) => createHash('sha256').update(value).digest('hex')

export function createApiKeyValue() {
  const secret = `dross_${randomBytes(32).toString('base64url')}`
  return { secret, hash: hashKey(secret), prefix: secret.slice(0, 14) }
}

export async function requireApiUser(request?: Request) {
  const requestHeaders = request ? new Headers(request.headers) : await headers()
  const bearer = requestHeaders.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (bearer) {
    const oauth = verifyOAuthToken(bearer)
    if (oauth?.typ === 'mcp_access' && typeof oauth.sub === 'string') return { id: oauth.sub }
    const [key] = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, hashKey(bearer)), isNull(apiKeys.revokedAt))).limit(1)
    if (key) {
      await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id))
      return { id: key.userId }
    }
  }
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session?.user) throw new Response('Unauthorized', { status: 401 })
  return session.user
}
