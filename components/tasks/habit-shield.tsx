import { Shield } from 'lucide-react'
import { shieldForTier } from '@/lib/tasks'
import { cn } from '@/lib/utils'

/**
 * A habit's earned shield: a filled crest tinted by tier (wood → gold) with the
 * lifetime completion count printed on it, plus a small tally of banked golds.
 */
export function HabitShield({
  tier,
  count,
  goldShields,
  size = 'sm',
  className,
}: {
  tier: number
  count: number
  goldShields: number
  size?: 'sm' | 'md'
  className?: string
}) {
  const shield = shieldForTier(tier)
  if (!shield) return null

  const px = size === 'md' ? 26 : 20
  const isGold = shield.name === 'Gold'

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center', className)}
      title={`${shield.name} shield · ${count} completed${
        goldShields > 0 ? ` · ${goldShields} gold banked` : ''
      }`}
      aria-label={`${shield.name} habit shield, ${count} completions`}
    >
      <span className="relative inline-flex items-center justify-center">
        <Shield
          style={{
            width: px,
            height: px,
            color: shield.color,
            fill: shield.color,
            filter: `drop-shadow(0 0 3px ${shield.ring})`,
          }}
          aria-hidden
        />
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center font-mono font-semibold tabular-nums',
            size === 'md' ? 'text-[10px]' : 'text-[8px]',
            isGold ? 'text-black/80' : 'text-white',
          )}
          style={{ paddingBottom: px * 0.08 }}
        >
          {count}
        </span>
      </span>
      {goldShields > 0 && (
        <span
          className="ml-0.5 font-mono text-[9px] font-semibold tabular-nums"
          style={{ color: '#e3b23c' }}
        >
          ×{goldShields}
        </span>
      )}
    </span>
  )
}
