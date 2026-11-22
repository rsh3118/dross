import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, wikiPages, type WikiStatus } from '@/lib/db/schema'
import { requireApiUser } from '@/lib/api-auth'
import { createWikiPage, updateWikiPage } from '@/lib/wiki'

const tools = [
  { name: 'get_database_schema', description: 'Inspect the Dross database tables and columns.', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_tasks', description: 'List tasks belonging to the authenticated Dross user.', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
  { name: 'create_task', description: 'Create a task. Urgency is top, today, week, or backlog and defaults to top.', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, urgency: { type: 'string', enum: ['top', 'today', 'week', 'backlog'] } } } },
  { name: 'update_task', description: 'Update a task title or urgency.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'number' }, title: { type: 'string' }, urgency: { type: 'string', enum: ['top', 'today', 'week', 'backlog'] } } } },
  { name: 'list_wiki_pages', description: 'List wiki pages belonging to the authenticated Dross user.', inputSchema: { type: 'object', properties: {} } },
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
  const requiredScope = name === 'get_database_schema' ? 'mcp:schema' : ['list_tasks', 'list_wiki_pages'].includes(name) ? 'mcp:read' : ['create_task', 'update_task', 'create_wiki_page', 'update_wiki_page'].includes(name) ? 'mcp:write' : null
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
  } else if (name === 'list_wiki_pages') value = await db.select().from(wikiPages).where(eq(wikiPages.userId, user.id))
  else if (name === 'create_wiki_page') {
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
