import Link from 'next/link'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { Bot, ExternalLink, Pencil } from 'lucide-react'
import { getWikiPage } from '@/app/actions/wiki'
import { Markdown } from '@/components/markdown'
import { PageActions } from '@/components/wiki/page-actions'
import { RevisionList } from '@/components/wiki/revision-list'
import { Button } from '@/components/ui/button'

export default async function WikiPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const result = await getWikiPage(slug)
  if (!result) notFound()
  const { page, backlinks, revisions } = result

  return (
    <div className="grid gap-8 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <article className="min-w-0 flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <Link href="/wiki" className="hover:text-foreground">wiki</Link>
            <span>/</span>
            <span>{page.slug}</span>
            {page.status === 'draft' && (
              <span className="ml-2 rounded-sm bg-warning/15 px-1.5 py-0.5 uppercase text-warning">draft</span>
            )}
            {page.authoredBy !== 'user' && (
              <span className="flex items-center gap-1 text-primary">
                <Bot className="size-3" /> {page.authoredBy.replace('-agent', '')}
              </span>
            )}
          </div>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">{page.title}</h1>
            <Button variant="outline" size="sm" className="shrink-0" nativeButton={false} render={<Link href={`/wiki/${page.slug}/edit`} />}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          </div>
          {page.summary && <p className="text-muted-foreground text-pretty">{page.summary}</p>}
          {page.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 font-mono text-xs text-muted-foreground">
              {page.tags.map((t) => (
                <span key={t} className="rounded-sm border px-1.5 py-0.5">#{t}</span>
              ))}
            </div>
          )}
        </header>

        {page.content.trim() ? (
          <Markdown content={page.content} />
        ) : (
          <p className="text-sm text-muted-foreground italic">This page is empty.</p>
        )}

        {page.sources.length > 0 && (
          <section className="flex flex-col gap-2 border-t pt-6">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sources</h2>
            <ol className="flex flex-col gap-1.5">
              {page.sources.map((s, i) => (
                <li key={s.url} className="flex items-start gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums w-5 shrink-0 pt-0.5">
                    {i + 1}.
                  </span>
                  <div className="min-w-0">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary"
                    >
                      {s.title}
                      <ExternalLink className="size-3" />
                    </a>
                    {s.note && <p className="text-muted-foreground">{s.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>

      <aside className="flex flex-col gap-6 lg:border-l lg:pl-6 text-sm">
        <PageActions pageId={page.id} status={page.status} />
        <section className="flex flex-col gap-1.5">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Details</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">created</dt>
            <dd className="font-mono">{format(page.createdAt, 'yyyy-MM-dd')}</dd>
            <dt className="text-muted-foreground">updated</dt>
            <dd className="font-mono">{format(page.updatedAt, 'yyyy-MM-dd HH:mm')}</dd>
            <dt className="text-muted-foreground">words</dt>
            <dd className="font-mono">{page.content.split(/\s+/).filter(Boolean).length}</dd>
          </dl>
        </section>
        <section className="flex flex-col gap-1.5">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Linked from
          </h2>
          {backlinks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing links here yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {backlinks.map((b) => (
                <li key={b.id}>
                  <Link href={`/wiki/${b.slug}`} className="text-primary hover:underline underline-offset-4">
                    {b.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <RevisionList pageId={page.id} revisions={revisions} />
      </aside>
    </div>
  )
}
