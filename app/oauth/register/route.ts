import { NextResponse } from 'next/server'
import { createOAuthToken } from '@/lib/mcp-oauth'

function isAllowedRedirectUri(value: string) {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash) return false
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && Boolean(url.port) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, Accept' } })
}

export async function GET() {
  return NextResponse.json({ error: 'invalid_request', error_description: 'Client registration requires POST.' }, { status: 400 })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || !Array.isArray(body.redirect_uris)) return NextResponse.json({ error: 'invalid_client_metadata' }, { status: 400 })
  const redirectUris = [...new Set(body.redirect_uris.filter((value: unknown): value is string => typeof value === 'string' && isAllowedRedirectUri(value)))]
  if (!redirectUris.length || redirectUris.length !== body.redirect_uris.length) return NextResponse.json({ error: 'invalid_client_metadata' }, { status: 400 })
  const clientName = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0, 120) : 'MCP client'
  const clientId = createOAuthToken({ typ: 'mcp_client', name: clientName, redirect_uris: redirectUris, exp: Math.floor(Date.now() / 1000) + 31536000 })
  return NextResponse.json({ client_id: clientId, client_name: clientName, client_id_issued_at: Math.floor(Date.now() / 1000), token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], redirect_uris: redirectUris }, { status: 201, headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } })
}
