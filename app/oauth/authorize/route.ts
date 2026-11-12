import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createOAuthToken, verifyOAuthToken } from '@/lib/mcp-oauth'

function getClient(requestUrl: string) {
  const url = new URL(requestUrl)
  const redirectUri = url.searchParams.get('redirect_uri')
  const challenge = url.searchParams.get('code_challenge')
  const clientId = url.searchParams.get('client_id') ?? ''
  const client = verifyOAuthToken(clientId)
  const isClaude = clientId === 'https://claude.ai/oauth/mcp-oauth-client-metadata'
  const redirects = isClaude ? ['https://claude.ai/api/mcp/auth_callback'] : Array.isArray(client?.redirect_uris) ? client.redirect_uris : []
  if (!redirectUri || !challenge || (!isClaude && client?.typ !== 'mcp_client') || !redirects.includes(redirectUri) || url.searchParams.get('code_challenge_method') !== 'S256') return null
  return { url, redirectUri, challenge, clientId, clientName: isClaude ? 'Claude' : String(client?.name ?? 'MCP client') }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

function issueCode(input: { userId: string; challenge: string; clientId: string; redirectUri: string; scope: string; state: string | null }) {
  const code = createOAuthToken({ typ: 'mcp_code', sub: input.userId, challenge: input.challenge, client_id: input.clientId, redirect_uri: input.redirectUri, scope: input.scope, exp: Math.floor(Date.now() / 1000) + 300 })
  const callback = new URL(input.redirectUri)
  callback.searchParams.set('code', code)
  if (input.state) callback.searchParams.set('state', input.state)
  return callback
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, Accept' } })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.redirect(new URL(`/sign-in?callbackUrl=${encodeURIComponent(`${url.pathname}${url.search}`)}`, url.origin))
  const client = getClient(request.url)
  if (!client) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const scope = url.searchParams.get('scope') ?? 'mcp:read mcp:write mcp:schema'
  const safeClientName = escapeHtml(client.clientName)
  const safeScope = escapeHtml(scope)
  return new NextResponse(`<!doctype html><html><head><title>Authorize ${safeClientName}</title></head><body style="font-family:system-ui;max-width:560px;margin:12vh auto;padding:24px;background:#0b0d12;color:#f4f4f5"><h1>Authorize ${safeClientName}</h1><p>${safeClientName} is requesting access to your Dross account.</p><p>Requested access: <strong>${safeScope}</strong></p><form method="post"><input type="hidden" name="${'oauth'}" value="${encodeURIComponent(url.searchParams.toString())}"/><button name="decision" value="deny" style="margin-right:8px;padding:10px 16px">Deny</button><button name="decision" value="allow" style="padding:10px 16px">Allow access</button></form></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function POST(request: Request) {
  const form = await request.formData()
  const query = String(form.get('oauth') ?? '')
  const url = new URL(`/oauth/authorize?${decodeURIComponent(query)}`, request.url)
  const session = await auth.api.getSession({ headers: await headers() })
  const client = getClient(url.toString())
  if (!session?.user || !client) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  if (form.get('decision') !== 'allow') return NextResponse.json({ error: 'access_denied' }, { status: 403 })
  return NextResponse.redirect(issueCode({ userId: session.user.id, challenge: client.challenge, clientId: client.clientId, redirectUri: client.redirectUri, scope: url.searchParams.get('scope') ?? 'mcp:read mcp:write mcp:schema', state: url.searchParams.get('state') }))
}
