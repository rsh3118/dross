'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Archive, Mountain as MountainIcon, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Boulder, Mountain, StructureStatus, MountainArea } from '@/lib/db/schema'
import {
  archiveBoulder,
  archiveMountain,
  createBoulder,
  createMountain,
} from '@/app/actions/structure'
import { MOUNTAIN_AREAS } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type TaskLite = { id: number; boulderId: number | null; status: string }

const AREA_LABEL = Object.fromEntries(MOUNTAIN_AREAS.map((a) => [a.value, a.label]))

function counts(tasks: TaskLite[], boulderId: number) {
  const mine = tasks.filter((t) => t.boulderId === boulderId)
  const open = mine.filter((t) => t.status !== 'done' && t.status !== 'skipped').length
  return { open, total: mine.length }
}

export function StructureView({
  mountains,
  boulders,
  tasks,
}: {
  mountains: Mountain[]
  boulders: Boulder[]
  tasks: TaskLite[]
}) {
  const bouldersByMountain = useMemo(() => {
    const map = new Map<number | 'none', Boulder[]>()
    for (const b of boulders) {
      const key = b.mountainId ?? 'none'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(b)
    }
    return map
  }, [boulders])

  const unassigned = bouldersByMountain.get('none') ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <NewMountainDialog />
        <NewBoulderDialog mountains={mountains} />
      </div>

      {mountains.length === 0 && unassigned.length === 0 && (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <MountainIcon className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No mountains yet. Name a big objective, then break it into boulders.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {mountains.map((m) => (
          <MountainCard
            key={m.id}
            mountain={m}
            boulders={bouldersByMountain.get(m.id) ?? []}
            tasks={tasks}
          />
        ))}
      </div>

      {unassigned.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Boulders without a mountain
          </h2>
          <div className="rounded-lg border bg-card divide-y">
            {unassigned.map((b) => (
              <BoulderRow key={b.id} boulder={b} tasks={tasks} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function MountainCard({
  mountain,
  boulders,
  tasks,
}: {
  mountain: Mountain
  boulders: Boulder[]
  tasks: TaskLite[]
}) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider rounded-sm bg-primary/15 text-primary px-1.5 py-0.5">
              {AREA_LABEL[mountain.area] ?? mountain.area}
            </span>
            {mountain.status !== 'active' && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {mountain.status}
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold tracking-tight text-balance">{mountain.title}</h3>
          {mountain.description && (
            <p className="text-sm text-muted-foreground text-pretty line-clamp-2">{mountain.description}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Archive mountain"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await archiveMountain(mountain.id)
              toast('Mountain archived')
            })
          }
        >
          <Archive className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, Math.max(0, mountain.progress))}%` }}
          />
        </div>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {mountain.progress}%
        </span>
      </div>

      {boulders.length > 0 ? (
        <div className="rounded-md border divide-y">
          {boulders.map((b) => (
            <BoulderRow key={b.id} boulder={b} tasks={tasks} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No boulders yet.</p>
      )}
    </div>
  )
}

function BoulderRow({ boulder, tasks }: { boulder: Boulder; tasks: TaskLite[] }) {
  const [pending, startTransition] = useTransition()
  const c = counts(tasks, boulder.id)
  return (
    <div className="group flex items-center gap-3 px-3 py-2">
      <span className="size-2 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
      <Link href="/tasks" className="min-w-0 flex-1 truncate text-sm hover:text-primary">
        {boulder.title}
      </Link>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground shrink-0">
        {c.open}/{c.total}
      </span>
      <button
        type="button"
        aria-label="Archive boulder"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await archiveBoulder(boulder.id)
            toast('Boulder archived')
          })
        }
        className="shrink-0 rounded p-1 text-muted-foreground/40 opacity-0 transition-colors group-hover:opacity-100 hover:text-destructive"
      >
        <Archive className="size-3.5" />
      </button>
    </div>
  )
}

function NewMountainDialog() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<MountainArea>('other')
  const [description, setDescription] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      await createMountain({ title, area, description: description || null })
      toast('Mountain added')
      setTitle('')
      setDescription('')
      setArea('other')
      setOpen(false)
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Plus className="size-4" /> New mountain</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New mountain</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="m-title">Objective</Label>
            <Input
              id="m-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Run a sub-3 marathon"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Area</Label>
            <Select value={area} onValueChange={(v) => setArea(v as MountainArea)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOUNTAIN_AREAS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="m-desc">Why it matters</Label>
            <Textarea
              id="m-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !title.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewBoulderDialog({ mountains }: { mountains: Mountain[] }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [mountainId, setMountainId] = useState<string>('none')
  const [description, setDescription] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      await createBoulder({
        title,
        mountainId: mountainId === 'none' ? null : Number(mountainId),
        description: description || null,
      })
      toast('Boulder added')
      setTitle('')
      setDescription('')
      setMountainId('none')
      setOpen(false)
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline"><Plus className="size-4" /> New boulder</Button>}
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New boulder</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="b-title">Project</Label>
            <Input
              id="b-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Build a training plan"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Mountain</Label>
            <Select value={mountainId} onValueChange={(v) => setMountainId(v ?? 'none')}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No mountain</SelectItem>
                {mountains.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="b-desc">Notes</Label>
            <Textarea
              id="b-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !title.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
