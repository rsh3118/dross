import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  dossierComments,
  dossierHistory,
  dossierPeople,
  dossierReflections,
  journalEntries,
  taskComments,
  tasks,
  wikiPages,
  type DossierHistorySource,
  type JournalBody,
  type JournalType,
  type WikiStatus,
} from '@/lib/db/schema'
import { requireApiUser } from '@/lib/api-auth'
import { createWikiPage, updateWikiPage } from '@/lib/wiki'
import { emptyBodyFor } from '@/lib/journal'

const interactionRecordSchema = {
  type: 'object',
  required: ['person', 'interaction', 'feelings'],
  properties: {
    person: { type: 'string', maxLength: 500 },
    interaction: { type: 'string', maxLength: 500 },
    feelings: { type: 'string', maxLength: 500 },
  },
}
const timeSpentRecordSchema = {
  type: 'object',
  required: ['activity', 'feelings', 'notes'],
  properties: {
    activity: { type: 'string', maxLength: 500 },
    duration: { type: 'string', maxLength: 80, description: 'Short free-text duration, such as “30 min” or “an hour”.' },
    minutes: { type: ['integer', 'null'], minimum: 1, maximum: 100000, description: 'Legacy field; use duration for new entries.' },
    feelings: { type: 'string', maxLength: 500 },
    notes: { type: 'string', maxLength: 8000 },
  },
}

