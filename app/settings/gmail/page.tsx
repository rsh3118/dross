import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/lib/db' 
import { gmailConnections } from '@/lib/db/schema'
import { auth } from '@/lib/auth'

export default async function GmailSettingsPage({ searchParams }: { searchParams: Promise<{ gmail?: string; reason?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  const [connection] = await db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, session.user.id))
    .limit(1)
  const params = await searchParams
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-8 p-6 sm:p-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">dross settings</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Gmail access</h1>
        </div>
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>Back</Link>
      </div>
      {params.gmail === 'connected' && <p className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">Gmail is connected.</p>}
      {params.gmail === 'error' && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">Could not connect Gmail. {params.reason ?? 'Check the Google OAuth redirect URI and try again.'}</p>}
      {connection && <p className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">Gmail is connected. Open <Link className="font-medium underline" href="/purchases">Purchases</Link> to start or monitor the 2025 Amazon import.</p>}
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
        <p className="text-sm leading-relaxed text-muted-foreground">dross requests read-only Gmail access so it can find Amazon purchase emails. It does not request permission to send, delete, or modify mail.</p>
        {connection ? (
          <p className="text-sm">Connected account: <span className="font-medium">{connection.email ?? 'Google account'}</span></p>
        ) : (
          <a href="/api/gmail/connect" className={buttonVariants()}>
            Connect Gmail
          </a>
        )}
      </section>
    </main>
  )
}
