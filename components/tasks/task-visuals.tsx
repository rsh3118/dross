import type { TaskPriority } from '@/lib/db/schema'
import { cn } from '@/lib/utils'

/** Background tint for a row/card based on priority (urgency). */
export function urgencyClass(priority: TaskPriority): string {
  switch (priority) {
    case 'urgent':
      return 'row-urgent'
    case 'necessary':
      return 'row-necessary'
    case 'important':
      return 'row-important'
    default:
      return ''
  }
}

/** The exact background color for a priority tint, matching the .row-* classes
 *  in globals.css. Returned as a color-mix string for use as an inline style
 *  (so it reliably wins over a component's default background). */
export function urgencyBg(priority: TaskPriority): string {
  switch (priority) {
    case 'urgent':
      return 'color-mix(in oklab, var(--destructive) 18%, var(--card))'
    case 'necessary':
      return 'color-mix(in oklab, var(--destructive) 11%, var(--card))'
    case 'important':
      return 'color-mix(in oklab, var(--warning) 12%, var(--card))'
    default:
      return 'var(--card)'
  }
}

/** A small filled circle used to color-code type / group / category. */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: color }}
    />
  )
}
