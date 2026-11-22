'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, Plus, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createDossierHistory,
  createDossierReflection,
  deleteDossierHistory,
  deleteDossierReflection,
  saveDossierPerson,
} from '@/app/actions/dosier'
import type { DossierComment, DossierHistoryRecord, DossierPerson, DossierReflection } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  person: DossierPerson
  history: DossierHistoryRecord[]
  reflections: DossierReflection[]
  comments: DossierComment[]
}

const formatDate = (date: Date | string | null) => {
  if (!date) return 'Date not set'
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatTimestamp = (date: Date | string) =>
  new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function DosierProfile({ person, history, reflections, comments }: Props) {
  const [name, setName] = useState(person.name)
  const [importance, setImportance] = useState(person.importance)
  const [relationshipLevel, setRelationshipLevel] = useState(person.relationshipLevel)
  const [historyTitle, setHistoryTitle] = useState('')
  const [historyContent, setHistoryContent] = useState('')
  const [occurredOn, setOccurredOn] = useState('')
  const [reflectionContent, setReflectionContent] = useState('')
  const [actor, setActor] = useState<'me' | 'ai'>('me')
  const [pending, startTransition] = useTransition()

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      try {
        await saveDossierPerson(person.id, { name, importance, relationshipLevel })
        toast('Dosier updated')
      } catch {
        toast.error('Could not save Dosier')
      }
    })
  }

  const addHistory = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      try {
        await createDossierHistory({ personId: person.id, title: historyTitle, content: historyContent, occurredOn })
        setHistoryTitle('')
        setHistoryContent('')
        setOccurredOn('')
        toast('History record added')
      } catch {
        toast.error('Could not add history record')
      }
    })
  }

  const addReflection = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      try {
        await createDossierReflection({ personId: person.id, content: reflectionContent, actor })
        setReflectionContent('')
        toast('Reflection added')
      } catch {
        toast.error('Could not add reflection')
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dosier" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> All people
      </Link>

      <form onSubmit={saveProfile} className="flex flex-col gap-5 rounded-lg border bg-card p-4 md:p-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="person-name" className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Person</label>
          <Input id="person-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="relationship-importance" className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Relationship importance</label>
            <Textarea id="relationship-importance" value={importance} onChange={(event) => setImportance(event.target.value)} maxLength={500} placeholder="Why does this relationship matter to you?" />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="relationship-level" className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Relationship level</label>
            <Textarea id="relationship-level" value={relationshipLevel} onChange={(event) => setRelationshipLevel(event.target.value)} maxLength={500} placeholder="How would you describe where things stand?" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>Save details</Button>
        </div>
      </form>

      <section aria-labelledby="comments-heading" className="dross-sheen flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="dross-spin size-4 text-primary" aria-hidden="true" />
            <h2 id="comments-heading" className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Change comments</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Every Dosier change is captured with its author and exact time.</p>
        </div>
        {comments.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {comments.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 rounded-md border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{item.actor === 'ai' ? 'AI' : 'You'} · {item.action}</span>
                  <time dateTime={new Date(item.createdAt).toISOString()}>{formatTimestamp(item.createdAt)}</time>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.comment}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6">
        <div>
          <h2 id="history-heading" className="font-mono text-xs uppercase tracking-widest text-muted-foreground">History</h2>
          <p className="mt-1 text-sm text-muted-foreground">Important events and moments in this relationship.</p>
        </div>

        {history.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm leading-relaxed text-muted-foreground">
            No history records yet. Records can be added here now; journal-based AI history can be connected later.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {history.map((record) => (
              <li key={record.id} className="flex flex-col gap-2 rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{record.title || 'History record'}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="size-3.5" aria-hidden="true" /> {formatDate(record.occurredAt)}
                      <span aria-hidden="true">·</span>
                      {record.sourceType === 'ai' ? 'AI' : record.sourceType === 'journal' ? 'Journal' : 'Added by you'}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove history record" disabled={pending} onClick={() => startTransition(async () => {
                    try { await deleteDossierHistory(record.id, person.id) } catch { toast.error('Could not remove history record') }
                  })}>
                    <Trash2 />
                  </Button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{record.content}</p>
              </li>
            ))}
          </ol>
        )}

        <form onSubmit={addHistory} className="flex flex-col gap-3 rounded-md border border-dashed p-4">
          <h3 className="text-sm font-medium">Add a history record</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input aria-label="Record title (optional)" value={historyTitle} onChange={(event) => setHistoryTitle(event.target.value)} placeholder="Title (optional)" maxLength={200} />
            <Input aria-label="Date of event (optional)" type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} />
          </div>
          <Textarea aria-label="History record" value={historyContent} onChange={(event) => setHistoryContent(event.target.value)} placeholder="What happened?" maxLength={12000} required />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!historyContent.trim() || pending}>
              <Plus data-icon="inline-start" /> Add record
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="reflections-heading" className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6">
        <div>
          <h2 id="reflections-heading" className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Relationship reflections</h2>
          <p className="mt-1 text-sm text-muted-foreground">Notes about how you understand this relationship.</p>
        </div>

        {reflections.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No reflections yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {reflections.map((reflection) => (
              <li key={reflection.id} className="flex flex-col gap-2 rounded-md border p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                    {reflection.actor === 'ai' ? 'AI reflection' : 'Your reflection'} · {formatDate(reflection.createdAt)}
                  </span>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove reflection" disabled={pending} onClick={() => startTransition(async () => {
                    try { await deleteDossierReflection(reflection.id, person.id) } catch { toast.error('Could not remove reflection') }
                  })}>
                    <Trash2 />
                  </Button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{reflection.content}</p>
              </li>
            ))}
          </ol>
        )}

        <form onSubmit={addReflection} className="flex flex-col gap-3 rounded-md border border-dashed p-4">
          <h3 className="text-sm font-medium">Add a reflection</h3>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reflection-actor" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Written by</label>
            <select id="reflection-actor" value={actor} onChange={(event) => setActor(event.target.value as 'me' | 'ai')} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-56">
              <option value="me">Me</option>
              <option value="ai">AI</option>
            </select>
          </div>
          <Textarea aria-label="Reflection" value={reflectionContent} onChange={(event) => setReflectionContent(event.target.value)} placeholder="Write a reflection…" maxLength={12000} required />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!reflectionContent.trim() || pending}>
              <Plus data-icon="inline-start" /> Add reflection
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
