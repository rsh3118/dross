'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Tone = 'neutral' | 'positive' | 'negative'

const DOT: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/50',
  positive: 'bg-primary',
  negative: 'bg-destructive',
}

export function ListEditor({
  title,
  items,
  onChange,
  placeholder,
  tone = 'neutral',
}: {
  title: string
  items: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  tone?: Tone
}) {
  const [value, setValue] = useState('')

  const add = () => {
    const v = value.trim()
    if (!v) return
    onChange([...items, v])
    setValue('')
  }

  const remove = (index: number) => onChange(items.filter((_, i) => i !== index))

  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {title}
      </h4>

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((entry, i) => (
            <li
              key={i}
              className="group flex items-start gap-2.5 rounded-md border bg-card px-3 py-2 text-sm"
            >
              <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', DOT[tone])} aria-hidden />
              <span className="flex-1 text-pretty leading-relaxed">{entry}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove item"
                className="shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 transition-colors group-hover:opacity-100 hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder ?? 'Add an item…'}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={add}
          disabled={!value.trim()}
          aria-label="Add item"
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}