const tools = [
  { name: 'get_database_schema', description: 'Inspect the Dross database tables and columns.', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_tasks', description: 'List tasks belonging to the authenticated Dross user.', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
  { name: 'create_task', description: 'Create a task. Urgency is top, today, week, or backlog and defaults to top.', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, urgency: { type: 'string', enum: ['top', 'today', 'week', 'backlog'] } } } },
  { name: 'update_task', description: 'Update a task title or urgency.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'number' }, title: { type: 'string' }, urgency: { type: 'string', enum: ['top', 'today', 'week', 'backlog'] } } } },
  { name: 'list_task_comments', description: 'List comments on a task belonging to the authenticated Dross user.', inputSchema: { type: 'object', required: ['taskId'], properties: { taskId: { type: 'integer', minimum: 1 } } } },
  { name: 'add_task_comment', description: 'Add a comment to a task belonging to the authenticated Dross user.', inputSchema: { type: 'object', required: ['taskId', 'content'], properties: { taskId: { type: 'integer', minimum: 1 }, content: { type: 'string', minLength: 1, maxLength: 4000 } } } },
  { name: 'list_wiki_pages', description: 'List active wiki pages, including their content, belonging to the authenticated Dross user.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_wiki_page', description: 'Read one active wiki page by ID or slug for the authenticated Dross user.', inputSchema: { type: 'object', properties: { id: { type: 'integer', minimum: 1 }, slug: { type: 'string', minLength: 1, maxLength: 200 } }, anyOf: [{ required: ['id'] }, { required: ['slug'] }] } },
  { name: 'list_journal_entries', description: 'Read active journal entries belonging to the authenticated Dross user.', inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['daily', 'relationship'] }, limit: { type: 'integer', minimum: 1, maximum: 100 } } } },
  { name: 'create_journal_entry', description: 'Create a daily or relationship journal entry for the authenticated Dross user.', inputSchema: { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['daily', 'relationship'] }, title: { type: 'string', maxLength: 200 }, summary: { type: 'string', maxLength: 4000 }, body: { type: 'object', properties: { feelings: { type: 'array', items: { type: 'string' } }, wentWell: { type: 'array', items: { type: 'string' } }, wentPoorly: { type: 'array', items: { type: 'string' } }, lessonsShort: { type: 'array', items: { type: 'string' } }, lessonsMedium: { type: 'array', items: { type: 'string' } }, lessonsLong: { type: 'array', items: { type: 'string' } }, wentBad: { type: 'array', items: { type: 'string' } }, canAccept: { type: 'array', items: { type: 'string' } }, cannotAccept: { type: 'array', items: { type: 'string' } }, canImprove: { type: 'array', items: { type: 'string' } }, didWell: { type: 'array', items: { type: 'string' } }, learned: { type: 'array', items: { type: 'string' } }, appreciations: { type: 'array', maxItems: 200, items: { type: 'string', maxLength: 500 } }, details: { type: 'string' } } }, entryDate: { type: 'string', format: 'date-time' } } } },
  { name: 'update_journal_entry', description: 'Update a journal entry belonging to the authenticated Dross user.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 }, title: { type: ['string', 'null'], maxLength: 200 }, summary: { type: ['string', 'null'], maxLength: 4000 }, body: { type: 'object', properties: { feelings: { type: 'array', items: { type: 'string' } }, wentWell: { type: 'array', items: { type: 'string' } }, wentPoorly: { type: 'array', items: { type: 'string' } }, lessonsShort: { type: 'array', items: { type: 'string' } }, lessonsMedium: { type: 'array', items: { type: 'string' } }, lessonsLong: { type: 'array', items: { type: 'string' } }, wentBad: { type: 'array', items: { type: 'string' } }, canAccept: { type: 'array', items: { type: 'string' } }, cannotAccept: { type: 'array', items: { type: 'string' } }, canImprove: { type: 'array', items: { type: 'string' } }, didWell: { type: 'array', items: { type: 'string' } }, learned: { type: 'array', items: { type: 'string' } }, appreciations: { type: 'array', maxItems: 200, items: { type: 'string', maxLength: 500 } }, details: { type: 'string' } }, additionalProperties: false }, entryDate: { type: 'string', format: 'date-time' } } } },
  { name: 'archive_journal_entry', description: 'Archive a journal entry belonging to the authenticated Dross user.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } },
  { name: 'delete_dossier_person', description: 'Delete a person in Dosier and their associated history and reflections.', inputSchema: { type: 'object', required: ['personId'], properties: { personId: { type: 'integer', minimum: 1 } } } },
  { name: 'list_dossier_comments', description: 'List timestamped, attributable change comments across the authenticated user’s Dosier.', inputSchema: { type: 'object', properties: { personId: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 200 } } } },
  { name: 'list_dossier_people', description: 'List people in the authenticated user’s Dosier, including relationship importance and level blurbs.', inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } } } },
  { name: 'get_dossier_person', description: 'Read one person’s Dosier, including relationship blurbs, history records, attributed reflections, and timestamped change comments.', inputSchema: { type: 'object', required: ['personId'], properties: { personId: { type: 'integer', minimum: 1 } } } },
  { name: 'create_dossier_person', description: 'Add a person to Dosier with optional importance and relationship-level blurbs.', inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 160 }, importance: { type: 'string', maxLength: 500 }, relationshipLevel: { type: 'string', maxLength: 500 } } } },
  { name: 'update_dossier_person', description: 'Update a person’s name, relationship importance, or relationship-level blurb.', inputSchema: { type: 'object', required: ['personId'], properties: { personId: { type: 'integer', minimum: 1 }, name: { type: 'string', minLength: 1, maxLength: 160 }, importance: { type: 'string', maxLength: 500 }, relationshipLevel: { type: 'string', maxLength: 500 } }, anyOf: [{ required: ['name'] }, { required: ['importance'] }, { required: ['relationshipLevel'] }] } },
  { name: 'create_dossier_history', description: 'Add a dated history record. Records may be manual, journal-derived, or AI-authored; when sourceJournalEntryId is supplied it must refer to the authenticated user’s journal.', inputSchema: { type: 'object', required: ['personId', 'content'], properties: { personId: { type: 'integer', minimum: 1 }, title: { type: 'string', maxLength: 200 }, content: { type: 'string', minLength: 1, maxLength: 12000 }, occurredAt: { type: 'string', format: 'date-time' }, sourceType: { type: 'string', enum: ['manual', 'journal', 'ai'] }, sourceJournalEntryId: { type: 'integer', minimum: 1 } } } },
  { name: 'delete_dossier_history', description: 'Delete a history record belonging to a person in the authenticated user’s Dosier.', inputSchema: { type: 'object', required: ['personId', 'recordId'], properties: { personId: { type: 'integer', minimum: 1 }, recordId: { type: 'integer', minimum: 1 } } } },
  { name: 'create_dossier_reflection', description: 'Add a relationship reflection and attribute it to me or AI. Actor defaults to AI when omitted.', inputSchema: { type: 'object', required: ['personId', 'content'], properties: { personId: { type: 'integer', minimum: 1 }, content: { type: 'string', minLength: 1, maxLength: 12000 }, actor: { type: 'string', enum: ['me', 'ai'] } } } },
  { name: 'delete_dossier_reflection', description: 'Delete a reflection belonging to a person in the authenticated user’s Dosier.', inputSchema: { type: 'object', required: ['personId', 'reflectionId'], properties: { personId: { type: 'integer', minimum: 1 }, reflectionId: { type: 'integer', minimum: 1 } } } },
  { name: 'create_wiki_page', description: 'Create a wiki page for the authenticated Dross user.', inputSchema: { type: 'object', required: ['title', 'content'], properties: { title: { type: 'string', maxLength: 200 }, content: { type: 'string', maxLength: 100000 }, summary: { type: 'string', maxLength: 2000 }, tags: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 30 }, status: { type: 'string', enum: ['draft', 'published'] } } } },
  { name: 'update_wiki_page', description: 'Update an existing wiki page belonging to the authenticated Dross user.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 }, title: { type: 'string', maxLength: 200 }, content: { type: 'string', maxLength: 100000 }, summary: { anyOf: [{ type: 'string', maxLength: 2000 }, { type: 'null' }] }, tags: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 30 }, status: { type: 'string', enum: ['draft', 'published'] } } } },
]

