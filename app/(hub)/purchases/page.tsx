import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/shell/page-header'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { amazonPurchases } from '@/lib/db/schema'
import { AmazonImportTable } from '@/app/settings/gmail/amazon-import-table'

export const metadata = { title: 'Amazon Purchases' }

export default async function PurchasesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const purchases = await db.select().from(amazonPurchases).where(eq(amazonPurchases.userId, session.user.id)).orderBy(amazonPurchases.receivedAt).limit(25)

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader eyebrow="purchases" title="Amazon purchases" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Import and review every Amazon purchase email from 2025. The import runs in the background and reports its exact progress here.</p>
        <a href="/api/purchases/export" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Download CSV</a>
      </div>
      <AmazonImportTable initialRows={purchases.map((purchase) => ({ ...purchase, receivedAt: purchase.receivedAt.toISOString(), items: Array.isArray(purchase.items) ? purchase.items as { name: string; amount: number | null }[] : [] }))} />
    </div>
  )
}
