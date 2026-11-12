import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agentRuns, newsletters, notifications, proposals, tasks, wikiPages } from '@/lib/db/schema'

export async function getDashboard(userId: string) {
  const [openTasks, recentPages, runs, pendingProposals, unread, latestNewsletter] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          isNull(tasks.archivedAt),
          ne(tasks.status, 'done'),
          ne(tasks.status, 'skipped'),
        ),
      )
      .orderBy(asc(tasks.dueAt)),
    db
      .select({
        id: wikiPages.id,
        slug: wikiPages.slug,
        title: wikiPages.title,
        status: wikiPages.status,
        authoredBy: wikiPages.authoredBy,
        updatedAt: wikiPages.updatedAt,
      })
      .from(wikiPages)
      .where(and(eq(wikiPages.userId, userId), isNull(wikiPages.archivedAt)))
      .orderBy(desc(wikiPages.updatedAt))
      .limit(6),
    db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.userId, userId))
      .orderBy(desc(agentRuns.startedAt))
      .limit(6),
    db
      .select()
      .from(proposals)
      .where(and(eq(proposals.userId, userId), eq(proposals.status, 'pending')))
      .orderBy(desc(proposals.createdAt))
      .limit(4),
    db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .orderBy(desc(notifications.createdAt))
      .limit(5),
    db
      .select({ id: newsletters.id, title: newsletters.title, createdAt: newsletters.createdAt })
      .from(newsletters)
      .where(eq(newsletters.userId, userId))
      .orderBy(desc(newsletters.createdAt))
      .limit(1),
  ])

  return {
    openTasks,
    recentPages,
    runs,
    pendingProposals,
    unread,
    latestNewsletter: latestNewsletter[0] ?? null,
  }
}