const schema = {
  tables: ['user', 'session', 'account', 'tasks', 'task_comments', 'mountains', 'boulders', 'wiki_pages', 'wiki_revisions', 'wiki_links', 'interests', 'agent_runs', 'proposals', 'newsletters', 'notifications', 'settings', 'recordings', 'captured_tasks', 'journal_entries', 'dossier_people', 'dossier_history', 'dossier_reflections', 'dossier_comments'],
  note: 'All data tools are authenticated and scoped to the current Dross user. Raw SQL is intentionally not exposed.',
}

function result(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

function isValidTags(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 30 && value.every((tag) => typeof tag === 'string' && tag.trim().length > 0 && tag.length <= 80)
}

const journalListSchema = z.array(z.string().trim().max(500)).max(200)
const journalTrackingPatchSchema = {
  interactions: z.array(z.object({
    person: z.string().trim().max(500),
    interaction: z.string().trim().max(500),
    feelings: z.string().trim().max(500),
  })).max(200).optional(),
  timeSpent: z.array(z.object({
    activity: z.string().trim().max(500),
    duration: z.string().trim().max(80).optional(),
    minutes: z.number().int().positive().max(100000).nullable().optional(),
    feelings: z.string().trim().max(500),
    notes: z.string().trim().max(8000),
  }).transform(({ duration, minutes, ...record }) => ({
    ...record,
    duration: duration ?? (minutes ? `${minutes} min` : ''),
  }))).max(200).optional(),
}
const dailyJournalPatchSchema = z.object({
  feelings: journalListSchema.optional(),
  wentWell: journalListSchema.optional(),
  wentPoorly: journalListSchema.optional(),
  lessonsShort: journalListSchema.optional(),
  lessonsMedium: journalListSchema.optional(),
  lessonsLong: journalListSchema.optional(),
  ...journalTrackingPatchSchema,
}).strip()
  const relationshipJournalPatchSchema = z.object({
  wentWell: journalListSchema.optional(),
  wentBad: journalListSchema.optional(),
  canAccept: journalListSchema.optional(),
  cannotAccept: journalListSchema.optional(),
  canImprove: journalListSchema.optional(),
  didWell: journalListSchema.optional(),
  learned: journalListSchema.optional(),
  appreciations: journalListSchema.optional(),
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
  const requiredScope = name === 'get_database_schema' ? 'mcp:schema' : ['list_tasks', 'list_task_comments', 'list_wiki_pages', 'get_wiki_page', 'list_journal_entries', 'list_dossier_people', 'get_dossier_person', 'list_dossier_comments'].includes(name) ? 'mcp:read' : ['create_task', 'update_task', 'add_task_comment', 'create_wiki_page', 'update_wiki_page', 'create_journal_entry', 'update_journal_entry', 'archive_journal_entry', 'create_dossier_person', 'update_dossier_person', 'delete_dossier_person', 'create_dossier_history', 'delete_dossier_history', 'create_dossier_reflection', 'delete_dossier_reflection'].includes(name) ? 'mcp:write' : null
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
  } else if (name === 'list_task_comments') {
    if (!Number.isSafeInteger(args.taskId) || args.taskId < 1) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid task ID' } })
    }
    const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, args.taskId), eq(tasks.userId, user.id))).limit(1)
    value = task
      ? await db.select().from(taskComments).where(and(eq(taskComments.taskId, args.taskId), eq(taskComments.userId, user.id))).orderBy(asc(taskComments.createdAt), asc(taskComments.id))
      : { error: 'Task not found' }
  } else if (name === 'add_task_comment') {
    if (!Number.isSafeInteger(args.taskId) || args.taskId < 1 || typeof args.content !== 'string' || !args.content.trim() || args.content.trim().length > 4000) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid task comment fields' } })
    }
    const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, args.taskId), eq(tasks.userId, user.id))).limit(1)
    if (!task) value = { error: 'Task not found' }
    else {
      const [comment] = await db.insert(taskComments).values({ userId: user.id, taskId: args.taskId, content: args.content.trim() }).returning()
      value = comment
    }
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
  } else if (name === 'archive_journal_entry') {
    if (!Number.isSafeInteger(args.id) || args.id < 1) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid journal entry ID' } })
    }
    const [entry] = await db.update(journalEntries).set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(journalEntries.id, args.id), eq(journalEntries.userId, user.id), isNull(journalEntries.archivedAt)))
      .returning({ id: journalEntries.id })
    value = entry ? { archived: true, id: entry.id } : { error: 'Journal entry not found' }
  } else if (name === 'list_dossier_comments') {
    const limit = args.limit === undefined ? 50 : args.limit
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || (args.personId !== undefined && (!Number.isSafeInteger(args.personId) || args.personId < 1))) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid Dosier comment filters' } })
    }
    const filters = [eq(dossierComments.userId, user.id)]
    if (args.personId !== undefined) filters.push(eq(dossierComments.personId, args.personId))
    value = await db.select().from(dossierComments).where(and(...filters))
      .orderBy(desc(dossierComments.createdAt), desc(dossierComments.id)).limit(limit)
  } else if (name === 'list_dossier_people') {
    const limit = args.limit === undefined ? 100 : args.limit
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid Dosier people limit' } })
    }
    value = await db.select().from(dossierPeople)
      .where(eq(dossierPeople.userId, user.id))
      .orderBy(asc(dossierPeople.name))
      .limit(limit)
  } else if (name === 'get_dossier_person') {
    if (!Number.isSafeInteger(args.personId) || args.personId < 1) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid Dosier person ID' } })
    }
    const [person] = await db.select().from(dossierPeople)
      .where(and(eq(dossierPeople.id, args.personId), eq(dossierPeople.userId, user.id)))
      .limit(1)
    if (!person) value = { error: 'Dosier person not found' }
    else {
      const [history, reflections, comments] = await Promise.all([
        db.select().from(dossierHistory)
          .where(and(eq(dossierHistory.personId, person.id), eq(dossierHistory.userId, user.id)))
          .orderBy(desc(dossierHistory.occurredAt), desc(dossierHistory.createdAt)),
        db.select().from(dossierReflections)
          .where(and(eq(dossierReflections.personId, person.id), eq(dossierReflections.userId, user.id)))
          .orderBy(desc(dossierReflections.createdAt)),
        db.select().from(dossierComments)
          .where(and(eq(dossierComments.personId, person.id), eq(dossierComments.userId, user.id)))
          .orderBy(desc(dossierComments.createdAt)),
      ])
      value = { person, history, reflections, comments }
    }
  } else if (name === 'create_dossier_person') {
    if (typeof args.name !== 'string' || !args.name.trim() || args.name.trim().length > 160 || (args.importance !== undefined && (typeof args.importance !== 'string' || args.importance.trim().length > 500)) || (args.relationshipLevel !== undefined && (typeof args.relationshipLevel !== 'string' || args.relationshipLevel.trim().length > 500))) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid Dosier person fields' } })
    }
    const person = await db.transaction(async (tx) => {
      const [created] = await tx.insert(dossierPeople).values({
        userId: user.id,
        name: args.name.trim(),
        importance: args.importance?.trim() ?? '',
        relationshipLevel: args.relationshipLevel?.trim() ?? '',
      }).returning()
      await tx.insert(dossierComments).values({
        userId: user.id,
        personId: created.id,
        personName: created.name,
        targetType: 'person',
        targetId: created.id,
        action: 'create',
        actor: 'ai',
        comment: `Added person “${created.name}” to Dosier through MCP.`,
      })
      return created
    })
    value = person
  } else if (name === 'update_dossier_person') {
    if (!Number.isSafeInteger(args.personId) || args.personId < 1 || !['name', 'importance', 'relationshipLevel'].some((field) => args[field] !== undefined) || (args.name !== undefined && (typeof args.name !== 'string' || !args.name.trim() || args.name.trim().length > 160)) || (args.importance !== undefined && (typeof args.importance !== 'string' || args.importance.trim().length > 500)) || (args.relationshipLevel !== undefined && (typeof args.relationshipLevel !== 'string' || args.relationshipLevel.trim().length > 500))) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid Dosier person fields' } })
    }
    const person = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(dossierPeople)
        .where(and(eq(dossierPeople.id, args.personId), eq(dossierPeople.userId, user.id))).limit(1)
      if (!current) return undefined
      const next = {
        name: args.name?.trim() ?? current.name,
        importance: args.importance?.trim() ?? current.importance,
        relationshipLevel: args.relationshipLevel?.trim() ?? current.relationshipLevel,
      }
      const changes = [
        ...(current.name !== next.name ? [`name: “${current.name}” → “${next.name}”`] : []),
        ...(current.importance !== next.importance ? [`importance: “${current.importance}” → “${next.importance}”`] : []),
        ...(current.relationshipLevel !== next.relationshipLevel ? [`relationship level: “${current.relationshipLevel}” → “${next.relationshipLevel}”`] : []),
      ]
      if (changes.length === 0) return current
      const [updated] = await tx.update(dossierPeople).set({ ...next, updatedAt: new Date() })
        .where(and(eq(dossierPeople.id, args.personId), eq(dossierPeople.userId, user.id))).returning()
      await tx.insert(dossierComments).values({
        userId: user.id,
        personId: current.id,
        personName: updated.name,
        targetType: 'person',
        targetId: current.id,
        action: 'update',
        actor: 'ai',
        comment: `Updated through MCP: ${changes.join('; ')}.`,
      })
      return updated
    })
    value = person ?? { error: 'Dosier person not found' }
  } else if (name === 'delete_dossier_person') {
    if (!Number.isSafeInteger(args.personId) || args.personId < 1) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid Dosier person ID' } })
    }
    const deleted = await db.transaction(async (tx) => {
      const [person] = await tx.select().from(dossierPeople)
        .where(and(eq(dossierPeople.id, args.personId), eq(dossierPeople.userId, user.id))).limit(1)
      if (!person) return undefined
      const [history, reflections] = await Promise.all([
        tx.select().from(dossierHistory).where(and(eq(dossierHistory.personId, person.id), eq(dossierHistory.userId, user.id))),
        tx.select().from(dossierReflections).where(and(eq(dossierReflections.personId, person.id), eq(dossierReflections.userId, user.id))),
      ])
      const deletedRecords = [
        ...history.map((record) => ({
          userId: user.id, personId: person.id, personName: person.name,
          targetType: 'history' as const, targetId: record.id, action: 'delete' as const, actor: 'ai' as const,
          comment: `Removed with the Dosier person: ${record.title ? `“${record.title}”` : 'history record'} — “${record.content}”`,
        })),
        ...reflections.map((record) => ({
          userId: user.id, personId: person.id, personName: person.name,
          targetType: 'reflection' as const, targetId: record.id, action: 'delete' as const, actor: 'ai' as const,
          comment: `Removed with the Dosier person: ${record.actor === 'ai' ? 'AI' : 'personal'} reflection — “${record.content}”`,
        })),
      ]
      if (deletedRecords.length > 0) await tx.insert(dossierComments).values(deletedRecords)
      await tx.delete(dossierHistory).where(and(eq(dossierHistory.personId, person.id), eq(dossierHistory.userId, user.id)))
      await tx.delete(dossierReflections).where(and(eq(dossierReflections.personId, person.id), eq(dossierReflections.userId, user.id)))
      await tx.insert(dossierComments).values({
        userId: user.id, personId: person.id, personName: person.name,
        targetType: 'person', targetId: person.id, action: 'delete', actor: 'ai',
        comment: `Deleted Dosier person “${person.name}” and ${history.length} history records plus ${reflections.length} reflections through MCP.`,
      })
      await tx.delete(dossierPeople).where(and(eq(dossierPeople.id, person.id), eq(dossierPeople.userId, user.id)))
      return { deleted: true, personId: person.id, historyCount: history.length, reflectionCount: reflections.length }
    })
    value = deleted ?? { error: 'Dosier person not found' }
  } else if (name === 'create_dossier_history') {
    const sourceType = args.sourceType ?? 'manual'
    const occurredAt = args.occurredAt === undefined ? null : typeof args.occurredAt === 'string' ? new Date(args.occurredAt) : null
    if (!Number.isSafeInteger(args.personId) || args.personId < 1 || typeof args.content !== 'string' || !args.content.trim() || args.content.trim().length > 12000 || (args.title !== undefined && (typeof args.title !== 'string' || args.title.trim().length > 200)) || (args.occurredAt !== undefined && (!occurredAt || Number.isNaN(occurredAt.getTime()))) || !['manual', 'journal', 'ai'].includes(sourceType) || (args.sourceJournalEntryId !== undefined && (!Number.isSafeInteger(args.sourceJournalEntryId) || args.sourceJournalEntryId < 1)) || (sourceType === 'journal' && args.sourceJournalEntryId === undefined)) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid Dosier history fields' } })
    }
    let sourceJournalEntryId: number | null = null
    if (args.sourceJournalEntryId !== undefined) {
      const [sourceEntry] = await db.select({ id: journalEntries.id }).from(journalEntries)
        .where(and(eq(journalEntries.id, args.sourceJournalEntryId), eq(journalEntries.userId, user.id))).limit(1)
      if (!sourceEntry) return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Source journal entry not found' } })
      sourceJournalEntryId = sourceEntry.id
    }
    const record = await db.transaction(async (tx) => {
      const [person] = await tx.select().from(dossierPeople)
        .where(and(eq(dossierPeople.id, args.personId), eq(dossierPeople.userId, user.id))).limit(1)
      if (!person) return undefined
      const [created] = await tx.insert(dossierHistory).values({
        userId: user.id,
        personId: person.id,
        title: args.title?.trim() || null,
        content: args.content.trim(),
        occurredAt,
        sourceType: sourceType as DossierHistorySource,
        sourceJournalEntryId,
      }).returning()
      await tx.insert(dossierComments).values({
        userId: user.id,
        personId: person.id,
        personName: person.name,
        targetType: 'history',
        targetId: created.id,
        action: 'create',
        actor: 'ai',
        comment: `Added ${sourceType} history${created.title ? ` “${created.title}”` : ''}${occurredAt ? ` on ${occurredAt.toISOString().slice(0, 10)}` : ''}: “${created.content}”`,
      })
      return created
    })
    value = record ?? { error: 'Dosier person not found' }
  } else if (name === 'delete_dossier_history') {
    if (!Number.isSafeInteger(args.personId) || args.personId < 1 || !Number.isSafeInteger(args.recordId) || args.recordId < 1) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid Dosier history IDs' } })
    }
    const deleted = await db.transaction(async (tx) => {
      const [[person], [record]] = await Promise.all([
        tx.select().from(dossierPeople).where(and(eq(dossierPeople.id, args.personId), eq(dossierPeople.userId, user.id))).limit(1),
        tx.select().from(dossierHistory).where(and(eq(dossierHistory.id, args.recordId), eq(dossierHistory.personId, args.personId), eq(dossierHistory.userId, user.id))).limit(1),
      ])
      if (!person || !record) return undefined
      await tx.delete(dossierHistory).where(and(eq(dossierHistory.id, record.id), eq(dossierHistory.personId, person.id), eq(dossierHistory.userId, user.id)))
      await tx.insert(dossierComments).values({
        userId: user.id, personId: person.id, personName: person.name,
        targetType: 'history', targetId: record.id, action: 'delete', actor: 'ai',
        comment: `Removed history record${record.title ? ` “${record.title}”` : ''}: “${record.content}”`,
      })
      return { deleted: true, id: record.id }
    })
    value = deleted ?? { error: 'Dosier history record not found' }
  } else if (name === 'create_dossier_reflection') {
    const actor = args.actor ?? 'ai'
    if (!Number.isSafeInteger(args.personId) || args.personId < 1 || typeof args.content !== 'string' || !args.content.trim() || args.content.trim().length > 12000 || (actor !== 'me' && actor !== 'ai')) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid Dosier reflection fields' } })
    }
    const reflection = await db.transaction(async (tx) => {
      const [person] = await tx.select().from(dossierPeople)
        .where(and(eq(dossierPeople.id, args.personId), eq(dossierPeople.userId, user.id))).limit(1)
      if (!person) return undefined
      const [created] = await tx.insert(dossierReflections).values({
        userId: user.id,
        personId: person.id,
        content: args.content.trim(),
        actor,
      }).returning()
      await tx.insert(dossierComments).values({
        userId: user.id, personId: person.id, personName: person.name,
        targetType: 'reflection', targetId: created.id, action: 'create', actor: 'ai',
        comment: `Added an ${actor === 'ai' ? 'AI' : 'personal'} reflection through MCP: “${created.content}”`,
      })
      return created
    })
    value = reflection ?? { error: 'Dosier person not found' }
  } else if (name === 'delete_dossier_reflection') {
    if (!Number.isSafeInteger(args.personId) || args.personId < 1 || !Number.isSafeInteger(args.reflectionId) || args.reflectionId < 1) {
      return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid Dosier reflection IDs' } })
    }
    const deleted = await db.transaction(async (tx) => {
      const [[person], [reflection]] = await Promise.all([
        tx.select().from(dossierPeople).where(and(eq(dossierPeople.id, args.personId), eq(dossierPeople.userId, user.id))).limit(1),
        tx.select().from(dossierReflections).where(and(eq(dossierReflections.id, args.reflectionId), eq(dossierReflections.personId, args.personId), eq(dossierReflections.userId, user.id))).limit(1),
      ])
      if (!person || !reflection) return undefined
      await tx.delete(dossierReflections).where(and(eq(dossierReflections.id, reflection.id), eq(dossierReflections.personId, person.id), eq(dossierReflections.userId, user.id)))
      await tx.insert(dossierComments).values({
        userId: user.id, personId: person.id, personName: person.name,
        targetType: 'reflection', targetId: reflection.id, action: 'delete', actor: 'ai',
        comment: `Removed ${reflection.actor === 'ai' ? 'AI' : 'personal'} reflection: “${reflection.content}”`,
      })
      return { deleted: true, id: reflection.id }
    })
    value = deleted ?? { error: 'Dosier reflection not found' }
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
