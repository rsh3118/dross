import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { verification } from '@/lib/db/schema'
import { auth } from '@/lib/auth'
import { createOAuthToken, hashOAuthToken, verifyOAuthToken } from '@/lib/mcp-oauth'

const CLAUDE_CLIENT_ID = 'https://claude.ai/oauth/mcp-oauth-client-metadata'
const CLAUDE_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback'
const ALLOWED_SCOPES = new Set(['mcp:read', 'mcp:write', 'mcp:schema'])

function isLoopbackRedirectUri(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && !url.username && !url.password && !url.hash && Boolean(url.port) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

function getClient(requestUrl: string) {
  const url = new URL(requestUrl)
  const redirectUri = url.searchParams.get('redirect_uri')
  const challenge = url.searchParams.get('code_challenge')
  const clientId = url.searchParams.get('client_id') ?? ''
  const client = verifyOAuthToken(clientId)
  const isClaude = clientId === CLAUDE_CLIENT_ID
  const redirects = isClaude ? [CLAUDE_REDIRECT_URI] : Array.isArray(client?.redirect_uris) ? client.redirect_uris : []
  const redirectAllowed = Boolean(redirectUri && (redirects.includes(redirectUri) || isLoopbackRedirectUri(redirectUri)))
  const scopes = (url.searchParams.get('scope') ?? 'mcp:read mcp:write mcp:schema').split(/\s+/).filter(Boolean)
  if (!redirectAllowed || !challenge || (!isClaude && client?.typ !== 'mcp_client') || url.searchParams.get('code_challenge_method') !== 'S256' || scopes.some((scope) => !ALLOWED_SCOPES.has(scope))) return null
  return { url, redirectUri: redirectUri!, challenge, clientId, clientName: isClaude ? 'Claude' : String(client?.name ?? 'MCP client'), scope: scopes.join(' ') }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

async function issueCode(input: { userId: string; challenge: string; clientId: string; redirectUri: string; scope: string; state: string | null }) {
  const jti = randomUUID()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
  const code = createOAuthToken({ typ: 'mcp_code', jti, sub: input.userId, challenge: input.challenge, client_id: input.clientId, redirect_uri: input.redirectUri, scope: input.scope, exp: Math.floor(expiresAt.getTime() / 1000) })
  await db.insert(verification).values({ id: randomUUID(), identifier: `mcp-oauth:code:${input.userId}:${jti}`, value: hashOAuthToken(code), expiresAt })
  const callback = new URL(input.redirectUri)
  callback.searchParams.set('code', code)
  if (input.state) callback.searchParams.set('state', input.state)
  return callback
}

function signInRedirect(requestUrl: string, callback: string) {
  const url = new URL(requestUrl)
  return NextResponse.redirect(new URL(`/sign-in?callbackUrl=${encodeURIComponent(callback)}`, url.origin), 303)
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, Accept' } })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const client = getClient(request.url)
  if (!client) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return signInRedirect(request.url, `${url.pathname}${url.search}`)
  const safeClientName = escapeHtml(client.clientName)
  const safeScope = escapeHtml(client.scope)
  const safeQuery = escapeHtml(url.searchParams.toString())
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize ${safeClientName}</title></head><body style="font-family:system-ui;max-width:560px;margin:12vh auto;padding:24px;background:#0b0d12;color:#f4f4f5"><h1>Authorize ${safeClientName}</h1><p>${safeClientName} is requesting access to your Dross account.</p><p>Requested access: <strong>${safeScope}</strong></p><form method="post"><input type="hidden" name="oauth" value="${safeQuery}"><button name="decision" value="deny" style="margin-right:8px;padding:10px 16px">Deny</button><button name="decision" value="allow" style="padding:10px 16px">Allow access</button></form></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}

export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const query = String(form.get('oauth') ?? '')
  const authorizeUrl = new URL('/oauth/authorize', request.url)
  authorizeUrl.search = new URLSearchParams(query).toString()
  const client = getClient(authorizeUrl.toString())
  if (!client) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return signInRedirect(request.url, `${authorizeUrl.pathname}${authorizeUrl.search}`)
  if (form.get('decision') !== 'allow') return NextResponse.json({ error: 'access_denied' }, { status: 403 })
  try {
    const callback = await issueCode({ userId: session.user.id, challenge: client.challenge, clientId: client.clientId, redirectUri: client.redirectUri, scope: client.scope, state: authorizeUrl.searchParams.get('state') })
    // OAuth consent is a form POST; 303 is required so the client callback receives GET, not a replayed POST.
    return NextResponse.redirect(callback, 303)
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
