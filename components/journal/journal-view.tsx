'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Archive, ChevronDown, Download, Heart, NotebookPen, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import type {
  DailyJournalBody,
  JournalEntry,
  JournalType,
  RelationshipJournalBody,
} from '@/lib/db/schema'
import {
  archiveJournalEntry,
  createJournalEntry,
  saveJournalEntry,
} from '@/app/actions/journal'
import {
  JOURNAL_TABS,
  emptyDailyBody,
  emptyRelationshipBody,
  formatEntryDate,
} from '@/lib/journal'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ListEditor } from './list-editor'

type Tab = JournalType

export function JournalView({ entries }: { entries: JournalEntry[] }) {
  const [tab, setTab] = useState<Tab>('daily')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  const byType = useMemo(() => entries.filter((e) => e.type === tab), [entries, tab])

  // Fall back to the most recent entry of the active tab when nothing is picked.
  const selected =
    byType.find((e) => e.id === selectedId) ?? (byType.length > 0 ? byType[0] : null)

  const addEntry = () =>
    startTransition(async () => {
      const row = await createJournalEntry(tab)
      if (row) setSelectedId(row.id)
      toast(tab === 'daily' ? 'New daily entry' : 'New reflection')
    })

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex w-fit items-center gap-1 rounded-md border bg-card p-0.5">
          {JOURNAL_TABS.map((t) => (
            <Button
              key={t.value}
              variant={tab === t.value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => {
                setTab(t.value)
                setSelectedId(null)
              }}
              aria-pressed={tab === t.value}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {byType.length > 0 && (
            <EntryPicker
              entries={byType}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
            />
          )}
          {tab === 'relationship' && (
            <a
              href="/api/journal/export"
              download="relationship-reflections.txt"
              className={cn(buttonVariants({ variant: 'outline' }), 'shrink-0 whitespace-nowrap')}
            >
              <Download className="size-4" /> Download .txt
            </a>
          )}
          <Button onClick={addEntry} disabled={pending} className="shrink-0 whitespace-nowrap">
            <Plus className="size-4" /> {tab === 'daily' ? 'New daily entry' : 'New reflection'}
          </Button>
        </div>
      </div>

      {byType.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        selected && (
          <div className="min-w-0">
            {selected.type === 'daily' ? (
              <DailyEditor key={selected.id} entry={selected} />
            ) : (
              <RelationshipEditor key={selected.id} entry={selected} />
            )}
          </div>
        )
      )}
    </div>
  )
}

function EmptyState({ tab }: { tab: Tab }) {
  const Icon = tab === 'daily' ? NotebookPen : Heart
  return (
    <div className="rounded-lg border border-dashed bg-card p-12 text-center">
      <Icon className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground text-pretty">
        {tab === 'daily'
          ? 'No daily entries yet. Start one to reflect on how today went.'
          : 'No relationship reflections yet. Capture what went well and what went bad.'}
      </p>
    </div>
  )
}

const entryLabel = (entry: JournalEntry) =>
  entry.type === 'relationship'
    ? entry.title?.trim() || 'Untitled reflection'
    : entry.summary?.trim() || 'No summary'

/** A searchable entry picker: click to open a type-to-filter list of dates
 *  and summaries, so it stays usable once there are many entries. */
function EntryPicker({
  entries,
  selectedId,
  onSelect,
}: {
  entries: JournalEntry[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const value = selectedId ?? entries[0]?.id
  const current = entries.find((e) => e.id === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) =>
      `${formatEntryDate(e.entryDate)} ${entryLabel(e)}`.toLowerCase().includes(q),
    )
  }, [entries, query])

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 w-[min(20rem,60vw)] items-center gap-2 rounded-md border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {current ? (
            <>
              <span className="font-mono text-xs text-muted-foreground">
                {formatEntryDate(current.entryDate)}
              </span>
              {' — '}
              {entryLabel(current)}
            </>
          ) : (
            'Choose entry'
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-[min(24rem,90vw)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search entries…"
              aria-label="Search entries"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div role="listbox" className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">No matches</p>
            ) : (
              filtered.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  aria-selected={entry.id === value}
                  onClick={() => {
                    onSelect(entry.id)
                    setOpen(false)
                    setQuery('')
                  }}
                  className={cn(
                    'flex w-full items-baseline gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                    entry.id === value && 'bg-accent text-accent-foreground',
                  )}
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {formatEntryDate(entry.entryDate)}
                  </span>
                  <span className="truncate">{entryLabel(entry)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ArchiveButton({ id, label }: { id: number; label: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await archiveJournalEntry(id)
          toast('Entry archived')
        })
      }
    >
      <Archive className="size-4" />
    </Button>
  )
}

function EditorShell({
  id,
  eyebrow,
  header,
  children,
}: {
  id: number
  eyebrow: string
  header: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6 rounded-lg border bg-card p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
            {eyebrow}
          </span>
          {header}
        </div>
        <ArchiveButton id={id} label="Archive entry" />
      </div>
      {children}
    </div>
  )
}

function DailyEditor({ entry }: { entry: JournalEntry }) {
  const initial = (entry.body ?? {}) as Partial<DailyJournalBody>
  const [summary, setSummary] = useState(entry.summary ?? '')
  const [body, setBody] = useState<DailyJournalBody>({ ...emptyDailyBody(), ...initial })
  const [, startTransition] = useTransition()

  const persist = (patch: { summary?: string; body?: DailyJournalBody }) =>
    startTransition(async () => {
      await saveJournalEntry(entry.id, patch)
    })

  const updateList = (key: keyof DailyJournalBody, next: string[]) => {
    const nextBody = { ...body, [key]: next }
    setBody(nextBody)
    persist({ body: nextBody })
  }

  return (
    <EditorShell
      id={entry.id}
      eyebrow={formatEntryDate(entry.entryDate)}
      header={<h2 className="text-lg font-semibold tracking-tight">Daily reflection</h2>}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`day-${entry.id}`}
            className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground"
          >
            How did the day go?
          </label>
          <Input
            id={`day-${entry.id}`}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={() => {
              if (summary !== (entry.summary ?? '')) persist({ summary })
            }}
            placeholder="One line on the day overall…"
          />
        </div>

        <ListEditor
          title="Big feelings today"
          items={body.feelings}
          onChange={(next) => updateList('feelings', next)}
          placeholder="Name a feeling…"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ListEditor
          title="What went well"
          items={body.wentWell}
          onChange={(next) => updateList('wentWell', next)}
          placeholder="A win, big or small…"
          tone="positive"
        />
        <ListEditor
          title="What didn't go well"
          items={body.wentPoorly}
          onChange={(next) => updateList('wentPoorly', next)}
          placeholder="A snag or regret…"
          tone="negative"
        />
      </div>

      <div className="flex flex-col gap-4 rounded-md border border-dashed p-4">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Lessons
        </span>
        <div className="grid gap-6 md:grid-cols-3">
          <ListEditor
            title="Short term"
            items={body.lessonsShort}
            onChange={(next) => updateList('lessonsShort', next)}
            placeholder="For this week…"
          />
          <ListEditor
            title="Medium term"
            items={body.lessonsMedium}
            onChange={(next) => updateList('lessonsMedium', next)}
            placeholder="For this season…"
          />
          <ListEditor
            title="Long term"
            items={body.lessonsLong}
            onChange={(next) => updateList('lessonsLong', next)}
            placeholder="For life…"
          />
        </div>
      </div>
    </EditorShell>
  )
}

function RelationshipEditor({ entry }: { entry: JournalEntry }) {
  const initial = (entry.body ?? {}) as Partial<RelationshipJournalBody>
  const [title, setTitle] = useState(entry.title ?? '')
  const [body, setBody] = useState<RelationshipJournalBody>({
    ...emptyRelationshipBody(),
    ...initial,
  })
  const [, startTransition] = useTransition()

  const persist = (patch: { title?: string; body?: RelationshipJournalBody }) =>
    startTransition(async () => {
      await saveJournalEntry(entry.id, patch)
    })

  const updateList = (
    key:
      | 'wentWell'
      | 'wentBad'
      | 'canAccept'
      | 'cannotAccept'
      | 'canImprove'
      | 'didWell'
      | 'learned',
    next: string[],
  ) => {
    const nextBody = { ...body, [key]: next }
    setBody(nextBody)
    persist({ body: nextBody })
  }

  return (
    <EditorShell
      id={entry.id}
      eyebrow={formatEntryDate(entry.entryDate)}
      header={
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== (entry.title ?? '')) persist({ title })
          }}
          placeholder="Who or what is this about?"
          className="h-auto border-0 bg-transparent p-0 text-lg font-semibold tracking-tight shadow-none focus-visible:ring-0"
        />
      }
    >
      {/* Wide layout: all six lists share the full width in an even grid now
          that there is no details pane pulling focus to one side. */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <ListEditor
          title="What went well"
          items={body.wentWell}
          onChange={(next) => updateList('wentWell', next)}
          placeholder="A good moment…"
          tone="positive"
        />
        <ListEditor
          title="What went bad"
          items={body.wentBad}
          onChange={(next) => updateList('wentBad', next)}
          placeholder="A hard moment…"
          tone="negative"
        />
        <ListEditor
          title="What I did well"
          items={body.didWell}
          onChange={(next) => updateList('didWell', next)}
          placeholder="Something I handled right…"
          tone="positive"
        />
        <ListEditor
          title="What I can accept about her"
          items={body.canAccept}
          onChange={(next) => updateList('canAccept', next)}
          placeholder="Something to make peace with…"
          tone="positive"
        />
        <ListEditor
          title="What I can't accept about her"
          items={body.cannotAccept}
          onChange={(next) => updateList('cannotAccept', next)}
          placeholder="A real boundary or dealbreaker…"
          tone="negative"
        />
        <ListEditor
          title="What I can improve"
          items={body.canImprove}
          onChange={(next) => updateList('canImprove', next)}
          placeholder="Something on me to work on…"
        />
        <ListEditor
          title="What did I learn"
          items={body.learned}
          onChange={(next) => updateList('learned', next)}
          placeholder="An insight to carry forward…"
        />
      </div>
    </EditorShell>
  )
}
