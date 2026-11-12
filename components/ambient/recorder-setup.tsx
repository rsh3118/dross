'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, RefreshCw, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { rotateRecorderToken, setAmbientOptions } from '@/app/actions/ambient'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

const ROOMS = [
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'living-room', label: 'Living room' },
]

function CopyRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast('Link copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{url}</span>
      </div>
      <Button size="sm" variant="ghost" onClick={copy} aria-label={`Copy ${label} link`}>
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </Button>
    </div>
  )
}

export function RecorderSetup({
  token,
  origin,
  ambientEnabled,
  ambientEmailApproval,
}: {
  token: string
  origin: string
  ambientEnabled: boolean
  ambientEmailApproval: boolean
}) {
  const [tok, setTok] = useState(token)
  const [enabled, setEnabled] = useState(ambientEnabled)
  const [emailApproval, setEmailApproval] = useState(ambientEmailApproval)
  const [busy, startTransition] = useTransition()

  const link = (room: string) =>
    `${origin}/record?room=${room}#key=${encodeURIComponent(tok)}`

  const rotate = () =>
    startTransition(async () => {
      const { token: next } = await rotateRecorderToken()
      setTok(next)
      toast('New key generated. Old device links stopped working.')
    })

  const toggle = (which: 'enabled' | 'emailApproval', value: boolean) =>
    startTransition(async () => {
      if (which === 'enabled') setEnabled(value)
      else setEmailApproval(value)
      await setAmbientOptions(which === 'enabled' ? { enabled: value } : { emailApproval: value })
    })

  return (
    <div className="flex flex-col gap-5 rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">Room devices</h2>
          <p className="text-pretty text-sm text-muted-foreground">
            Open a link below on an old phone, allow the mic, and leave it plugged in. It will listen
            and upload continuously. The key is embedded, so setup is one tap.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {ROOMS.map((r) => (
          <CopyRow key={r.value} label={r.label} url={link(r.value)} />
        ))}
      </div>

      <div className="flex flex-col gap-4 border-t pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <Label htmlFor="ambient-enabled" className="text-sm">
              Ambient capture
            </Label>
            <span className="text-xs text-muted-foreground">Master switch for all room devices</span>
          </div>
          <Switch
            id="ambient-enabled"
            checked={enabled}
            disabled={busy}
            onCheckedChange={(v) => toggle('enabled', v)}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <Label htmlFor="ambient-email" className="text-sm">
              Email me to approve
            </Label>
            <span className="text-xs text-muted-foreground">
              Send a digest with add / dismiss buttons
            </span>
          </div>
          <Switch
            id="ambient-email"
            checked={emailApproval}
            disabled={busy}
            onCheckedChange={(v) => toggle('emailApproval', v)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <p className="text-xs text-muted-foreground">
          Rotate the key if a device is lost. Existing devices will need the new link.
        </p>
        <Button size="sm" variant="outline" disabled={busy} onClick={rotate}>
          <RefreshCw className="size-4" /> Rotate key
        </Button>
      </div>
    </div>
  )
}
