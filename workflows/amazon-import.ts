import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { gmail_v1, google } from 'googleapis'
import { db } from '@/lib/db'
import { amazonImportJobs, amazonPurchases, gmailConnections } from '@/lib/db/schema'
import { decryptToken, gmailClient } from '@/lib/gmail-oauth'

const YEAR_QUERY = 'from:(amazon.com) after:2024/12/31 before:2026/01/01'

type ParsedItem = { name: string; amount: number | null }

function decodeBody(data?: string | null) {
  if (!data) return ''
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function flattenParts(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeBody(part.body.data)
  return (part.parts ?? []).map(flattenParts).join('\n')
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string) {
  return headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function parsePurchase(text: string): { items: ParsedItem[]; total: number | null; currency: string; invoiceId: string | null } {
  const clean = text.replace(/\s+/g, ' ').trim()
  const invoiceId = clean.match(/(?:order|invoice|receipt)\s*(?:id|#|number)?\s*[:#]?\s*([0-9-]{8,})/i)?.[1] ?? null
  const totalMatch = clean.match(/(?:order total|grand total|total)\s*[:$]?\s*(?:USD\s*)?\$?([0-9,]+\.\d{2})/i)
  const total = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : null
  const itemMatches = [...text.matchAll(/(?:item|product)\s*[:\-]\s*([^\n|]{3,120}?)(?:\s+(?:price|amount)\s*[:\-]?\s*\$([0-9,]+\.\d{2}))?(?=\n|$)/gi)]
  return {
    items: itemMatches.slice(0, 100).map((match) => ({ name: match[1].trim(), amount: match[2] ? Number(match[2].replace(/,/g, '')) : null })),
    total,
    currency: 'USD',
    invoiceId,
  }
}

type GmailRequest<T> = () => Promise<T>

function isRetryableGmailError(error: unknown) {
  const candidate = error as { response?: { status?: number }; code?: number; message?: string }
  const status = candidate.response?.status ?? candidate.code
  const message = candidate.message ?? ''
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || /quota exceeded|rate limit|too many requests/i.test(message)
}

async function withGmailBackoff<T>(operation: string, request: GmailRequest<T>): Promise<T> {
  let delayMs = 5000
  let attempt = 0
  while (true) {
    try {
      const result = await request()
      // A successful request starts the backoff window over for the next request.
      return result
    } catch (error) {
      if (!isRetryableGmailError(error) || attempt >= 8) throw error
      attempt += 1
      const waitMs = Math.min(delayMs, 60000)
      console.warn('[v0] Gmail request throttled; retrying', { operation, attempt, waitMs })
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      delayMs = Math.min(delayMs * 2, 60000)
    }
  }
}

async function importAmazonBatch(userId: string, pageToken?: string) {
  'use step'
  const [connection] = await db.select().from(gmailConnections).where(eq(gmailConnections.userId, userId)).limit(1)
  if (!connection) throw new Error('Gmail is not connected')
  const client = gmailClient()
  client.setCredentials({
    refresh_token: decryptToken(connection.refreshToken),
    access_token: connection.accessToken ? decryptToken(connection.accessToken) : undefined,
    expiry_date: connection.expiryDate?.getTime(),
  })
  const gmail = google.gmail({ version: 'v1', auth: client })
  const response = await withGmailBackoff('messages.list', () => gmail.users.messages.list({ userId: 'me', q: YEAR_QUERY, maxResults: 25, pageToken }))
  const list = response.data
  let imported = 0
  let skipped = 0
  for (const message of list.messages ?? []) {
    if (!message.id) continue
    const messageId = message.id
    let full: gmail_v1.Schema$Message
    try {
      const response = await withGmailBackoff(`messages.get:${messageId}`, () => gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' }))
      full = response.data
    } catch (error) {
      skipped += 1
      console.error('[v0] Skipping unreadable Gmail message', { messageId, errorDetails: errorDetails(error) })
      continue
    }
    const raw = flattenParts(full.payload) || decodeBody(full.payload?.body?.data)
    const parsed = parsePurchase(raw)
    const inserted = await db.insert(amazonPurchases).values({
      id: randomUUID(), userId, gmailMessageId: messageId,
      receivedAt: full.internalDate ? new Date(Number(full.internalDate)) : new Date(),
      sender: getHeader(full.payload?.headers, 'From'),
      subject: getHeader(full.payload?.headers, 'Subject'),
      invoiceId: parsed.invoiceId, items: parsed.items,
      totalAmount: parsed.total?.toFixed(2) ?? null, currency: parsed.currency, rawContent: raw,
    }).onConflictDoNothing({ target: [amazonPurchases.userId, amazonPurchases.gmailMessageId] }).returning({ id: amazonPurchases.id })
    if (inserted.length) imported += 1
  }
  return { scanned: (list.messages ?? []).length, imported, skipped, nextPageToken: list.nextPageToken ?? null }
}

function errorDetails(error: unknown): string {
  if (error instanceof Error) {
    const cause = 'cause' in error ? error.cause : undefined
    const causeText = cause ? ` | cause=${errorDetails(cause)}` : ''
    return `${error.name}: ${error.message || '(no message)'}${causeText}${error.stack ? ` | stack=${error.stack.split('\\n').slice(0, 5).join('\\n')}` : ''}`
  }
  if (typeof error === 'string') return error
  try { return JSON.stringify(error, Object.getOwnPropertyNames(error as object)) } catch { return String(error) }
}

export async function amazonImportWorkflow(userId: string, jobId: string) {
  'use workflow'
  let pageToken: string | undefined
  let scanned = 0
  let imported = 0
  try {
    await updateImportJob(jobId, { status: 'running', startedAt: new Date(), lastError: null })
    do {
      const result = await importAmazonBatch(userId, pageToken)
      scanned += result.scanned
      imported += result.imported
      pageToken = result.nextPageToken ?? undefined
      await updateImportJob(jobId, { pageToken: pageToken ?? null, scanned, imported })
    } while (pageToken)
    await updateImportJob(jobId, { status: 'completed', completedAt: new Date(), pageToken: null, scanned, imported })
    return { scanned, imported }
  } catch (error) {
    const detail = errorDetails(error)
    console.error('[v0] Amazon import failed', { jobId, userId, scanned, imported, pageToken, detail })
    await updateImportJob(jobId, { status: 'failed', lastError: detail.slice(0, 2000), scanned, imported, pageToken: pageToken ?? null })
    throw new Error(detail)
  }
}

async function updateImportJob(jobId: string, values: Partial<typeof amazonImportJobs.$inferInsert>) {
  'use step'
  await db.update(amazonImportJobs).set({ ...values, updatedAt: new Date() }).where(eq(amazonImportJobs.id, jobId))
}
