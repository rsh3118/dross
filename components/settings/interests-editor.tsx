'use client'

import { useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import type { Interest } from '@/lib/db/schema'
import { addInterest, removeInterest } from '@/app/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function InterestsEditor({ interests }: { interests: Interest[] }) {
  const [pending, startTransition] = useTransition()
  const [topic, setTopic] = useState('')
  const [keywords, setKeywords] = useState('')
  const [weight, setWeight] = useState('3')

  const submit = () => {
    if (topic.trim().length < 2) return
    startTransition(async () => {
      await addInterest({
        topic: topic.trim(),
        keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        weight: Number(weight),
      })
      setTopic('')
      setKeywords('')
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="rounded-lg border bg-card divide-y">
        {interests.length === 0 && (
          <li className="px-4 py-4 text-sm text-muted-foreground">
            None yet. Try &ldquo;Local zoning changes&rdquo;, &ldquo;Rust async runtimes&rdquo;, or &ldquo;Sleep science&rdquo;.
          </li>
        )}
        {interests.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="font-mono text-[11px] text-primary tabular-nums w-8" aria-label={`weight ${i.weight}`}>
              w{i.weight}
            </span>
            <span className="text-sm font-medium">{i.topic}</span>
            {i.keywords.length > 0 && (
              <span className="font-mono text-[11px] text-muted-foreground truncate">{i.keywords.join(', ')}</span>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="ml-auto size-7"
              aria-label={`Remove ${i.topic}`}
              disabled={pending}
              onClick={() => startTransition(() => removeInterest(i.id))}
            >
              <X className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_auto]">
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic"
          aria-label="Topic"
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') submit()
          }}
        />
        <Input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="Keywords, comma separated"
          aria-label="Keywords"
        />
        <Select value={weight} onValueChange={(v) => v && setWeight(v)}>
          <SelectTrigger aria-label="Weight"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((w) => (
              <SelectItem key={w} value={String(w)}>weight {w}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={submit} disabled={pending || topic.trim().length < 2}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
    </div>
  )
}
