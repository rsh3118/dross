import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { format } from 'date-fns'
import { Mail } from 'lucide-react'
import { db } from '@/lib/db'
import { newsletters } from '@/lib/db/schema'
import { getUserId } from '@/lib/session'
import { PageHeader } from '@/components/shell/page-header'
import { RunNowButton } from '@/components/agents/run-now-button'

export const metadata = { title: 'Newsletter' }

export default async function NewsletterPage() {
  const userId = await getUserId()
  const issues = await db
    .select({
      id: newsletters.id,
      title: newsletters.title,
      sentAt: newsletters.sentAt,
      createdAt: newsletters.createdAt,
    })
    .from(newsletters)
    .where(eq(newsletters.userId, userId))
    .orderBy(desc(newsletters.createdAt))

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        eyebrow="newsletter"
        title="Your weekly briefing"
        description="Interests × the web × your hub, written for one reader. Delivered by email and archived here."
        actions={<RunNowButton agent="newsletter" label="Write one now" />}
      />
      <ul className="rounded-lg border bg-card divide-y">
        {issues.length === 0 && (
          <li className="p-10 text-center text-sm text-muted-foreground">
            No issues yet. Add interests in Settings, then write one now or wait for the weekly run.
          </li>
        )}
        {issues.map((n) => (
          <li key={n.id}>
            <Link href={`/newsletter/${n.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
              <Mail className={n.sentAt ? 'size-4 text-primary' : 'size-4 text-muted-foreground'} />
              <span className="text-sm font-medium flex-1 truncate">{n.title}</span>
              <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                {format(n.createdAt, 'yyyy-MM-dd')}
                {n.sentAt ? ' · emailed' : ' · archived only'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
