'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ContactRound, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createDossierPerson } from '@/app/actions/dosier'
import type { DossierPerson } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function DosierDirectory({ people }: { people: DossierPerson[] }) {
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const addPerson = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    startTransition(async () => {
      try {
        const person = await createDossierPerson({ name: trimmedName, importance: '', relationshipLevel: '' })
        setName('')
        toast('Person added')
        router.push(`/dosier/${person.id}`)
        router.refresh()
      } catch {
        toast.error('Could not add this person')
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={addPerson} className="flex flex-col gap-2 rounded-lg border bg-card p-4 sm:flex-row">
        <Input
          aria-label="Person name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Add someone to your Dosier…"
          maxLength={160}
        />
        <Button type="submit" disabled={!name.trim() || pending} className="shrink-0">
          <Plus data-icon="inline-start" /> Add person
        </Button>
      </form>

      {people.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <ContactRound className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-medium">Your people, thoughtfully remembered</h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            Add a person to keep relationship context, history, and reflections together.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {people.map((person) => (
            <li key={person.id}>
              <Link
                href={`/dosier/${person.id}`}
                className="group flex h-full flex-col gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-base font-semibold">{person.name}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-3 text-sm leading-relaxed">
                  <span>
                    <span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Importance</span>
                    <span className="mt-1 line-clamp-2 text-muted-foreground">{person.importance || 'Add why this relationship matters.'}</span>
                  </span>
                  <span>
                    <span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Relationship level</span>
                    <span className="mt-1 line-clamp-2 text-muted-foreground">{person.relationshipLevel || 'Describe where things stand.'}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
