import { headers } from 'next/headers'
import { getRecorderSetup, listCaptured } from '@/app/actions/ambient'
import { PageHeader } from '@/components/shell/page-header'
import { CapturedList } from '@/components/ambient/captured-list'
import { RecorderSetup } from '@/components/ambient/recorder-setup'

export const metadata = { title: 'Capture' }

async function requestOrigin() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export default async function CapturePage() {
  const [captured, setup, origin] = await Promise.all([
    listCaptured(),
    getRecorderSetup(),
    requestOrigin(),
  ])

  return (
    <div className="flex flex-col gap-8 p-4 md:p-8">
      <PageHeader
        eyebrow="capture"
        title={
          captured.length === 0 ? 'Ambient capture' : `${captured.length} overheard`
        }
        description="Turn old phones into room mics. dross transcribes what it hears, extracts tasks, and asks before adding anything."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex flex-col gap-4">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Review queue
          </h2>
          <CapturedList initial={captured} />
        </section>

        <aside className="flex flex-col gap-4">
          <RecorderSetup
            token={setup.token}
            origin={origin}
            ambientEnabled={setup.ambientEnabled}
            ambientEmailApproval={setup.ambientEmailApproval}
          />
        </aside>
      </div>
    </div>
  )
}
