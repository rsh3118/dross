import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { amazonPurchases } from '@/lib/db/schema'
import { headers } from 'next/headers'

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const rows = await db
      .select({
        date: amazonPurchases.receivedAt,
        invoiceId: amazonPurchases.invoiceId,
        totalAmount: amazonPurchases.totalAmount,
        currency: amazonPurchases.currency,
        subject: amazonPurchases.subject,
      })
      .from(amazonPurchases)
      .where(eq(amazonPurchases.userId, session.user.id))
      .orderBy(desc(amazonPurchases.receivedAt))

    const matching = rows.filter((row) => row.invoiceId && row.totalAmount)
    const csv = [
      'date,invoice_id,total_amount,currency,subject',
      ...matching.map((row) => [
        row.date.toISOString().slice(0, 10),
        row.invoiceId,
        row.totalAmount,
        row.currency,
        row.subject,
      ].map(csvCell).join(',')),
    ].join('\n')

    return new Response(`${csv}\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="amazon-purchases-with-invoice-and-amount.csv"',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('[v0] Purchase CSV export failed', error)
    return NextResponse.json({ error: 'Database export failed' }, { status: 500 })
  }
}
