'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Bot } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Row = {
  id: number
  slug: string
  title: string
  summary: string | null
  status: string
  tags: string[]
  authoredBy: string
  updatedAt: Date
}

export function WikiIndex({ pages }: { pages: Row[] }) {
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of pages) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  }, [pages])

  const filtered = pages.filter((p) => {
    if (tag && !p.tags.includes(tag)) return false
    if (!q) return true
    const s = q.toLowerCase()
    return p.title.toLowerCase().includes(s) || (p.summary ?? '').toLowerCase().includes(s)
  })

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter pages…"
        className="max-w-sm bg-card"
        aria-label="Filter pages"
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(([t, n]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(tag === t ? null : t)}
              className={cn(
                'font-mono text-xs rounded-sm border px-2 py-0.5 transition-colors',
                tag === t ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted',
              )}
            >
              #{t} <span className="opacity-60">{n}</span>
            </button>
          ))}
        </div>
      )}
      <ul className="rounded-lg border bg-card divide-y">
        {filtered.length === 0 && (
          <li className="p-10 text-center text-sm text-muted-foreground">
            {pages.length === 0 ? 'No pages yet. Create one, or hand a task to the research agent.' : 'No matches.'}
          </li>
        )}
        {filtered.map((p) => (
          <li key={p.id}>
            <Link href={`/wiki/${p.slug}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/40">
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{p.title}</span>
                {p.status === 'draft' && (
                  <span className="font-mono text-[10px] uppercase text-warning">draft</span>
                )}
                {p.authoredBy !== 'user' && <Bot className="size-3.5 text-primary" aria-label="Agent authored" />}
                <span className="ml-auto font-mono text-[11px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(p.updatedAt, { addSuffix: true })}
                </span>
              </span>
              {p.summary && <span className="text-sm text-muted-foreground line-clamp-1">{p.summary}</span>}
              {p.tags.length > 0 && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {p.tags.map((t) => `#${t}`).join('  ')}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
