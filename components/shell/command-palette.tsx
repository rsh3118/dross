'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowRight, BookOpen, CheckSquare, CornerDownLeft } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { NAV } from '@/components/shell/sidebar'
import { cn } from '@/lib/utils'

type SearchResult = {
  tasks: { id: number; title: string; status: string }[]
  pages: { id: number; slug: string; title: string }[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<SearchResult>)

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)

  const { data } = useSWR(
    open && query.trim().length > 1 ? `/api/search?q=${encodeURIComponent(query.trim())}` : null,
    fetcher,
    { keepPreviousData: true },
  )

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const nav = NAV.filter((n) => !q || n.label.toLowerCase().includes(q)).map((n) => ({
      id: `nav-${n.href}`,
      kind: 'nav' as const,
      label: n.label,
      hint: n.key,
      href: n.href,
    }))
    const tasks = (data?.tasks ?? []).map((t) => ({
      id: `task-${t.id}`,
      kind: 'task' as const,
      label: t.title,
      hint: t.status,
      href: `/tasks?open=${t.id}`,
    }))
    const pages = (data?.pages ?? []).map((p) => ({
      id: `page-${p.id}`,
      kind: 'page' as const,
      label: p.title,
      hint: p.slug,
      href: `/wiki/${p.slug}`,
    }))
    return [...tasks, ...pages, ...nav]
  }, [query, data])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setIndex(0)
    }
  }, [open])

  useEffect(() => setIndex(0), [query])

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden" showCloseButton={false}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(i + 1, items.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && items[index]) {
              e.preventDefault()
              go(items[index].href)
            }
          }}
          placeholder="Search tasks, wiki, or jump to a page…"
          className="w-full bg-transparent px-4 py-3.5 text-sm outline-none border-b placeholder:text-muted-foreground"
          aria-label="Search"
        />
        <ul className="max-h-80 overflow-y-auto p-1.5 scrollbar-thin" role="listbox">
          {items.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</li>
          )}
          {items.map((item, i) => (
            <li key={item.id} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(item.href)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-left',
                  i === index ? 'bg-accent text-accent-foreground' : 'text-foreground',
                )}
              >
                {item.kind === 'task' ? (
                  <CheckSquare className="size-4 text-muted-foreground" />
                ) : item.kind === 'page' ? (
                  <BookOpen className="size-4 text-muted-foreground" />
                ) : (
                  <ArrowRight className="size-4 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">{item.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{item.hint}</span>
                {i === index && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
