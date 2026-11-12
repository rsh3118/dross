import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, wikiPages } from '@/lib/db/schema'
import { requireApiUser } from '@/lib/api-auth'

const tools = [
  { name: 'get_database_schema', description: 'Inspect the Dross database tables and columns.', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_tasks', description: 'List tasks belonging to the authenticated Dross user.', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
  { name: 'create_task', description: 'Create a task. Urgency is top, today, week, or backlog and defaults to top.', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, urgency: { type: 'string', enum: ['top', 'today', 'week', 'backlog'] } } } },
  { name: 'update_task', description: 'Update a task title or urgency.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'number' }, title: { type: 'string' }, urgency: { type: 'string', enum: ['top', 'today', 'week', 'backlog'] } } } },
  { name: 'list_wiki_pages', description: 'List wiki pages belonging to the authenticated Dross user.', inputSchema: { type: 'object', properties: {} } },
]

const schema = {
  tables: ['user', 'session', 'account', 'tasks', 'mountains', 'boulders', 'wiki_pages', 'wiki_revisions', 'wiki_links', 'interests', 'agent_runs', 'proposals', 'newsletters', 'notifications', 'settings', 'recordings', 'captured_tasks', 'journal_entries'],
  note: 'All data tools are authenticated and scoped to the current Dross user. Raw SQL is intentionally not exposed.',
}

function result(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version' } })
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

  if (body.method !== 'tools/call') return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } }, { status: 404 })

  let user: { id: string }
  try {
    user = await requireApiUser(request)
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      return new Response('Unauthorized', { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://www.dross.quest/.well-known/oauth-protected-resource", scope="mcp:read mcp:write mcp:schema"' } })
    }
    throw error
  }
  const name = body.params?.name
  const args = body.params?.arguments ?? {}
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
  else return NextResponse.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Unknown tool' } }, { status: 400 })

  const response = NextResponse.json({ jsonrpc: '2.0', id: body.id, result: result(value) })
  const sessionId = request.headers.get('Mcp-Session-Id')
  if (sessionId) response.headers.set('Mcp-Session-Id', sessionId)
  response.headers.set('Mcp-Protocol-Version', '2025-06-18')
  return response
}
