import Link from 'next/link'
import { getSettings, listInterests } from '@/app/actions/settings'
import { PageHeader } from '@/components/shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { SettingsForm } from '@/components/settings/settings-form'
import { InterestsEditor } from '@/components/settings/interests-editor'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const [s, ints] = await Promise.all([getSettings(), listInterests()])
  const emailConfigured = Boolean(process.env.NOTIFY_EMAIL)

  return (
    <div className="flex flex-col gap-8 p-4 md:p-8 max-w-3xl">
      <PageHeader eyebrow="settings" title="How the hub behaves" />
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Interests</h2>
        <p className="text-sm text-muted-foreground">
          The newsletter agent scans the web for these each week. Weight controls how much space a topic gets.
        </p>
        <InterestsEditor interests={ints} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Gmail access</h2>
        <p className="text-sm text-muted-foreground">
          Connect read-only Gmail access to find Amazon purchases without using a Vercel Connector.
        </p>
        <div>
          <Link href="/settings/gmail" className={buttonVariants({ variant: 'outline' })}>
            Manage Gmail connection
          </Link>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Schedules and delivery</h2>
        <SettingsForm settings={s} emailConfigured={emailConfigured} />
      </section>
    </div>
  )
}
