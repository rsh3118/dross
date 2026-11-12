import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { DrossMark } from '@/components/dross-mark'
import { CloseTab } from './close-tab'

export const metadata = { title: 'Signed in' }

export default async function AuthDonePage() {
  const session = await getSession()
  if (!session?.user) redirect('/sign-in')

  return (
    <main className="min-h-svh bg-background text-foreground flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <DrossMark className="size-10 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re signed in</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Head back to the dross tab — it will pick up your session automatically. You can close this
          one.
        </p>
        <CloseTab />
      </div>
    </main>
  )
}
