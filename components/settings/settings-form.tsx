'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { Settings } from '@/lib/db/schema'
import { saveSettings } from '@/app/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`

export function SettingsForm({ settings, emailConfigured }: { settings: Settings; emailConfigured: boolean }) {
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    timezone: settings.timezone,
    newsletterDay: settings.newsletterDay,
    newsletterHour: settings.newsletterHour,
    notifyEmail: settings.notifyEmail,
    quietStart: settings.quietStart,
    quietEnd: settings.quietEnd,
    housekeepingEnabled: settings.housekeepingEnabled,
    researchAuto: settings.researchAuto,
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const detectTz = () => set('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)

  return (
    <form
      className="flex flex-col gap-6 rounded-lg border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          try {
            await saveSettings(form)
            toast('Settings saved')
          } catch {
            toast.error('Could not save')
          }
        })
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="tz">Timezone</Label>
        <div className="flex gap-2">
          <Input id="tz" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} className="font-mono" />
          <Button type="button" variant="outline" onClick={detectTz}>Detect</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Newsletter day</Label>
          <Select value={String(form.newsletterDay)} onValueChange={(v) => set('newsletterDay', Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Newsletter hour</Label>
          <Select value={String(form.newsletterHour)} onValueChange={(v) => set('newsletterHour', Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{fmtHour(h)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Quiet hours start</Label>
          <Select value={String(form.quietStart)} onValueChange={(v) => set('quietStart', Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{fmtHour(h)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Quiet hours end</Label>
          <Select value={String(form.quietEnd)} onValueChange={(v) => set('quietEnd', Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{fmtHour(h)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col divide-y rounded-md border">
        <Toggle
          label="Email delivery"
          hint={emailConfigured ? 'Newsletters and priority briefs go to NOTIFY_EMAIL.' : 'NOTIFY_EMAIL is not set; email is skipped.'}
          checked={form.notifyEmail}
          onChange={(v) => set('notifyEmail', v)}
        />
        <Toggle
          label="Nightly housekeeping"
          hint="Scan for duplicates, broken links and stale tasks at 03:00 UTC."
          checked={form.housekeepingEnabled}
          onChange={(v) => set('housekeepingEnabled', v)}
        />
        <Toggle
          label="Automatic research"
          hint="Hourly, pick up any research-flagged task that has not run yet."
          checked={form.researchAuto}
          onChange={(v) => set('researchAuto', v)}
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>Save settings</Button>
      </div>
    </form>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-3">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
