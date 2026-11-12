import { eq } from 'drizzle-orm'
import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gmailConnections } from '@/lib/db/schema'
import {
  encryptToken,
  gmailClient,
  readState,
} from '@/lib/gmail-oauth'

function resultUrl(requestUrl: string, status: string, reason?: string) {
  const origin = new URL(requestUrl).origin
  const target = new URL('/settings/gmail', origin)
  target.searchParams.set('gmail', status)
  if (reason) target.searchParams.set('reason', reason.slice(0, 180))
  return target
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return NextResponse.redirect(resultUrl(request.url, 'error'))

  try {
    const { userId } = readState(state)
    const client = gmailClient()
    const { tokens } = await client.getToken(code)
    if (!tokens.refresh_token) {
      throw new Error('Google did not return a refresh token. Revoke dross access in Google Account permissions and reconnect.')
    }

    client.setCredentials(tokens)
    const gmail = google.gmail({ version: 'v1', auth: client })
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const now = new Date()

    await db
      .insert(gmailConnections)
      .values({
        id: crypto.randomUUID(),
        userId,
        accessToken: tokens.access_token ? encryptToken(tokens.access_token) : null,
        refreshToken: encryptToken(tokens.refresh_token),
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scope: tokens.scope ?? null,
        email: profile.data.emailAddress ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: gmailConnections.userId,
        set: {
          accessToken: tokens.access_token ? encryptToken(tokens.access_token) : undefined,
          refreshToken: encryptToken(tokens.refresh_token),
          expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          scope: tokens.scope ?? null,
          email: profile.data.emailAddress ?? null,
          updatedAt: now,
        },
      })

    return NextResponse.redirect(resultUrl(request.url, 'connected'))
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'OAuth callback failed'
    console.error('[gmail] OAuth callback failed', error)
    return NextResponse.redirect(resultUrl(request.url, 'error', reason))
  }
}

