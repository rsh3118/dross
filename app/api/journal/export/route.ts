import { and, asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { journalEntries } from '@/lib/db/schema'
import { getSession } from '@/lib/session'

const SECTION_LABELS: Record<string, string> = {
  wentWell: 'What went well',
  wentBad: 'What went bad',
  didWell: 'What I did well',
  canAccept: 'What I can accept about her',
  cannotAccept: "What I can't accept about her",
  canImprove: 'What I can improve',
  learned: 'What did I learn',
  details: 'Details',
}

const SECTION_ORDER = Object.keys(SECTION_LABELS)

const humanize = (key: string) =>
  key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()

function formatSection(key: string, value: unknown): string | null {
  const label = SECTION_LABELS[key] ?? humanize(key)
  if (Array.isArray(value)) {
    const items = value.map((v) => String(v).trim()).filter(Boolean)
    if (items.length === 0) return null
    return `${label}:\n${items.map((i) => `  - ${i}`).join('\n')}`
  }
  if (typeof value === 'string') {
    const text = value.trim()
    return text ? `${label}:\n${text}` : null
  }
  if (value === null || value === undefined) return null
  return `${label}:\n${JSON.stringify(value, null, 2)}`
}

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Archived entries are included on purpose: this is a full data export.
  const rows = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, session.user.id), eq(journalEntries.type, 'relationship')))
    .orderBy(asc(journalEntries.entryDate), asc(journalEntries.id))

  const blocks = rows.map((row, index) => {
    const body = (row.body ?? {}) as Record<string, unknown>
    const extraKeys = Object.keys(body).filter((k) => !SECTION_ORDER.includes(k))
    const sections = [...SECTION_ORDER, ...extraKeys]
      .map((key) => formatSection(key, body[key]))
      .filter((s): s is string => s !== null)

    const header = [
      `ENTRY ${index + 1}: ${row.title?.trim() || 'Untitled reflection'}`,
      `Date: ${row.entryDate.toISOString()}`,
      `Created: ${row.createdAt.toISOString()}`,
      `Last updated: ${row.updatedAt.toISOString()}`,
      row.archivedAt ? `Archived: ${row.archivedAt.toISOString()}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    return [header, row.summary?.trim() ? `Summary:\n${row.summary.trim()}` : null, ...sections]
      .filter(Boolean)
      .join('\n\n')
  })

  const divider = `\n\n${'='.repeat(60)}\n\n`
  const text =
    `RELATIONSHIP REFLECTIONS\nExported ${new Date().toISOString()}\n${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}` +
    (blocks.length > 0 ? `${divider}${blocks.join(divider)}` : '') +
    '\n'

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="relationship-reflections.txt"',
      'Cache-Control': 'private, no-store',
    },
  })
}
