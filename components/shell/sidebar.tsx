'use client'

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
  ShoppingBag,
  Mountain,
  NotebookPen,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DrossMark } from '@/components/dross-mark'

export const NAV = [
  { href: '/', label: 'Today', icon: LayoutGrid, key: 'g t' },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, key: 'g k' },
  { href: '/structure', label: 'Structure', icon: Mountain, key: 'g m' },
  { href: '/journal', label: 'Journal', icon: NotebookPen, key: 'g j' },
  { href: '/wiki', label: 'Wiki', icon: BookOpen, key: 'g w' },
  { href: '/agents', label: 'Agents', icon: Bot, key: 'g a' },
  { href: '/capture', label: 'Capture', icon: Ear, key: 'g c' },
  { href: '/proposals', label: 'Proposals', icon: GitPullRequest, key: 'g p' },
  { href: '/newsletter', label: 'Newsletter', icon: Mail, key: 'g n' },
  { href: '/purchases', label: 'Purchases', icon: ShoppingBag, key: 'g b' },
  { href: '/notifications', label: 'Inbox', icon: Bell, key: 'g i' },
  { href: '/settings', label: 'Settings', icon: Settings, key: 'g s' },
] as const

export function Sidebar({
  counts,
  onNavigate,
}: {
  counts: { proposals: number; notifications: number; captured: number }
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-4 h-14 border-b border-sidebar-border"
      >
        <DrossMark className="size-6 text-primary" />
        <span className="font-semibold tracking-tight">dross</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          hub
        </span>
      </Link>

      <ul className="flex flex-col gap-0.5 p-2">
        {NAV.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          const badge =
            item.href === '/proposals'
              ? counts.proposals
              : item.href === '/notifications'
                ? counts.notifications
                : item.href === '/capture'
                  ? counts.captured
                  : 0
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )}
              >
                <item.icon
                  className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
                />
                <span className="flex-1">{item.label}</span>
                {badge > 0 ? (
                  <span className="font-mono text-[11px] tabular-nums rounded-sm bg-primary/15 text-primary px-1.5 py-0.5">
                    {badge}
                  </span>
                ) : (
                  <kbd className="hidden lg:inline font-mono text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground">
                    {item.key}
                  </kbd>
                )}
              </Link>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto p-4 border-t border-sidebar-border">
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          <span className="text-primary">▲</span> agents idle · cron armed
        </p>
      </div>
    </nav>
  )
}
