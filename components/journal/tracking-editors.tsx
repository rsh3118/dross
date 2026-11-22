'use client'

import { Plus, X } from 'lucide-react'
import type { JournalInteraction, JournalTimeSpent } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type TrackingEditorsProps = {
  interactions: JournalInteraction[]
  timeSpent: JournalTimeSpent[]
  onInteractionsChange: (next: JournalInteraction[]) => void
  onTimeSpentChange: (next: JournalTimeSpent[]) => void
}

export function TrackingEditors({
  interactions,
  timeSpent,
  onInteractionsChange,
  onTimeSpentChange,
}: TrackingEditorsProps) {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="interactions-heading" className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="interactions-heading" className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Interactions
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">People you connected with and how it felt.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onInteractionsChange([...interactions, { person: '', interaction: '', feelings: '' }])}>
            <Plus data-icon="inline-start" /> Add person
          </Button>
        </div>
        {interactions.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">No interactions added yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {interactions.map((item, index) => (
              <fieldset key={index} className="flex flex-col gap-3 rounded-md border bg-card p-3">
                <legend className="sr-only">Interaction {index + 1}</legend>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Person {index + 1}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove interaction ${index + 1}`} onClick={() => onInteractionsChange(interactions.filter((_, i) => i !== index))}>
                    <X />
                  </Button>
                </div>
                <Input aria-label="Person" value={item.person} onChange={(event) => onInteractionsChange(interactions.map((record, i) => i === index ? { ...record, person: event.target.value } : record))} placeholder="Who did you interact with?" />
                <Input aria-label="Interaction" value={item.interaction} onChange={(event) => onInteractionsChange(interactions.map((record, i) => i === index ? { ...record, interaction: event.target.value } : record))} placeholder="What did you do together?" />
                <Input aria-label="How you felt" value={item.feelings} onChange={(event) => onInteractionsChange(interactions.map((record, i) => i === index ? { ...record, feelings: event.target.value } : record))} placeholder="How did you feel?" />
              </fieldset>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="activity-heading" className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="activity-heading" className="font-mono text-[11px] uppercase tracking-widest text-primary">
              Activity
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">What you did, how long, and how it felt.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onTimeSpentChange([...timeSpent, { activity: '', duration: '', feelings: '', notes: '' }])}>
            <Plus data-icon="inline-start" /> Add activity
          </Button>
        </div>
        {timeSpent.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">No activities added yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {timeSpent.map((item, index) => (
              <fieldset key={index} className="flex flex-col gap-3 rounded-md border bg-card p-3">
                <legend className="sr-only">Time spent {index + 1}</legend>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Activity {index + 1}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove activity ${index + 1}`} onClick={() => onTimeSpentChange(timeSpent.filter((_, i) => i !== index))}>
                    <X />
                  </Button>
                </div>
                <Input aria-label="Activity or category" value={item.activity} onChange={(event) => onTimeSpentChange(timeSpent.map((record, i) => i === index ? { ...record, activity: event.target.value } : record))} placeholder="What did you do?" />
                <Input aria-label="Time spent (optional)" value={item.duration ?? (item.minutes ? `${item.minutes} min` : '')} onChange={(event) => onTimeSpentChange(timeSpent.map((record, i) => i === index ? { ...record, duration: event.target.value, minutes: undefined } : record))} placeholder="30 min, 1 hour, or a short note" maxLength={80} />
                <Input aria-label="How you felt about the time" value={item.feelings} onChange={(event) => onTimeSpentChange(timeSpent.map((record, i) => i === index ? { ...record, feelings: event.target.value } : record))} placeholder="How did that time feel?" />
                <Input aria-label="Notes about this activity" value={item.notes} onChange={(event) => onTimeSpentChange(timeSpent.map((record, i) => i === index ? { ...record, notes: event.target.value } : record))} placeholder="Notes (optional)" />
              </fieldset>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
