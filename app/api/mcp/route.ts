import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { journalEntries, tasks, wikiPages, type JournalBody, type JournalType, type WikiStatus } from '@/lib/db/schema'
import { requireApiUser } from '@/lib/api-auth'
import { createWikiPage, updateWikiPage } from '@/lib/wiki'
import { emptyBodyFor } from '@/lib/journal'

const tools = [
  { name: 'get_database_schema', description: 'Inspect the Dross database tables and columns.', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_tasks', description: 'List tasks belonging to the authenticated Dross user.', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
  { name: 'create_task', description: 'Create a task. Urgency is top, today, week, or backlog and defaults to top.', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, urgency: { type: 'string', enum: ['top', 'today', 'week', 'backlog'] } } } },
  { name: 'update_task', description: 'Update a task title or urgency.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'number' }, title: { type: 'string' }, urgency: { type: 'string', enum: ['top', 'today', 'week', 'backlog'] } } } },
  { name: 'list_wiki_pages', description: 'List active wiki pages, including their content, belonging to the authenticated Dross user.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_wiki_page', description: 'Read one active wiki page by ID or slug for the authenticated Dross user.', inputSchema: { type: 'object', properties: { id: { type: 'integer', minimum: 1 }, slug: { type: 'string', minLength: 1, maxLength: 200 } }, anyOf: [{ required: ['id'] }, { required: ['slug'] }] } },
  { name: 'list_journal_entries', description: 'Read active journal entries belonging to the authenticated Dross user.', inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['daily', 'relationship'] }, limit: { type: 'integer', minimum: 1, maximum: 100 } } } },
  { name: 'create_journal_entry', description: 'Create a daily or relationship journal entry for the authenticated Dross user.', inputSchema: { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['daily', 'relationship'] }, title: { type: 'string', maxLength: 200 }, summary: { type: 'string', maxLength: 4000 }, body: { type: 'object', properties: { feelings: { type: 'array', items: { type: 'string' } }, wentWell: { type: 'array', items: { type: 'string' } }, wentPoorly: { type: 'array', items: { type: 'string' } }, lessonsShort: { type: 'array', items: { type: 'string' } }, lessonsMedium: { type: 'array', items: { type: 'string' } }, lessonsLong: { type: 'array', items: { type: 'string' } }, wentBad: { type: 'array', items: { type: 'string' } }, canAccept: { type: 'array', items: { type: 'string' } }, cannotAccept: { type: 'array', items: { type: 'string' } }, canImprove: { type: 'array', items: { type: 'string' } }, didWell: { type: 'array', items: { type: 'string' } }, learned: { type: 'array', items: { type: 'string' } }, details: { type: 'string' } } }, entryDate: { type: 'string', format: 'date-time' } } } },
  { name: 'update_journal_entry', description: 'Update a journal entry belonging to the authenticated Dross user.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 }, title: { type: ['string', 'null'], maxLength: 200 }, summary: { type: ['string', 'null'], maxLength: 4000 }, body: { type: 'object', properties: { feelings: { type: 'array', items: { type: 'string' } }, wentWell: { type: 'array', items: { type: 'string' } }, wentPoorly: { type: 'array', items: { type: 'string' } }, lessonsShort: { type: 'array', items: { type: 'string' } }, lessonsMedium: { type: 'array', items: { type: 'string' } }, lessonsLong: { type: 'array', items: { type: 'string' } }, wentBad: { type: 'array', items: { type: 'string' } }, canAccept: { type: 'array', items: { type: 'string' } }, cannotAccept: { type: 'array', items: { type: 'string' } }, canImprove: { type: 'array', items: { type: 'string' } }, didWell: { type: 'array', items: { type: 'string' } }, learned: { type: 'array', items: { type: 'string' } }, details: { type: 'string' } } }, entryDate: { type: 'string', format: 'date-time' } } } },
  { name: 'create_wiki_page', description: 'Create a wiki page for the authenticated Dross user.', inputSchema: { type: 'object', required: ['title', 'content'], properties: { title: { type: 'string', maxLength: 200 }, content: { type: 'string', maxLength: 100000 }, summary: { type: 'string', maxLength: 2000 }, tags: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 30 }, status: { type: 'string', enum: ['draft', 'published'] } } } },
  { name: 'update_wiki_page', description: 'Update an existing wiki page belonging to the authenticated Dross user.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 }, title: { type: 'string', maxLength: 200 }, content: { type: 'string', maxLength: 100000 }, summary: { anyOf: [{ type: 'string', maxLength: 2000 }, { type: 'null' }] }, tags: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 30 }, status: { type: 'string', enum: ['draft', 'published'] } } } },
]

