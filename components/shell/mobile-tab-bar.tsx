'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  BookOpen,
  Bot,
  CheckSquare,
  Ear,
  GitPullRequest,
  LayoutGrid,
  Mail,
  MoreHorizontal,
  ShoppingBag,
  Mountain,
  NotebookPen,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

// The four thumb-reachable primary destinations; everything else lives in "More".
const PRIMARY = [
  { href: '/', label: 'Today', icon: LayoutGrid },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/structure', label: 'Peaks', icon: Mountain },
  { href: '/agents', label: 'Agents', icon: Bot },
] as const

const SECONDARY = [
  { href: '/capture', label: 'Capture', icon: Ear, badgeKey: 'captured' as const },
  { href: '/journal', label: 'Journal', icon: NotebookPen, badgeKey: null },
  { href: '/wiki', label: 'Wiki', icon: BookOpen, badgeKey: null },
  { href: '/proposals', label: 'Proposals', icon: GitPullRequest, badgeKey: 'proposals' as const },
  { href: '/newsletter', label: 'Newsletter', icon: Mail, badgeKey: null },
  { href: '/purchases', label: 'Purchases', icon: ShoppingBag, badgeKey: null },
  { href: '/notifications', label: 'Inbox', icon: Bell, badgeKey: 'notifications' as const },
  { href: '/settings', label: 'Settings', icon: Settings, badgeKey: null },
] as const

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

export function MobileTabBar({
  counts,
}: {
  counts: { proposals: number; notifications: number; captured: number }
}) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const secondaryActive = SECONDARY.some((s) => isActive(pathname, s.href))
  const moreBadge = counts.proposals + counts.notifications + counts.captured

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-sidebar/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="flex items-stretch">
          {PRIMARY.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <item.icon className={cn('size-5', active && 'text-primary')} />
                  {item.label}
                </Link>
              </li>
            )
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="More sections"
              className={cn(
                'relative flex w-full flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                secondaryActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <MoreHorizontal className="size-5" />
              More
              {moreBadge > 0 && (
                <span className="absolute right-[22%] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
              )}
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl p-0"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <SheetHeader className="px-5 pt-3 pb-1">
            <SheetTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              More
            </SheetTitle>
          </SheetHeader>
          <ul className="grid grid-cols-2 gap-2 p-4">
            {SECONDARY.map((item) => {
              const active = isActive(pathname, item.href)
              const badge =
                item.badgeKey === 'proposals'
                  ? counts.proposals
                  : item.badgeKey === 'notifications'
                    ? counts.notifications
                    : item.badgeKey === 'captured'
                      ? counts.captured
                      : 0
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-3 py-3 text-sm transition-colors',
                      active
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'bg-card text-foreground hover:bg-muted/60',
                    )}
                  >
                    <item.icon className={cn('size-4', active ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="flex-1">{item.label}</span>
                    {badge > 0 && (
                      <span className="font-mono text-[11px] tabular-nums rounded-sm bg-primary/15 text-primary px-1.5 py-0.5">
                        {badge}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}
