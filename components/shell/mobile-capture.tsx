'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createTask } from '@/app/actions/tasks'
import { parseQuickAdd } from '@/lib/tasks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

// Always-available capture on mobile: a single field with token parsing so a
// stone can be logged in two taps without navigating to Tasks first.
export function MobileCapture() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [today, setToday] = useState(false)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    const parsed = parseQuickAdd(value)
    if (!parsed.title) return
    startTransition(async () => {
      try {
        await createTask({
          title: parsed.title,
          tags: parsed.tags,
          priority: parsed.priority,
          type: parsed.type,
          dueAt: parsed.dueAt ?? null,
          today: parsed.today || today,
          thisWeek: parsed.thisWeek,
          isResearch: parsed.research,
        })
        setValue('')
        setToday(false)
        setOpen(false)
        if (parsed.research) toast('Research agent queued', { description: parsed.title })
        else toast('Stone added')
        router.refresh()
      } catch (e) {
        toast.error('Could not add task')
        console.error(e)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick add task"
        className="fixed right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 active:scale-95 transition-transform md:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.5rem)' }}
      >
        <Plus className="size-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl p-0"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <SheetHeader className="px-5 pt-3 pb-1">
            <SheetTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Add a stone
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-5 pb-5 pt-2">
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === 'Enter') submit()
              }}
              disabled={pending}
              placeholder="Renew passport  !necessary ~errand @fri #admin"
              className="h-11"
              aria-label="Task title"
            />
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5">
              <Label htmlFor="capture-today" className="cursor-pointer">
                Put on today
              </Label>
              <Switch id="capture-today" checked={today} onCheckedChange={setToday} />
            </div>
            <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
              tokens: #tag · !urgent/!necessary/!important · ~errand/~focus/~deep · @tomorrow · *today ·
              ?research
            </p>
            <Button onClick={submit} disabled={pending || !value.trim()} className="h-11">
              Add stone
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
