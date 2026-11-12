import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { format } from 'date-fns'
import { db } from '@/lib/db'
import { newsletters } from '@/lib/db/schema'
import { getUserId } from '@/lib/session'
import { Markdown } from '@/components/markdown'

export default async function NewsletterIssue({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await getUserId()
  const [issue] = await db
    .select()
    .from(newsletters)
    .where(and(eq(newsletters.id, Number(id)), eq(newsletters.userId, userId)))
  if (!issue) notFound()

  return (
    <article className="flex flex-col gap-6 p-4 md:p-8 max-w-3xl">
      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <Link href="/newsletter" className="hover:text-foreground">newsletter</Link>
        <span>/</span>
        <span>{format(issue.createdAt, 'yyyy-MM-dd')}</span>
        {issue.sentAt && <span className="text-primary">· emailed</span>}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{issue.title}</h1>
      <Markdown content={issue.contentMd} />
    </article>
  )
}
