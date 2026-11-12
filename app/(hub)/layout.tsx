import { and, count, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { capturedTasks, notifications, proposals } from '@/lib/db/schema'
import { requireUser } from '@/lib/session'
import { AppShell } from '@/components/shell/app-shell'

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  const [[p], [n], [c]] = await Promise.all([
    db
      .select({ value: count() })
      .from(proposals)
      .where(and(eq(proposals.userId, user.id), eq(proposals.status, 'pending'))),
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
    db
      .select({ value: count() })
      .from(capturedTasks)
      .where(and(eq(capturedTasks.userId, user.id), eq(capturedTasks.status, 'pending'))),
  ])

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      counts={{ proposals: p.value, notifications: n.value, captured: c.value }}
    >
      {children}
    </AppShell>
  )
}