const schema = {
  tables: ['user', 'session', 'account', 'tasks', 'mountains', 'boulders', 'wiki_pages', 'wiki_revisions', 'wiki_links', 'interests', 'agent_runs', 'proposals', 'newsletters', 'notifications', 'settings', 'recordings', 'captured_tasks', 'journal_entries'],
  note: 'All data tools are authenticated and scoped to the current Dross user. Raw SQL is intentionally not exposed.',
}

function result(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

function isValidTags(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 30 && value.every((tag) => typeof tag === 'string' && tag.trim().length > 0 && tag.length <= 80)
}

const journalListSchema = z.array(z.string().trim().max(500)).max(200)
const dailyJournalPatchSchema = z.object({
  feelings: journalListSchema.optional(),
  wentWell: journalListSchema.optional(),
  wentPoorly: journalListSchema.optional(),
  lessonsShort: journalListSchema.optional(),
  lessonsMedium: journalListSchema.optional(),
  lessonsLong: journalListSchema.optional(),
}).strip()
const relationshipJournalPatchSchema = z.object({
  wentWell: journalListSchema.optional(),
  wentBad: journalListSchema.optional(),
  canAccept: journalListSchema.optional(),
  cannotAccept: journalListSchema.optional(),
  canImprove: journalListSchema.optional(),
  didWell: journalListSchema.optional(),
  learned: journalListSchema.optional(),
  details: z.string().trim().max(8000).optional(),
}).strip()

function parseJournalBody(type: JournalType, value: unknown): JournalBody | null {
  const parsed = type === 'daily' ? dailyJournalPatchSchema.safeParse(value) : relationshipJournalPatchSchema.safeParse(value)
  if (!parsed.success) return null
  return { ...emptyBodyFor(type), ...parsed.data } as JournalBody
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*',       'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version' } })
}

export async function DELETE(request: Request) {
  const sessionId = request.headers.get('Mcp-Session-Id')
  if (!sessionId) return NextResponse.json({ error: 'Missing MCP session ID' }, { status: 400 })
  return new Response(null, { status: 200, headers: { 'Mcp-Session-Id': sessionId } })
}

export async function GET() {
  const sessionId = randomUUID()
  const response = NextResponse.json({ name: 'dross', transport: 'streamable-http', endpoint: '/api/mcp' })
  response.headers.set('Mcp-Session-Id', sessionId)
  response.headers.set('Mcp-Protocol-Version', '2025-06-18')
  response.headers.set('cache-control', 'no-store')
  return response
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (body.method === 'initialize') {
    const response = NextResponse.json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'dross', version: '1.0.0' } } })
    response.headers.set('Mcp-Session-Id', randomUUID())
    response.headers.set('Mcp-Protocol-Version', '2025-06-18')
    return response
  }
  if (body.method === 'notifications/initialized') return new NextResponse(null, { status: 202 })
  if (body.method === 'tools/list') return NextResponse.json({ jsonrpc: '2.0', id: body.id, result: { tools } })

  if (body.method !== 'tools/call') return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } })

  const name = body.params?.name
  const args = body.params?.arguments ?? {}
  const requiredScope = name === 'get_database_schema' ? 'mcp:schema' : ['list_tasks', 'list_wiki_pages', 'get_wiki_page', 'list_journal_entries'].includes(name) ? 'mcp:read' : ['create_task', 'update_task', 'create_wiki_page', 'update_wiki_page', 'create_journal_entry', 'update_journal_entry'].includes(name) ? 'mcp:write' : null
  if (!requiredScope) return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Unknown tool' } })

  let user: { id: string }
  try {
    user = await requireApiUser(request, requiredScope)
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      return new Response('Unauthorized', { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://www.dross.quest/.well-known/oauth-protected-resource", scope="mcp:read mcp:write mcp:schema"' } })
    }
    if (error instanceof Response && error.status === 403) {
      return new Response('Forbidden', { status: 403, headers: { 'www-authenticate': 'Bearer error="insufficient_scope", scope="mcp:read mcp:write mcp:schema"' } })
    }
    throw error
  }
  let value: unknown

  if (name === 'get_database_schema') value = schema
  else if (name === 'list_tasks') value = await db.select().from(tasks).where(eq(tasks.userId, user.id)).orderBy(desc(tasks.createdAt)).limit(Math.min(Number(args.limit) || 100, 500))
  else if (name === 'create_task') {
    const urgency = args.urgency ?? 'top'
    const [task] = await db.insert(tasks).values({ userId: user.id, title: String(args.title), urgency, topItem: urgency === 'top', today: urgency === 'today', thisWeek: urgency === 'week' }).returning()
    value = task
  } else if (name === 'update_task') {
    const urgency = args.urgency
    const [task] = await db.update(tasks).set({ ...(args.title !== undefined ? { title: String(args.title) } : {}), ...(urgency ? { urgency, topItem: urgency === 'top', today: urgency === 'today', thisWeek: urgency === 'week' } : {}) }).where(and(eq(tasks.id, Number(args.id)), eq(tasks.userId, user.id))).returning()
    value = task ?? { error: 'Task not found' }
  } else if (name === 'list_wiki_pages') value = await db.select().from(wikiPages).where(and(eq(wikiPages.userId, user.id), isNull(wikiPages.archivedAt))).orderBy(desc(wikiPages.updatedAt))
  else if (name === 'get_wiki_page') {
    const hasId = Number.isSafeInteger(args.id) && args.id > 0
    const hasSlug = typeof args.slug === 'string' && args.slug.trim().length > 0 && args.slug.length <= 200
    if (hasId === hasSlug) return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Provide exactly one valid wiki page ID or slug' } })
    const [page] = await db.select().from(wikiPages).where(and(eq(wikiPages.userId, user.id), isNull(wikiPages.archivedAt), hasId ? eq(wikiPages.id, args.id) : eq(wikiPages.slug, args.slug.trim()))).limit(1)
    value = page ?? { error: 'Wiki page not found' }
  } else if (name === 'list_journal_entries') {
    const limit = args.limit === undefined ? 30 : args.limit
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (args.type !== undefined && args.type !== 'daily' && args.type !== 'relationship')) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid journal filters' } })
    }
    const filters = [eq(journalEntries.userId, user.id), isNull(journalEntries.archivedAt)]
    if (args.type !== undefined) filters.push(eq(journalEntries.type, args.type))
    value = await db.select().from(journalEntries).where(and(...filters)).orderBy(desc(journalEntries.entryDate)).limit(limit)
  } else if (name === 'create_journal_entry') {
    const entryDate = args.entryDate === undefined ? undefined : typeof args.entryDate === 'string' ? new Date(args.entryDate) : null
    if ((args.type !== 'daily' && args.type !== 'relationship') || (args.title !== undefined && (typeof args.title !== 'string' || args.title.trim().length > 200)) || (args.summary !== undefined && (typeof args.summary !== 'string' || args.summary.trim().length > 4000)) || (args.body !== undefined && (!args.body || typeof args.body !== 'object' || Array.isArray(args.body))) || (args.entryDate !== undefined && (!entryDate || Number.isNaN(entryDate.getTime())))) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid journal entry fields' } })
    }
    const type = args.type as JournalType
    const entryBody = args.body === undefined ? emptyBodyFor(type) : parseJournalBody(type, args.body)
    if (!entryBody) return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid journal body for entry type' } })
    const [entry] = await db.insert(journalEntries).values({ userId: user.id, type, title: args.title?.trim() || null, summary: args.summary?.trim() || null, body: entryBody, ...(entryDate ? { entryDate } : {}) }).returning()
    value = entry
  } else if (name === 'update_journal_entry') {
    const entryDate = args.entryDate === undefined ? undefined : typeof args.entryDate === 'string' ? new Date(args.entryDate) : null
    if (!Number.isSafeInteger(args.id) || args.id < 1 || (args.title !== undefined && args.title !== null && (typeof args.title !== 'string' || args.title.trim().length > 200)) || (args.summary !== undefined && args.summary !== null && (typeof args.summary !== 'string' || args.summary.trim().length > 4000)) || (args.body !== undefined && (!args.body || typeof args.body !== 'object' || Array.isArray(args.body))) || (args.entryDate !== undefined && (!entryDate || Number.isNaN(entryDate.getTime()))) || !['title', 'summary', 'body', 'entryDate'].some((field) => args[field] !== undefined)) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid journal entry fields' } })
    }
    const [current] = await db.select().from(journalEntries).where(and(eq(journalEntries.id, args.id), eq(journalEntries.userId, user.id), isNull(journalEntries.archivedAt))).limit(1)
    if (!current) value = { error: 'Journal entry not found' }
    else {
      const updatedBody = args.body === undefined ? current.body : parseJournalBody(current.type, { ...current.body, ...args.body })
      if (!updatedBody) return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid journal body for entry type' } })
      const [entry] = await db.update(journalEntries).set({ ...(args.title !== undefined ? { title: args.title?.trim() || null } : {}), ...(args.summary !== undefined ? { summary: args.summary?.trim() || null } : {}), ...(args.body !== undefined ? { body: updatedBody } : {}), ...(entryDate ? { entryDate } : {}), updatedAt: new Date() }).where(and(eq(journalEntries.id, args.id), eq(journalEntries.userId, user.id), isNull(journalEntries.archivedAt))).returning()
      value = entry ?? { error: 'Journal entry not found' }
    }
  } else if (name === 'create_wiki_page') {
    if (typeof args.title !== 'string' || !args.title.trim() || args.title.length > 200 || typeof args.content !== 'string' || args.content.length > 100000 || (args.summary !== undefined && (typeof args.summary !== 'string' || args.summary.length > 2000)) || (args.tags !== undefined && !isValidTags(args.tags)) || (args.status !== undefined && args.status !== 'draft' && args.status !== 'published')) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid wiki page fields' } })
    }
    value = await createWikiPage({ userId: user.id, title: args.title.trim(), content: args.content, summary: args.summary, tags: args.tags, status: args.status as WikiStatus | undefined, authoredBy: 'user' })
  } else if (name === 'update_wiki_page') {
    if (!Number.isSafeInteger(args.id) || args.id < 1 || (args.title !== undefined && (typeof args.title !== 'string' || !args.title.trim() || args.title.length > 200)) || (args.content !== undefined && (typeof args.content !== 'string' || args.content.length > 100000)) || (args.summary !== undefined && args.summary !== null && (typeof args.summary !== 'string' || args.summary.length > 2000)) || (args.tags !== undefined && !isValidTags(args.tags)) || (args.status !== undefined && args.status !== 'draft' && args.status !== 'published') || !['title', 'content', 'summary', 'tags', 'status'].some((field) => args[field] !== undefined)) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid wiki page fields' } })
    }
    value = await updateWikiPage({ userId: user.id, id: args.id, title: args.title?.trim(), content: args.content, summary: args.summary, tags: args.tags, status: args.status as WikiStatus | undefined, authoredBy: 'user' })
  } else return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Unknown tool' } })

  const response = NextResponse.json({ jsonrpc: '2.0', id: body.id, result: result(value) })
  const sessionId = request.headers.get('Mcp-Session-Id')
  if (sessionId) response.headers.set('Mcp-Session-Id', sessionId)
  response.headers.set('Mcp-Protocol-Version', '2025-06-18')
  return response
}
