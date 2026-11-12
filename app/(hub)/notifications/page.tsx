import { listNotifications } from '@/app/actions/notifications'
import { PageHeader } from '@/components/shell/page-header'
import { NotificationList } from '@/components/notifications/notification-list'
import { RunNowButton } from '@/components/agents/run-now-button'

export const metadata = { title: 'Inbox' }

export default async function NotificationsPage() {
  const items = await listNotifications()
  const unread = items.filter((n) => !n.readAt).length

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        eyebrow="inbox"
        title={unread === 0 ? 'All caught up' : `${unread} unread`}
        description="Everything the agents want you to know. Priority briefs also go to your email."
        actions={<RunNowButton agent="notify" label="Brief me now" />}
      />
      <NotificationList items={items} />
    </div>
  )
}
