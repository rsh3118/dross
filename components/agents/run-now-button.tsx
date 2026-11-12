'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Play } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentName } from '@/lib/db/schema'
import { runAgentNow } from '@/app/actions/agents'
import { Button } from '@/components/ui/button'

export function RunNowButton({ agent, label }: { agent: Exclude<AgentName, 'research' | 'code'>; label: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await runAgentNow({ agent })
            toast('Agent started', { description: 'Follow progress on the Agents page.' })
            router.push('/agents')
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not start')
          }
        })
      }
    >
      <Play className="size-4" /> {label}
    </Button>
  )
}
