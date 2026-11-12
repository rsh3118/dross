'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Bell, Bot, Clock, GitPullRequest, Mail, MailCheck } from 'lucide-react'
import type { Notification } from '@/lib/db/schema'
import { markAllRead, markRead } from '@/app/actions/notifications'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ICON: Record<Notification['kind'], typeof Bell> = {
  due_soon: Clock,
  overdue: Clock,
  agent: Bot,
  proposal: GitPullRequest,
  newsletter: Mail,
  system: Bell,
}

export function NotificationList({ items }: { items: Notification[] }) {
  const [pending, startTransition] = useTransition()
  const unread = items.filter((n) => !n.readAt).length

  return (
    <div className="flex flex-col gap-3">
      {unread > 0 && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(() => markAllRead())}>
            Mark all read
          </Button>
        </div>
      )}
      <ul className="rounded-lg border bg-card divide-y">
        {items.length === 0 && (
          <li className="p-10 text-center text-sm text-muted-foreground">Quiet. Nothing to report.</li>
        )}
        {items.map((n) => {
          const Icon = ICON[n.kind]
          const unreadItem = !n.readAt
          const inner = (
            <div className="flex items-start gap-3 px-4 py-3">
              <Icon className={cn('size-4 mt-0.5 shrink-0', unreadItem ? 'text-primary' : 'text-muted-foreground')} />
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <p className={cn('text-sm', unreadItem ? 'font-medium' : 'text-muted-foreground')}>{n.title}</p>
                {n.body && (
                  <Markdown content={n.body} className="text-sm [&_p]:text-muted-foreground [&_li]:text-muted-foreground" />
                )}
                <p className="font-mono text-[11px] text-muted-foreground flex items-center gap-2">
                  {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                  {n.emailedAt && (
                    <span className="inline-flex items-center gap-1">
                      <MailCheck className="size-3" /> emailed
                    </span>
                  )}
                </p>
              </div>
              {unreadItem && <span className="size-2 rounded-full bg-primary mt-2 shrink-0" aria-label="Unread" />}
            </div>
          )
          return (
            <li key={n.id} className={cn(unreadItem && 'bg-primary/[0.03]')}>
              {n.href ? (
                <Link
                  href={n.href}
                  onClick={() => unreadItem && startTransition(() => markRead(n.id))}
                  className="block hover:bg-muted/40"
                >
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => unreadItem && startTransition(() => markRead(n.id))}
                  className="block w-full text-left hover:bg-muted/40"
                >
                  {inner}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
