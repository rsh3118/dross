import { randomUUID } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verification } from '@/lib/db/schema'
import { createOAuthToken, hashOAuthToken, verifyOAuthToken, verifyPkce } from '@/lib/mcp-oauth'

const ACCESS_TOKEN_TTL = 60 * 60
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60

function tokenResponse(accessToken: string, refreshToken: string, scope: string) {
  return NextResponse.json({ access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL, refresh_token: refreshToken, refresh_token_expires_in: REFRESH_TOKEN_TTL, scope }, { headers: { 'cache-control': 'no-store', pragma: 'no-cache', 'access-control-allow-origin': '*' } })
}

function invalidGrant() {
  return NextResponse.json({ error: 'invalid_grant' }, { status: 400, headers: { 'cache-control': 'no-store', pragma: 'no-cache', 'access-control-allow-origin': '*' } })
}

function createAccessToken(payload: { sub: string; scope: string }) {
  return createOAuthToken({ typ: 'mcp_access', sub: payload.sub, scope: payload.scope, exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL })
}

function createRefreshToken(payload: { sub: string; scope: string; clientId: string }) {
  const jti = randomUUID()
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000)
  const token = createOAuthToken({ typ: 'mcp_refresh', jti, sub: payload.sub, client_id: payload.clientId, scope: payload.scope, exp: Math.floor(expiresAt.getTime() / 1000) })
  return { token, jti, expiresAt }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, Accept' } })
}

export async function GET() {
  return NextResponse.json({ error: 'invalid_request', error_description: 'Token exchange requires POST.' }, { status: 400 })
}

export async function POST(request: Request) {
  let body: FormData
  try {
    body = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const grantType = String(body.get('grant_type') ?? '')
  const clientId = String(body.get('client_id') ?? '')

  if (grantType === 'authorization_code') {
    const code = String(body.get('code') ?? '')
    const verifier = String(body.get('code_verifier') ?? '')
    const redirectUri = String(body.get('redirect_uri') ?? '')
    const payload = verifyOAuthToken(code)
    if (!payload || payload.typ !== 'mcp_code' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string' || payload.client_id !== clientId || payload.redirect_uri !== redirectUri || !verifyPkce(verifier, String(payload.challenge))) return invalidGrant()

    const identifier = `mcp-oauth:code:${payload.sub}:${payload.jti}`
    const [consumed] = await db.delete(verification).where(and(eq(verification.identifier, identifier), eq(verification.value, hashOAuthToken(code)), gt(verification.expiresAt, new Date()))).returning({ id: verification.id })
    if (!consumed) return invalidGrant()

    const scope = String(payload.scope ?? '')
    const accessToken = createAccessToken({ sub: payload.sub, scope })
    const refresh = createRefreshToken({ sub: payload.sub, scope, clientId })
    try {
      await db.insert(verification).values({ id: randomUUID(), identifier: `mcp-oauth:refresh:${payload.sub}:${refresh.jti}`, value: hashOAuthToken(refresh.token), expiresAt: refresh.expiresAt })
    } catch {
      return NextResponse.json({ error: 'server_error' }, { status: 500 })
    }
    return tokenResponse(accessToken, refresh.token, scope)
  }

  if (grantType === 'refresh_token') {
    const refreshToken = String(body.get('refresh_token') ?? '')
    const payload = verifyOAuthToken(refreshToken)
    if (!payload || payload.typ !== 'mcp_refresh' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string' || payload.client_id !== clientId) return invalidGrant()

    const identifier = `mcp-oauth:refresh:${payload.sub}:${payload.jti}`
    const scope = String(payload.scope ?? '')
    const nextRefresh = createRefreshToken({ sub: payload.sub, scope, clientId })
    const accessToken = createAccessToken({ sub: payload.sub, scope })
    const rotated = await db.transaction(async (tx) => {
      const [consumed] = await tx.delete(verification).where(and(eq(verification.identifier, identifier), eq(verification.value, hashOAuthToken(refreshToken)), gt(verification.expiresAt, new Date()))).returning({ id: verification.id })
      if (!consumed) return false
      await tx.insert(verification).values({ id: randomUUID(), identifier: `mcp-oauth:refresh:${payload.sub}:${nextRefresh.jti}`, value: hashOAuthToken(nextRefresh.token), expiresAt: nextRefresh.expiresAt })
      return true
    })
    if (!rotated) return invalidGrant()
    return tokenResponse(accessToken, nextRefresh.token, scope)
  }

  return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 })
}
