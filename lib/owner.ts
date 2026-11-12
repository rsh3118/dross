import { count } from 'drizzle-orm'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'

export async function hubHasOwner() {
  const [{ value }] = await db.select({ value: count() }).from(user)
  return value > 0
}
