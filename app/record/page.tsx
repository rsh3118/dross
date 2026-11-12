import type { Metadata, Viewport } from 'next'
import { Recorder } from '@/components/ambient/recorder'

export const metadata: Metadata = {
  title: 'Recorder',
  description: 'Ambient room recorder for dross.',
  robots: { index: false, follow: false },
}

// Prevent pinch-zoom fiddliness on the always-on phone screen.
export const viewport: Viewport = {
  themeColor: '#15171d',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RecordPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <Recorder />
    </main>
  )
}
