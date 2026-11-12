import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'

/** Rooms a device can report. Kept small and known so labels stay clean. */
export const ROOMS = [
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'living-room', label: 'Living room' },
] as const

export type RoomValue = (typeof ROOMS)[number]['value']

export function roomLabel(room: string) {
  return ROOMS.find((r) => r.value === room)?.label ?? room
}

/**
 * The recorder token authenticates an unattended room device. It is stored per
 * user in settings and generated on first use. We compare against a sha256 of
 * the presented token in constant time.
 */
export async function getOrCreateRecorderToken(userId: string): Promise<string> {
  const [row] = await db.select().from(settings).where(eq(settings.userId, userId))
  if (row?.recorderToken) return row.recorderToken
  const token = randomBytes(24).toString('base64url')
  await db
    .insert(settings)
    .values({ userId, recorderToken: token })
    .onConflictDoUpdate({ target: settings.userId, set: { recorderToken: token } })
  return token
}

/** Resolve a presented recorder token to its owner, or null. */
export async function userIdForRecorderToken(token: string): Promise<string | null> {
  if (!token) return null
  const [row] = await db.select().from(settings).where(eq(settings.recorderToken, token))
  if (!row) return null
  // constant-time compare to avoid leaking via timing on the indexed lookup
  const a = createHash('sha256').update(token).digest()
  const b = createHash('sha256').update(row.recorderToken ?? '').digest()
  return a.length === b.length && timingSafeEqual(a, b) ? row.userId : null
}

// ---------- Signed email-action tokens ----------
// Approve/dismiss links in the digest email carry an HMAC so a GET can act
// without a session. Scoped to user + action + recording, no expiry needed
// because actions are idempotent and low-risk.
function actionSecret() {
  return process.env.BETTER_AUTH_SECRET ?? process.env.CRON_SECRET ?? 'dev-secret'
}

export function signAction(userId: string, action: string, scope: string) {
  const payload = `${userId}:${action}:${scope}`
  const sig = createHmac('sha256', actionSecret()).update(payload).digest('base64url')
  return sig
}

export function verifyAction(userId: string, action: string, scope: string, sig: string) {
  const expected = signAction(userId, action, scope)
  const a = Buffer.from(expected)
  const b = Buffer.from(sig ?? '')
  return a.length === b.length && timingSafeEqual(a, b)
}
