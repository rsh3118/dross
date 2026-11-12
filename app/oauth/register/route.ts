import { NextResponse } from 'next/server'
import { createOAuthToken } from '@/lib/mcp-oauth'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, Accept' } })
}

export async function GET() {
  return NextResponse.json({ error: 'invalid_request', error_description: 'Client registration requires POST.' }, { status: 400 })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((value: unknown) => typeof value === 'string') : []
  if (!redirectUris.length) return NextResponse.json({ error: 'invalid_client_metadata' }, { status: 400 })
  const clientId = createOAuthToken({ typ: 'mcp_client', name: body.client_name ?? 'MCP client', redirect_uris: redirectUris, exp: Math.floor(Date.now() / 1000) + 31536000 })
  return NextResponse.json({ client_id: clientId, client_name: body.client_name ?? 'MCP client', token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] }, { status: 201 })
}
