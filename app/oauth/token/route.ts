import { NextResponse } from 'next/server'
import { createOAuthToken, verifyOAuthToken, verifyPkce } from '@/lib/mcp-oauth'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, Accept' } })
}

export async function GET() {
  return NextResponse.json({ error: 'invalid_request', error_description: 'Token exchange requires POST.' }, { status: 400 })
}

export async function POST(request: Request) {
  const body = await request.formData()
  const code = String(body.get('code') ?? '')
  const verifier = String(body.get('code_verifier') ?? '')
  const grantType = String(body.get('grant_type') ?? '')
  const clientId = String(body.get('client_id') ?? '')
  const payload = verifyOAuthToken(code)
  if (!payload || payload.typ !== 'mcp_code' || payload.client_id !== clientId || grantType !== 'authorization_code' || !verifyPkce(verifier, String(payload.challenge))) return NextResponse.json({ error: 'invalid_grant' }, { status: 400 })
  const accessToken = createOAuthToken({ typ: 'mcp_access', sub: payload.sub, scope: payload.scope, exp: Math.floor(Date.now() / 1000) + 3600 })
  return NextResponse.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600, scope: payload.scope })
}
