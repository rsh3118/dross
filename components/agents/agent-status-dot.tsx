import type { RunStatus } from '@/lib/db/schema'
import { cn } from '@/lib/utils'

export function AgentStatusDot({ status, className }: { status: RunStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={status}
      className={cn(
        'relative inline-flex size-2 shrink-0 rounded-full',
        status === 'completed' && 'bg-success',
        status === 'failed' && 'bg-destructive',
        status === 'running' && 'bg-primary',
        status === 'queued' && 'bg-muted-foreground/50',
        className,
      )}
    >
      {status === 'running' && (
        <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
      )}
    </span>
  )
}
